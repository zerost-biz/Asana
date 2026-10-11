import { describe, expect, it } from 'vitest'
import { MONDAY, wbs } from '../test/factories'
import type { Assignment, Capacity, Opportunity, Project, User } from './types'
import { DEFAULT_SETTINGS } from './types'
import {
  allocateWorkload,
  buildAssignLoads,
  buildUnassigned,
  buildWeeks,
  buildWorkloadMatrix,
  cellLevel,
  cellOf,
  cellRatio,
  loadLevel,
  sliceMatrix,
  spreadHours,
} from './workload'

const weeks = buildWeeks(MONDAY, 12)
const user = (id: string, cap = 40): User => ({
  id, name: id, initials: id, email: '', role: 'member', team: 't', jobTitle: '', weeklyCapacity: cap, hourlyRate: 0, status: 'active', strengths: [],
})
const U = [user('u-k'), user('u-h')]

describe('週と配分', () => {
  it('今週〜+3週のラベルと、12週分の長さ', () => {
    expect(weeks.slice(0, 4).map((w) => w.label)).toEqual(['今週', '来週', '+2週', '+3週'])
    expect(weeks).toHaveLength(12)
    expect(weeks[0].startISO).toBe('2026-10-12')
  })

  it('開始〜終了の稼働日へ均等に配分される（10/12〜10/21: 稼働日8日 → 16h は 今週10h・来週6h）', () => {
    const m = spreadHours('2026-10-12', '2026-10-21', 16, weeks)
    expect(m.get(0)).toBeCloseTo(10)
    expect(m.get(1)).toBeCloseTo(6)
  })

  it('遅延（終了日が今週より前）はすべて今週に入る', () => {
    expect([...spreadHours('2026-09-01', '2026-09-10', 12, weeks)]).toEqual([[0, 12]])
  })

  it('稼働日がない期間（土日だけ）は開始日の週に入る', () => {
    expect(spreadHours('2026-10-17', '2026-10-18', 8, weeks).get(0)).toBe(8)
  })

  it('表示範囲より先の分は含めない', () => {
    expect(spreadHours('2027-03-01', '2027-03-05', 8, weeks).size).toBe(0)
  })

  it('開始が過去でも、今週の月曜から配分する', () => {
    const m = spreadHours('2026-10-01', '2026-10-23', 30, weeks)
    expect(m.get(0)! + m.get(1)! + (m.get(2) ?? 0)).toBeCloseTo(30)
  })
})

describe('確定した作業の配分（WBS）', () => {
  it('完了・マイルストーン・担当なしは対象外', () => {
    const a = allocateWorkload(
      [wbs({ id: 'a', status: 'done' }), wbs({ id: 'b', type: 'milestone' }), wbs({ id: 'c', ownerId: null }), wbs({ id: 'd' })],
      weeks,
    )
    expect(a.map((x) => x.wbsId)).toEqual(['d'])
  })

  it('週別の手修正（override）は自動配分より優先される', () => {
    const item = wbs({ id: 'a', etcHours: 20, startDate: '2026-10-12', endDate: '2026-10-23' })
    const auto = allocateWorkload([item], weeks)
    expect(auto.find((x) => x.weekIndex === 0)!.hours).toBeCloseTo(10)
    const manual = allocateWorkload([item], weeks, [{ wbsId: 'a', weekStart: '2026-10-12', hours: 16 }])
    const w0 = manual.find((x) => x.weekIndex === 0)!
    expect(w0.hours).toBe(16)
    expect(w0.manual).toBe(true)
    expect(manual.find((x) => x.weekIndex === 1)!.manual).toBeFalsy()
  })
})

describe('負荷率（Committed / Expected / Available）', () => {
  it('85%未満=通常 / 85〜100%=注意 / 100%超=過負荷（設定で変更可）', () => {
    expect(loadLevel(0.84)).toBe('normal')
    expect(loadLevel(0.85)).toBe('caution')
    expect(loadLevel(1)).toBe('caution')
    expect(loadLevel(1.01)).toBe('warn')
    expect(loadLevel(0.9, { loadCaution: 0.95, loadWarn: 1.1 })).toBe('normal')
    expect(loadLevel(1.05, { loadCaution: 0.95, loadWarn: 1.1 })).toBe('caution')
  })

  const matrixOf = (opts: { allocs?: ReturnType<typeof allocateWorkload>; loads?: ReturnType<typeof buildAssignLoads>; caps?: Capacity[] }) =>
    buildWorkloadMatrix({ users: U, allocations: opts.allocs ?? [], assignLoads: opts.loads ?? [], unassigned: [], capacities: opts.caps ?? [], settings: DEFAULT_SETTINGS }, weeks)

  it('Utilization = Committed / Available（Available = 標準 − 休暇等）', () => {
    const m = matrixOf({
      allocs: [{ userId: 'u-k', wbsId: 'a', projectId: 'p', weekIndex: 0, hours: 32 }],
      caps: [{ userId: 'u-k', weekStart: '2026-10-12', unavailableHours: 8, note: '有給' }],
    })
    const c = cellOf(m, 'u-k', 0)!
    expect(c.base).toBe(40)
    expect(c.unavailable).toBe(8)
    expect(c.capacity).toBe(32)
    expect(c.planned).toBe(32)
    expect(c.utilization).toBeCloseTo(1)
    expect(c.level).toBe('caution') // ちょうど100%は警告にしない
    expect(c.capacityNote).toBe('有給')
  })

  it('Forecast = (Committed + Expected) / Available。Expected は 配置 × 確度', () => {
    const opp = { id: 'o', stage: 'evaluation', probability: 50 } as Opportunity
    const asg: Assignment[] = [{ id: 'a1', targetType: 'opportunity', targetId: 'o', userId: 'u-k', role: 'r', weekStart: '2026-10-12', plannedHours: 20, status: 'tentative', batchId: 'b' }]
    const loads = buildAssignLoads(asg, weeks, { opportunities: [opp], projects: [], projectsWithWbs: new Set() })
    const m = matrixOf({ allocs: [{ userId: 'u-k', wbsId: 'a', projectId: 'p', weekIndex: 0, hours: 30 }], loads })
    const c = cellOf(m, 'u-k', 0)!
    expect(c.planned).toBe(30)
    expect(c.expected).toBeCloseTo(10) // 20h × 50%
    expect(c.utilization).toBeCloseTo(0.75)
    expect(c.forecastUtilization).toBeCloseTo(1)
    expect(cellRatio(c, false)).toBeCloseTo(0.75)
    expect(cellRatio(c, true)).toBeCloseTo(1)
    expect(cellLevel(c, false)).toBe('normal')
  })

  it('Available が 0 のとき、予定があれば過負荷扱い', () => {
    const m = matrixOf({ allocs: [{ userId: 'u-k', wbsId: 'a', projectId: 'p', weekIndex: 0, hours: 4 }], caps: [{ userId: 'u-k', weekStart: '2026-10-12', unavailableHours: 40 }] })
    expect(cellOf(m, 'u-k', 0)!.level).toBe('warn')
  })

  it('sliceMatrix は先頭 n 週だけに切り出す', () => {
    const m = sliceMatrix(matrixOf({}), 4)
    expect(m.weeks).toHaveLength(4)
    expect(m.cells[0]).toHaveLength(4)
  })
})

describe('配置・案件の需要', () => {
  const ctxBase = { opportunities: [] as Opportunity[], projects: [] as Project[], projectsWithWbs: new Set<string>() }
  const asg = (o: Partial<Assignment> = {}): Assignment => ({
    id: 'a', targetType: 'project', targetId: 'p1', userId: 'u-k', role: 'PJリード', weekStart: '2026-10-12', plannedHours: 10, status: 'confirmed', batchId: 'b', ...o,
  })

  it('WBS を持つプロジェクトの配置は二重計上しない / WBS がなければ確定として計上', () => {
    const p = { id: 'p1', status: 'active' } as Project
    expect(buildAssignLoads([asg()], weeks, { ...ctxBase, projects: [p], projectsWithWbs: new Set(['p1']) })).toHaveLength(0)
    const l = buildAssignLoads([asg()], weeks, { ...ctxBase, projects: [p] })
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ kind: 'committed', weight: 1 })
  })

  it('PJ化済み・見送りの案件の配置は計上しない', () => {
    const o = (stage: Opportunity['stage']) => ({ id: 'o', stage, probability: 70 }) as Opportunity
    const a = asg({ targetType: 'opportunity', targetId: 'o' })
    expect(buildAssignLoads([a], weeks, { ...ctxBase, opportunities: [o('converted')] })).toHaveLength(0)
    expect(buildAssignLoads([a], weeks, { ...ctxBase, opportunities: [o('lost')] })).toHaveLength(0)
    expect(buildAssignLoads([a], weeks, { ...ctxBase, opportunities: [o('evaluation')] })[0]).toMatchObject({ kind: 'expected', weight: 0.7 })
  })

  it('未配置の需要 = 役割ごとの必要工数 − 配置済み（確度で重み付け）', () => {
    const opp = {
      id: 'o', stage: 'candidate', probability: 50, startDate: '2026-10-12', endDate: '2026-10-16',
      demands: [{ role: 'PJリード', hours: 20, skillIds: [] }],
    } as unknown as Opportunity
    const none = buildUnassigned([], weeks, { ...ctxBase, opportunities: [opp] }, 40)
    expect(none[0]).toMatchObject({ role: 'PJリード', weekIndex: 0, weight: 0.5 })
    expect(none[0].hours).toBeCloseTo(20)
    const half = buildUnassigned([asg({ targetType: 'opportunity', targetId: 'o', plannedHours: 20 })], weeks, { ...ctxBase, opportunities: [opp] }, 40)
    expect(half).toHaveLength(0)
  })
})
