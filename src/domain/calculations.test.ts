import { describe, expect, it } from 'vitest'
import { createSeed } from '../data/seed'
import {
  computeAllMetrics,
  computeProjectHealth,
  indexWbs,
  isParent,
  leafItems,
  leafMetrics,
  projectMetrics,
  wbsNumbering,
} from './calculations'
import { buildWeeks, allocateWorkload, buildWorkloadMatrix, loadLevel } from './workload'
import type { TimeEntry, WbsItem } from './types'

// 2026-10-12 は月曜日
const TODAY = new Date(2026, 9, 12)

const base: WbsItem = {
  id: 'x',
  projectId: 'p',
  parentId: null,
  title: 't',
  ownerId: 'u-k',
  startDate: '2026-10-12',
  endDate: '2026-10-16',
  planHours: 10,
  etcHours: 5,
  progress: 0,
  status: 'In progress',
}

describe('工数の定義', () => {
  it('EAC = ACT + ETC / Variance = EAC - PLAN / Burn = ACT / PLAN', () => {
    const m = leafMetrics(36, 24, 16)
    expect(m.eac).toBe(40)
    expect(m.variance).toBe(4)
    expect(m.burn).toBeCloseTo(24 / 36)
  })

  it('ETC は進捗率から自動算出されない（progress を変えても ETC は不変）', () => {
    const items: WbsItem[] = [{ ...base, planHours: 36, etcHours: 16, progress: 10 }]
    const m1 = computeAllMetrics(items, [])
    const m2 = computeAllMetrics([{ ...items[0], progress: 90 }], [])
    expect(m1.get('x')!.etc).toBe(16)
    expect(m2.get('x')!.etc).toBe(16)
  })

  it('ACT は TimeEntry の wbsId 別合計。追加すると ACT/EAC/Variance が即再計算される', () => {
    const items: WbsItem[] = [{ ...base, planHours: 36, etcHours: 16 }]
    const e = (h: number, i: number): TimeEntry => ({ id: `e${i}`, wbsId: 'x', userId: 'u-k', date: '2026-10-12', hours: h, comment: '' })
    const before = computeAllMetrics(items, [e(24, 1)]).get('x')!
    expect([before.act, before.etc, before.eac, before.variance]).toEqual([24, 16, 40, 4])

    const after = computeAllMetrics(items, [e(24, 1), e(3, 2)]).get('x')!
    expect(after.act).toBe(27) // +3h
    // ETC を 12h に更新 → EAC = 27 + 12 = 39, Variance = +3
    const after2 = computeAllMetrics([{ ...items[0], etcHours: 12 }], [e(24, 1), e(3, 2)]).get('x')!
    expect([after2.act, after2.eac, after2.variance]).toEqual([27, 39, 3])
  })

  it('親は子の PLAN/ACT/ETC/EAC の合計、進捗は PLAN 加重', () => {
    const items: WbsItem[] = [
      { ...base, id: 'p1', parentId: null, planHours: 0, etcHours: 0 },
      { ...base, id: 'c1', parentId: 'p1', planHours: 20, etcHours: 0, progress: 100, status: 'Done' },
      { ...base, id: 'c2', parentId: 'p1', planHours: 60, etcHours: 40, progress: 50 },
    ]
    const entries: TimeEntry[] = [
      { id: 'e1', wbsId: 'c1', userId: 'u-k', date: '2026-10-12', hours: 22, comment: '' },
      { id: 'e2', wbsId: 'c2', userId: 'u-k', date: '2026-10-12', hours: 20, comment: '' },
    ]
    const ms = computeAllMetrics(items, entries)
    const p = ms.get('p1')!
    expect([p.plan, p.act, p.etc, p.eac, p.variance]).toEqual([80, 42, 40, 82, 2])
    expect(p.progress).toBeCloseTo((100 * 20 + 50 * 60) / 80)
    expect(p.isParent).toBe(true)
    expect(p.status).toBe('In progress')
  })
})

describe('Workload', () => {
  const weeks = buildWeeks(TODAY)

  it('週は今週〜+3週の4つ', () => {
    expect(weeks.map((w) => w.label)).toEqual(['今週', '来週', '+2週', '+3週'])
    expect(weeks[0].startISO).toBe('2026-10-12')
  })

  it('ETC は開始〜終了の稼働日へ均等配分される', () => {
    // 10/12(月)〜10/21(水): 稼働日 8日 → 16h なら 2h/日 → 今週10h / 来週6h
    const it: WbsItem = { ...base, startDate: '2026-10-12', endDate: '2026-10-21', etcHours: 16 }
    const a = allocateWorkload([it], weeks)
    expect(a.find((x) => x.weekIndex === 0)!.hours).toBeCloseTo(10)
    expect(a.find((x) => x.weekIndex === 1)!.hours).toBeCloseTo(6)
  })

  it('遅延タスクの残工数は今週に計上、Done は対象外', () => {
    const late: WbsItem = { ...base, id: 'late', startDate: '2026-09-01', endDate: '2026-09-10', etcHours: 12 }
    const done: WbsItem = { ...base, id: 'done', status: 'Done', etcHours: 8 }
    const a = allocateWorkload([late, done], weeks)
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ wbsId: 'late', weekIndex: 0, hours: 12 })
  })

  it('負荷レベル: 85%未満=通常 / 85〜100%=注意 / 100%超=警告', () => {
    expect(loadLevel(0.84)).toBe('normal')
    expect(loadLevel(0.85)).toBe('caution')
    expect(loadLevel(1)).toBe('caution')
    expect(loadLevel(1.01)).toBe('warn')
  })
})

describe('seed', () => {
  const data = createSeed(TODAY)
  const idx = indexWbs(data.wbs)
  const metrics = computeAllMetrics(data.wbs, data.timeEntries)
  const numbers = wbsNumbering(idx, data.projects)

  it('受入基準: As-Is整理 = PLAN36 / ACT24 / ETC16 / EAC40 / Variance+4', () => {
    const asis = data.wbs.find((w) => w.title === 'As-Is整理')!
    expect(numbers.get(asis.id)).toBe('1.3')
    const m = metrics.get(asis.id)!
    expect([m.plan, m.act, m.etc, m.eac, m.variance]).toEqual([36, 24, 16, 40, 4])
  })

  it('Health: B社=WATCH / A社=GOOD / C社=RISK / GTM=GOOD', () => {
    const today = '2026-10-12'
    const got: Record<string, string> = {}
    for (const p of data.projects) {
      const pm = projectMetrics(p.id, idx, metrics)
      const leaves = leafItems(data.wbs.filter((w) => w.projectId === p.id), idx).map((l) => metrics.get(l.id)!)
      got[p.id] = computeProjectHealth(p, pm, leaves, data.risks, today).health
    }
    expect(got).toEqual({ bmes: 'WATCH', asaas: 'GOOD', csmart: 'RISK', gtm: 'GOOD' })
  })

  it('どの曜日に開いても Health が同じ（週末でも A社/GTM が遅延扱いにならない）', () => {
    for (let d = 0; d < 7; d++) {
      const day = new Date(2026, 9, 12 + d) // 月〜日
      const seed = createSeed(day)
      const sIdx = indexWbs(seed.wbs)
      const sMetrics = computeAllMetrics(seed.wbs, seed.timeEntries)
      const todayISO = `2026-10-${String(12 + d).padStart(2, '0')}`
      const got: Record<string, string> = {}
      for (const p of seed.projects) {
        const pm = projectMetrics(p.id, sIdx, sMetrics)
        const leaves = leafItems(seed.wbs.filter((w) => w.projectId === p.id), sIdx).map((l) => sMetrics.get(l.id)!)
        got[p.id] = computeProjectHealth(p, pm, leaves, seed.risks, todayISO).health
      }
      expect(got, `day offset ${d}`).toEqual({ bmes: 'WATCH', asaas: 'GOOD', csmart: 'RISK', gtm: 'GOOD' })
    }
  })

  it('A社は進捗が工数消化より先行 / B社はEAC超過', () => {
    const a = projectMetrics('asaas', idx, metrics)
    expect(a.progress / 100).toBeGreaterThan(a.burn!)
    expect(projectMetrics('bmes', idx, metrics).variance).toBeGreaterThan(0)
  })

  it('Workload が 60〜120%超まで散らばり、100%超が存在する', () => {
    const leaves = leafItems(data.wbs, idx)
    const weeks = buildWeeks(TODAY)
    const matrix = buildWorkloadMatrix(data.users, allocateWorkload(leaves, weeks), weeks)
    const table = matrix.users.map((u, ui) => `${u.initials}: ` + matrix.cells[ui].map((c) => (c.utilization * 100).toFixed(1) + '%').join(' / '))
    console.log('\n' + table.join('\n'))
    const all = matrix.cells.flat().map((c) => c.utilization)
    expect(Math.min(...all)).toBeGreaterThanOrEqual(0.55)
    expect(Math.max(...all)).toBeGreaterThan(1.1)
    expect(matrix.cells.flat().some((c) => c.level === 'warn')).toBe(true)
  })

  it('最下位タスクだけが TimeEntry を持つ', () => {
    for (const e of data.timeEntries) expect(isParent(idx, e.wbsId)).toBe(false)
  })

  it('プロジェクト集計をログ出力', () => {
    for (const p of data.projects) {
      const pm = projectMetrics(p.id, idx, metrics)
      console.log(p.name, { plan: pm.plan, act: pm.act, etc: pm.etc, eac: pm.eac, var: pm.variance, prog: Math.round(pm.progress), burn: Math.round((pm.burn ?? 0) * 100) })
    }
  })
})
