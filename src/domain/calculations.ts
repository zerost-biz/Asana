import type {
  Health,
  ISODate,
  Project,
  Risk,
  TimeEntry,
  WbsItem,
  WbsStatus,
} from './types'

/* ------------------------------------------------------------------ */
/* WBS 階層インデックス                                                 */
/* ------------------------------------------------------------------ */

export interface WbsIndex {
  byId: Map<string, WbsItem>
  /** parentId -> 子（配列順 = 表示順） */
  childrenOf: Map<string, WbsItem[]>
  /** projectId -> 最上位 */
  topOf: Map<string, WbsItem[]>
}

export function indexWbs(items: WbsItem[]): WbsIndex {
  const byId = new Map<string, WbsItem>()
  const childrenOf = new Map<string, WbsItem[]>()
  const topOf = new Map<string, WbsItem[]>()
  for (const it of items) byId.set(it.id, it)
  for (const it of items) {
    // 親が存在しない（削除済み等）場合は最上位として扱う
    if (it.parentId && byId.has(it.parentId)) {
      const arr = childrenOf.get(it.parentId) ?? []
      arr.push(it)
      childrenOf.set(it.parentId, arr)
    } else {
      const arr = topOf.get(it.projectId) ?? []
      arr.push(it)
      topOf.set(it.projectId, arr)
    }
  }
  return { byId, childrenOf, topOf }
}

export const isParent = (idx: WbsIndex, id: string): boolean => idx.childrenOf.has(id)

/** id の子孫すべて（自分は含まない） */
export function descendantsOf(idx: WbsIndex, id: string): WbsItem[] {
  const out: WbsItem[] = []
  const walk = (pid: string) => {
    for (const c of idx.childrenOf.get(pid) ?? []) {
      out.push(c)
      walk(c.id)
    }
  }
  walk(id)
  return out
}

/** 最下位タスク（子を持たない行）。工数・Workloadの計算対象 */
export function leafItems(items: WbsItem[], idx: WbsIndex = indexWbs(items)): WbsItem[] {
  return items.filter((it) => !idx.childrenOf.has(it.id))
}

/** WBS番号 "1", "1.1" ... をプロジェクトごとに採番（表示順 = 配列順） */
export function wbsNumbering(idx: WbsIndex, projects: Project[]): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (list: WbsItem[], prefix: string) => {
    list.forEach((it, i) => {
      const code = prefix ? `${prefix}.${i + 1}` : String(i + 1)
      out.set(it.id, code)
      walk(idx.childrenOf.get(it.id) ?? [], code)
    })
  }
  for (const p of projects) walk(idx.topOf.get(p.id) ?? [], '')
  return out
}

/* ------------------------------------------------------------------ */
/* 工数メトリクス  PLAN / ACT / ETC / EAC / Variance / Burn            */
/* ------------------------------------------------------------------ */

export interface Metrics {
  /** 計画工数 */
  plan: number
  /** 実績工数 = TimeEntry.hours の wbsId 別合計 */
  act: number
  /** 残工数（ユーザー入力値。進捗率から算出しない） */
  etc: number
  /** EAC = ACT + ETC */
  eac: number
  /** Variance = EAC - PLAN（+ は超過見込み） */
  variance: number
  /** Effort Burn = ACT / PLAN（PLAN=0 のとき null） */
  burn: number | null
  /** 0〜100。親は最下位タスクの PLAN 加重平均 */
  progress: number
  /** 人件費（原価）: PLAN = 計画工数 × 担当者の単価 */
  planCost: number
  /** ACT 原価 = Σ（TimeEntry の工数 × 入力者の単価） */
  actCost: number
  /** ETC 原価 = 残工数 × 担当者の単価 */
  etcCost: number
  /** EAC 原価 = ACT 原価 + ETC 原価 */
  eacCost: number
  /** 原価の差異 = EAC 原価 - PLAN 原価 */
  varianceCost: number
  startDate: ISODate
  endDate: ISODate
  status: WbsStatus
  isParent: boolean
  leafCount: number
}

export type MetricsMap = Map<string, Metrics>

/** 担当者(未設定は null)の原価単価（円/時間） */
export type RateOf = (userId: string | null) => number

export function sumActByWbs(entries: TimeEntry[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of entries) m.set(e.wbsId, (m.get(e.wbsId) ?? 0) + e.hours)
  return m
}

/** wbsId ごとの ACT 原価。実績は「入力した人」の単価で計上する */
export function sumActCostByWbs(entries: TimeEntry[], rateOf: RateOf): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of entries) m.set(e.wbsId, (m.get(e.wbsId) ?? 0) + e.hours * rateOf(e.userId))
  return m
}

/** 単一の最下位タスクの数値を計算（ドロワーのライブプレビュー等でも使用） */
export function leafMetrics(plan: number, act: number, etc: number): Pick<
  Metrics,
  'plan' | 'act' | 'etc' | 'eac' | 'variance' | 'burn'
> {
  const eac = act + etc
  return { plan, act, etc, eac, variance: eac - plan, burn: plan > 0 ? act / plan : null }
}

function rollupStatus(children: Metrics[]): WbsStatus {
  if (children.length > 0 && children.every((c) => c.status === 'Done')) return 'Done'
  if (children.some((c) => c.status === 'Blocked')) return 'Blocked'
  if (children.some((c) => c.status === 'In progress' || c.status === 'Done')) return 'In progress'
  return 'Not started'
}

/** 子の集計（親行・プロジェクト全体で共通） */
function aggregate(children: Metrics[]): Omit<Metrics, 'startDate' | 'endDate' | 'status' | 'isParent'> {
  let plan = 0
  let act = 0
  let etc = 0
  let planCost = 0
  let actCost = 0
  let etcCost = 0
  let leafCount = 0
  let weighted = 0
  let simple = 0
  for (const c of children) {
    plan += c.plan
    act += c.act
    etc += c.etc
    planCost += c.planCost
    actCost += c.actCost
    etcCost += c.etcCost
    leafCount += c.leafCount
    weighted += c.progress * c.plan
    simple += c.progress * c.leafCount
  }
  const eac = act + etc
  const progress = plan > 0 ? weighted / plan : leafCount > 0 ? simple / leafCount : 0
  const eacCost = actCost + etcCost
  return {
    plan,
    act,
    etc,
    eac,
    variance: eac - plan,
    burn: plan > 0 ? act / plan : null,
    progress,
    planCost,
    actCost,
    etcCost,
    eacCost,
    varianceCost: eacCost - planCost,
    leafCount,
  }
}

export function computeAllMetrics(
  items: WbsItem[],
  entries: TimeEntry[],
  rateOf: RateOf = () => 0,
): MetricsMap {
  const idx = indexWbs(items)
  const act = sumActByWbs(entries)
  const actCost = sumActCostByWbs(entries, rateOf)
  const out: MetricsMap = new Map()

  const calc = (it: WbsItem, guard: Set<string>): Metrics => {
    const done = out.get(it.id)
    if (done) return done
    const kids = idx.childrenOf.get(it.id)
    let m: Metrics
    if (!kids || kids.length === 0 || guard.has(it.id)) {
      const a = act.get(it.id) ?? 0
      const rate = rateOf(it.ownerId)
      const ac = actCost.get(it.id) ?? 0
      const pc = it.planHours * rate
      const ec = it.etcHours * rate
      m = {
        ...leafMetrics(it.planHours, a, it.etcHours),
        planCost: pc,
        actCost: ac,
        etcCost: ec,
        eacCost: ac + ec,
        varianceCost: ac + ec - pc,
        progress: it.progress,
        startDate: it.startDate,
        endDate: it.endDate,
        status: it.status,
        isParent: false,
        leafCount: 1,
      }
    } else {
      guard.add(it.id)
      const cm = kids.map((k) => calc(k, guard))
      const agg = aggregate(cm)
      m = {
        ...agg,
        startDate: cm.reduce((s, c) => (c.startDate < s ? c.startDate : s), cm[0].startDate),
        endDate: cm.reduce((s, c) => (c.endDate > s ? c.endDate : s), cm[0].endDate),
        status: rollupStatus(cm),
        isParent: true,
      }
    }
    out.set(it.id, m)
    return m
  }
  for (const it of items) calc(it, new Set())
  return out
}

/** プロジェクト全体の集計（最上位行の合計） */
export function projectMetrics(
  projectId: string,
  idx: WbsIndex,
  metrics: MetricsMap,
): Omit<Metrics, 'startDate' | 'endDate' | 'status' | 'isParent'> {
  const tops = (idx.topOf.get(projectId) ?? [])
    .map((t) => metrics.get(t.id))
    .filter((m): m is Metrics => !!m)
  return aggregate(tops)
}

/* ------------------------------------------------------------------ */
/* 遅延 / Blocked / Health                                              */
/* ------------------------------------------------------------------ */

export const isOverdue = (status: WbsStatus, endDate: ISODate, todayISO: ISODate): boolean =>
  status !== 'Done' && endDate < todayISO

export interface HealthInfo {
  /** 表示するHealth（手動上書きがあればそれ） */
  health: Health
  /** 自動判定の結果 */
  auto: Health
  overridden: boolean
  reasons: string[]
  overdueCount: number
  blockedCount: number
  /** (EAC-PLAN)/PLAN */
  varianceRatio: number
}

/**
 * Health 自動判定ルール（プロトタイプ用の素朴なルール）
 *  RISK : EAC超過 15%以上、または 遅延とBlockedが同時に存在
 *  WATCH: EAC超過 5%以上、遅延あり、Blockedあり、未解決のhighリスクあり
 *  GOOD : 上記以外
 */
export function computeProjectHealth(
  project: Project,
  pm: { plan: number; eac: number; variance: number },
  leafMs: Metrics[],
  risks: Risk[],
  todayISO: ISODate,
): HealthInfo {
  const overdueCount = leafMs.filter((m) => isOverdue(m.status, m.endDate, todayISO)).length
  const blockedCount = leafMs.filter((m) => m.status === 'Blocked').length
  const varianceRatio = pm.plan > 0 ? pm.variance / pm.plan : 0
  const highOpen = risks.some(
    (r) => r.projectId === project.id && r.severity === 'high' && r.status !== 'closed',
  )

  const reasons: string[] = []
  if (pm.variance > 0 && varianceRatio >= 0.05)
    reasons.push(`EAC +${Math.round(pm.variance * 10) / 10}h (${Math.round(varianceRatio * 100)}%)`)
  if (overdueCount > 0) reasons.push(`遅延タスク ${overdueCount}件`)
  if (blockedCount > 0) reasons.push(`Blocked ${blockedCount}件`)
  if (highOpen) reasons.push('重大リスクあり')

  let auto: Health = 'GOOD'
  if (varianceRatio >= 0.15 || (blockedCount > 0 && overdueCount > 0)) auto = 'RISK'
  else if (varianceRatio >= 0.05 || blockedCount > 0 || overdueCount > 0 || highOpen) auto = 'WATCH'

  const health = project.health ?? auto
  return {
    health,
    auto,
    overridden: project.health !== null && project.health !== auto,
    reasons,
    overdueCount,
    blockedCount,
    varianceRatio,
  }
}

export const HEALTH_LABEL: Record<Health, string> = { GOOD: 'GOOD', WATCH: 'WATCH', RISK: 'RISK' }

/* ------------------------------------------------------------------ */
/* 工数入力（My Work の保存）で WBS がどう更新されるか                  */
/* ------------------------------------------------------------------ */

export interface LogWorkInput {
  /** 今日の工数 (h) */
  hours: number
  /** 入力後の ETC (h)。ユーザーが「あと何時間必要か」を直接入力した値 */
  etc: number
  /** 入力後の進捗 0〜100 */
  progress: number
}

/**
 * 工数入力後の ETC / 進捗 / 状態を決める（reducer と My Work のプレビューで共用）。
 *  - ETC は入力値をそのまま採用（進捗率からの自動算出はしない）
 *  - 進捗100% → 完了。完了タスクに残工数は残さないので ETC は 0
 *  - 完了済みを100%未満に戻した場合は進行中へ戻す
 *  - 未着手に工数/進捗が入ったら進行中にする（Blockedは維持）
 */
export function resolveLogWork(
  item: Pick<WbsItem, 'status'>,
  input: LogWorkInput,
): { etc: number; progress: number; status: WbsStatus } {
  const progress = Math.min(100, Math.max(0, Math.round(input.progress)))
  let etc = Math.max(0, input.etc)
  let status = item.status
  if (progress >= 100) {
    status = 'Done'
    etc = 0
  } else if (status === 'Done') {
    status = 'In progress'
  } else if (status === 'Not started' && (input.hours > 0 || progress > 0)) {
    status = 'In progress'
  }
  return { etc, progress, status }
}
