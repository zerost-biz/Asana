import { describe, expect, it } from 'vitest'
import { entry, wbs } from '../test/factories'
import {
  computeAllMetrics,
  computeProjectHealth,
  indexWbs,
  isOverdue,
  leafMetrics,
  projectMetrics,
  resolveLogWork,
  wbsNumbering,
} from './calculations'
import { DEFAULT_SETTINGS, type Project } from './types'

describe('工数の定義（PLAN / ACT / ETC / EAC / Variance / Burn）', () => {
  it('EAC = ACT + ETC / Variance = EAC - PLAN / Burn = ACT / PLAN', () => {
    const m = leafMetrics(36, 24, 16)
    expect(m.eac).toBe(40)
    expect(m.variance).toBe(4)
    expect(m.burn).toBeCloseTo(24 / 36)
  })

  it('PLAN が 0 のとき Burn は null', () => {
    expect(leafMetrics(0, 5, 5).burn).toBeNull()
  })

  it('ETC は進捗率から自動算出されない（進捗を変えても ETC は不変）', () => {
    const a = computeAllMetrics([wbs({ planHours: 36, etcHours: 16, progress: 10 })], []).get('x')!
    const b = computeAllMetrics([wbs({ planHours: 36, etcHours: 16, progress: 90 })], []).get('x')!
    expect(a.etc).toBe(16)
    expect(b.etc).toBe(16)
  })

  it('ACT は TimeEntry の wbsId 別合計。追加すると ACT/EAC/Variance が再計算される', () => {
    const item = wbs({ planHours: 36, etcHours: 16 })
    const m1 = computeAllMetrics([item], [entry({ id: 'e1', hours: 24 })]).get('x')!
    expect([m1.act, m1.etc, m1.eac, m1.variance]).toEqual([24, 16, 40, 4])
    const m2 = computeAllMetrics([{ ...item, etcHours: 12 }], [entry({ id: 'e1', hours: 24 }), entry({ id: 'e2', hours: 3 })]).get('x')!
    expect([m2.act, m2.eac, m2.variance]).toEqual([27, 39, 3])
  })

  it('他の作業項目の TimeEntry は ACT に入らない', () => {
    const m = computeAllMetrics([wbs()], [entry({ wbsId: 'other', hours: 9 })]).get('x')!
    expect(m.act).toBe(0)
  })
})

describe('親行の集計', () => {
  const items = [
    wbs({ id: 'p1', parentId: null, type: 'phase', planHours: 0, etcHours: 0 }),
    wbs({ id: 'c1', parentId: 'p1', planHours: 20, etcHours: 0, progress: 100, status: 'done' }),
    wbs({ id: 'c2', parentId: 'p1', planHours: 60, etcHours: 40, progress: 50 }),
  ]
  const entries = [entry({ id: 'e1', wbsId: 'c1', hours: 22 }), entry({ id: 'e2', wbsId: 'c2', hours: 20 })]

  it('PLAN/ACT/ETC/EAC は子の合計', () => {
    const p = computeAllMetrics(items, entries).get('p1')!
    expect([p.plan, p.act, p.etc, p.eac, p.variance]).toEqual([80, 42, 40, 82, 2])
    expect(p.isParent).toBe(true)
    expect(p.leafCount).toBe(2)
  })

  it('進捗は 計画時間で加重（標準）/ 見込み時間で加重（設定）', () => {
    const plan = computeAllMetrics(items, entries, () => 0, 'plan').get('p1')!
    expect(plan.progress).toBeCloseTo((100 * 20 + 50 * 60) / 80)
    const eac = computeAllMetrics(items, entries, () => 0, 'eac').get('p1')!
    // c1: EAC22 / c2: EAC60
    expect(eac.progress).toBeCloseTo((100 * 22 + 50 * 60) / 82)
  })

  it('状態は子から決まる（子に進行中があれば進行中 / 停止中があれば停止中 / すべて完了なら完了）', () => {
    expect(computeAllMetrics(items, entries).get('p1')!.status).toBe('in_progress')
    const blocked = items.map((i) => (i.id === 'c2' ? { ...i, status: 'blocked' as const } : i))
    expect(computeAllMetrics(blocked, entries).get('p1')!.status).toBe('blocked')
    const done = items.map((i) => (i.id === 'c2' ? { ...i, status: 'done' as const, progress: 100, etcHours: 0 } : i))
    expect(computeAllMetrics(done, entries).get('p1')!.status).toBe('done')
  })

  it('3階層（フェーズ > 作業パッケージ > タスク）でも合計される', () => {
    const tree = [
      wbs({ id: 'ph', type: 'phase', planHours: 0, etcHours: 0 }),
      wbs({ id: 'wp', parentId: 'ph', type: 'work_package', planHours: 0, etcHours: 0 }),
      wbs({ id: 't1', parentId: 'wp', planHours: 10, etcHours: 10 }),
      wbs({ id: 't2', parentId: 'wp', planHours: 6, etcHours: 6 }),
    ]
    const ms = computeAllMetrics(tree, [])
    expect(ms.get('wp')!.plan).toBe(16)
    expect(ms.get('ph')!.plan).toBe(16)
    const idx = indexWbs(tree)
    expect(wbsNumbering(idx, [{ id: 'p' } as Project]).get('t2')).toBe('1.1.2')
  })

  it('マイルストーンは工数 0 で、進捗の平均にも含まれない', () => {
    const withMs = [
      wbs({ id: 'ph', type: 'phase', planHours: 0, etcHours: 0 }),
      wbs({ id: 't1', parentId: 'ph', planHours: 10, etcHours: 10, progress: 40 }),
      wbs({ id: 'ms', parentId: 'ph', type: 'milestone', planHours: 0, etcHours: 0, progress: 0, status: 'not_started' }),
    ]
    const m = computeAllMetrics(withMs, []).get('ph')!
    expect(m.plan).toBe(10)
    expect(m.progress).toBeCloseTo(40)
    expect(m.leafCount).toBe(1)
  })

  it('プロジェクト合計は最上位行の合計', () => {
    const ms = computeAllMetrics(items, entries)
    const pm = projectMetrics('p', indexWbs(items), ms)
    expect([pm.plan, pm.act, pm.etc, pm.eac]).toEqual([80, 42, 40, 82])
  })
})

describe('人件費（原価）', () => {
  const rates: Record<string, number> = { 'u-k': 8000, 'u-h': 7000 }
  const rateOf = (id: string | null) => (id ? rates[id] ?? 0 : 6500)

  it('PLAN/ETC は担当者の単価、ACT は実績を入力した人の単価', () => {
    const m = computeAllMetrics(
      [wbs({ planHours: 10, etcHours: 5 })],
      [entry({ id: 'e1', userId: 'u-h', hours: 4 }), entry({ id: 'e2', userId: 'u-k', hours: 2 })],
      rateOf,
    ).get('x')!
    expect(m.planCost).toBe(10 * 8000)
    expect(m.etcCost).toBe(5 * 8000)
    expect(m.actCost).toBe(4 * 7000 + 2 * 8000)
    expect(m.eacCost).toBe(m.actCost + m.etcCost)
    expect(m.varianceCost).toBe(m.eacCost - m.planCost)
  })

  it('担当未設定は平均単価、親は子の合計', () => {
    const ms = computeAllMetrics(
      [
        wbs({ id: 'p1', type: 'phase', planHours: 0, etcHours: 0 }),
        wbs({ id: 'c1', parentId: 'p1', ownerId: null, planHours: 10, etcHours: 10 }),
        wbs({ id: 'c2', parentId: 'p1', ownerId: 'u-h', planHours: 10, etcHours: 0 }),
      ],
      [],
      rateOf,
    )
    expect(ms.get('c1')!.planCost).toBe(10 * 6500)
    expect(ms.get('p1')!.planCost).toBe(10 * 6500 + 10 * 7000)
  })
})

describe('遅延・停止中・状態（Health）', () => {
  const project = { id: 'p', health: null } as Project
  const today = '2026-10-12'

  it('isOverdue: 終了日を過ぎて未完了のものだけ', () => {
    expect(isOverdue('in_progress', '2026-10-11', today)).toBe(true)
    expect(isOverdue('done', '2026-10-11', today)).toBe(false)
    expect(isOverdue('in_progress', '2026-10-12', today)).toBe(false)
  })

  const health = (variance: number, plan: number, leaves: ReturnType<typeof wbs>[], risks = [] as never[]) => {
    const ms = computeAllMetrics(leaves, [])
    return computeProjectHealth(project, { plan, eac: plan + variance, variance }, leaves.map((l) => ms.get(l.id)!), risks, today, DEFAULT_SETTINGS)
  }

  it('見込み超過 5%以上=注意 / 15%以上=危険 / それ未満=順調', () => {
    expect(health(2, 100, [wbs()]).health).toBe('GOOD')
    expect(health(6, 100, [wbs()]).health).toBe('WATCH')
    expect(health(16, 100, [wbs()]).health).toBe('RISK')
  })

  it('遅延だけ=注意 / 遅延 + 停止中=危険', () => {
    expect(health(0, 100, [wbs({ endDate: '2026-10-01' })]).health).toBe('WATCH')
    expect(health(0, 100, [wbs({ id: 'a', endDate: '2026-10-01' }), wbs({ id: 'b', status: 'blocked' })]).health).toBe('RISK')
  })

  it('手動の上書きが自動判定より優先される', () => {
    const ms = computeAllMetrics([wbs()], [])
    const info = computeProjectHealth({ ...project, health: 'RISK' }, { plan: 100, eac: 100, variance: 0 }, [ms.get('x')!], [], today)
    expect(info.health).toBe('RISK')
    expect(info.auto).toBe('GOOD')
    expect(info.overridden).toBe(true)
  })

  it('しきい値は設定で変えられる', () => {
    const ms = computeAllMetrics([wbs()], [])
    const loose = computeProjectHealth(project, { plan: 100, eac: 120, variance: 20 }, [ms.get('x')!], [], today, { ...DEFAULT_SETTINGS, riskVarianceRatio: 0.3, watchVarianceRatio: 0.1 })
    expect(loose.health).toBe('WATCH')
  })
})

describe('工数入力（My Work の保存）', () => {
  it('ETC は入力値をそのまま採用する', () => {
    expect(resolveLogWork({ status: 'in_progress' }, { hours: 2, etc: 7, progress: 30 })).toEqual({ etc: 7, progress: 30, status: 'in_progress' })
  })

  it('進捗100%は完了になり、ETC は 0 に強制される', () => {
    expect(resolveLogWork({ status: 'in_progress' }, { hours: 1, etc: 9, progress: 100 })).toEqual({ etc: 0, progress: 100, status: 'done' })
  })

  it('完了を100%未満に戻すと進行中へ戻る', () => {
    expect(resolveLogWork({ status: 'done' }, { hours: 0, etc: 3, progress: 80 }).status).toBe('in_progress')
  })

  it('未着手に工数が入ると進行中になる / 停止中は維持される', () => {
    expect(resolveLogWork({ status: 'not_started' }, { hours: 1, etc: 5, progress: 0 }).status).toBe('in_progress')
    expect(resolveLogWork({ status: 'blocked' }, { hours: 1, etc: 5, progress: 10 }).status).toBe('blocked')
  })

  it('進捗は 0〜100 に丸められ、ETC は負にならない', () => {
    const r = resolveLogWork({ status: 'in_progress' }, { hours: 1, etc: -3, progress: 140 })
    expect(r.progress).toBe(100)
    expect(r.etc).toBe(0)
  })
})
