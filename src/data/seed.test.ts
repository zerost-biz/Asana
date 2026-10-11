import { describe, expect, it } from 'vitest'
import { MONDAY } from '../test/factories'
import { buildDerived } from '../store/derived'
import { isParent } from '../domain/calculations'
import { daysBetween } from '../domain/dates'
import { createSeed } from './seed'

const seed = createSeed(MONDAY)
const d = buildDerived(seed, MONDAY)

describe('デモデータ（seed）の受入基準', () => {
  it('B社 MES構想 の As-Is整理 = PLAN36 / ACT24 / ETC16 / EAC40 / 差異+4（WBS番号 1.3）', () => {
    const asis = seed.wbs.find((w) => w.title === 'As-Is整理')!
    expect(d.numbers.get(asis.id)).toBe('1.3')
    const m = d.metrics.get(asis.id)!
    expect([m.plan, m.act, m.etc, m.eac, m.variance]).toEqual([36, 24, 16, 40, 4])
  })

  it('状態: B社=注意 / A社 SaaS=順調 / C社 SCADA=危険 / 新商材GTM=順調', () => {
    const h = (id: string) => d.summaryById.get(id)!.health.health
    expect([h('bmes'), h('asaas'), h('cscada'), h('gtm')]).toEqual(['WATCH', 'GOOD', 'RISK', 'GOOD'])
  })

  it('3階層以上のWBS（フェーズ > 作業パッケージ > タスク）とマイルストーン・先行タスク・成果物URLがある', () => {
    const depth = (id: string): number => {
      let n = 0
      let cur = d.idx.byId.get(id)
      while (cur?.parentId) {
        n++
        cur = d.idx.byId.get(cur.parentId)
      }
      return n
    }
    expect(Math.max(...seed.wbs.map((w) => depth(w.id)))).toBeGreaterThanOrEqual(2)
    expect(seed.wbs.some((w) => w.type === 'milestone')).toBe(true)
    expect(seed.wbs.some((w) => w.predecessorId)).toBe(true)
    expect(seed.wbs.some((w) => w.deliverableUrl)).toBe(true)
  })

  it('最下位の作業項目だけが作業時間（TimeEntry）を持ち、すべて projectId が整合する', () => {
    for (const e of seed.timeEntries) {
      expect(isParent(d.idx, e.wbsId)).toBe(false)
      expect(d.idx.byId.get(e.wbsId)!.projectId).toBe(e.projectId)
    }
  })

  it('稼働: 確定（Committed）が 60〜120%超 に散らばり、過負荷が存在する', () => {
    const pct = d.workload.users.map((u, ui) => `${u.initials}:${d.workload.cells[ui].map((c) => Math.round(c.utilization * 100)).join('/')}`)
    expect(pct).toEqual(['K:93/118/123/85', 'H:83/95/94/75', 'U:60/78/94/69', 'S:73/87/112/89'])
  })

  it('見込み込み（Forecast）では、受注見込み案件の分だけ負荷が上がる週がある', () => {
    const cells = d.workloadAll.cells.flat()
    expect(cells.some((c) => c.expected > 0)).toBe(true)
    expect(cells.every((c) => c.forecastUtilization >= c.utilization)).toBe(true)
    expect(d.workload.cells.flat().some((c) => c.level !== 'warn' && c.forecastLevel === 'warn')).toBe(true)
  })

  it('Capacity: 休暇・研修で稼働可能時間が減る週がある', () => {
    expect(d.workloadAll.cells.flat().some((c) => c.unavailable > 0 && c.capacity < c.base)).toBe(true)
  })

  it('受注見込み: 5段階すべてに案件があり、PJ化済みの案件はプロジェクトに紐づく', () => {
    for (const st of ['consultation', 'explore', 'candidate', 'evaluation', 'approval_wait'] as const) expect(seed.opportunities.some((o) => o.stage === st), st).toBe(true)
    const conv = seed.opportunities.find((o) => o.stage === 'converted')!
    expect(seed.projects.some((p) => p.id === conv.convertedProjectId)).toBe(true)
  })

  it('配置: 人員未配置の案件（配置デモ用）と、仮アサインが存在する', () => {
    expect(seed.assignments.some((a) => a.status === 'tentative')).toBe(true)
    expect(d.alerts.some((a) => a.kind === 'assignment_gap')).toBe(true)
  })

  it('タレント: 6スキル × 4人のレベル、確認待ちの経験（NEW）、育成テーマ、完了済みプロジェクトの記録がある', () => {
    expect(seed.skills).toHaveLength(6)
    expect(seed.userSkills.length).toBeGreaterThanOrEqual(20)
    expect(seed.experiences.some((e) => e.status === 'candidate')).toBe(true)
    expect(seed.growthFocus.length).toBeGreaterThan(0)
    expect(seed.closes.some((c) => c.status === 'closed')).toBe(true)
  })

  it('社内オーダー: プロジェクトごとに登録され、作業時間はすべて同じプロジェクトのオーダーに計上されている', () => {
    expect(seed.internalOrders.length).toBeGreaterThanOrEqual(6)
    expect(new Set(seed.internalOrders.map((o) => o.code)).size).toBe(seed.internalOrders.length) // 番号は一意
    expect(seed.internalOrders.some((o) => o.status === 'closed')).toBe(true)
    expect(seed.internalOrders.filter((o) => o.projectId === 'bmes')).toHaveLength(2) // 複数オーダーのデモ
    for (const e of seed.timeEntries) {
      const o = seed.internalOrders.find((x) => x.id === e.orderId)
      expect(o?.projectId, e.id).toBe(e.projectId)
    }
    for (const w of seed.wbs.filter((x) => x.type === 'milestone')) expect(w.orderId).toBeUndefined()
  })

  it('ユーザー: 管理者・リーダー・担当メンバーがいて、既定の操作ユーザーは管理者（課長）', () => {
    expect(new Set(seed.users.map((u) => u.role))).toEqual(new Set(['admin', 'leader', 'member']))
    expect(seed.users.find((u) => u.id === seed.currentUserId)!.role).toBe('admin')
  })
})

describe('どの曜日に開いても同じ見え方（週の途中・週末でも崩れない）', () => {
  it('状態と稼働（確定）が 月〜日 のどれでも同じ', () => {
    for (let k = 0; k < 7; k++) {
      const day = new Date(2026, 9, 12 + k)
      const s = createSeed(day)
      const x = buildDerived(s, day)
      expect(['bmes', 'asaas', 'cscada', 'gtm'].map((id) => x.summaryById.get(id)!.health.health), `+${k}日`).toEqual(['WATCH', 'GOOD', 'RISK', 'GOOD'])
      expect(x.workload.users.map((_u, ui) => x.workload.cells[ui].map((c) => Math.round(c.utilization * 100)).join('/')), `+${k}日`).toEqual(['93/118/123/85', '83/95/94/75', '60/78/94/69', '73/87/112/89'])
    }
  })

  it('日付は「今週の月曜」を基準に並ぶ（日曜に開くと前の週が基準）', () => {
    const sun = createSeed(new Date(2026, 9, 11)) // 日曜 → 今週は 10/5 の週
    const startOf = (s: typeof seed) => s.wbs.find((w) => w.title === 'As-Is整理')!.startDate
    expect(daysBetween(startOf(sun), startOf(seed))).toBe(7)
  })
})
