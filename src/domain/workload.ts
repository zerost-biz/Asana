import type {
  AllocationOverride,
  Assignment,
  Capacity,
  ISODate,
  Opportunity,
  Project,
  Settings,
  User,
  WbsItem,
} from './types'
import { DEFAULT_SETTINGS } from './types'
import {
  addDays,
  differenceInCalendarDays,
  fmtMDDate,
  parseDate,
  toISO,
  weekStartOf,
  workdaysBetween,
} from './dates'

export const WEEK_COUNT = 4
const WEEK_LABELS = ['今週', '来週', '+2週', '+3週'] as const

export interface WeekInfo {
  index: number
  label: string
  start: Date
  end: Date
  startISO: ISODate
  endISO: ISODate
  /** 10/5–10/11 */
  range: string
}

export function buildWeeks(today: Date, count = WEEK_COUNT): WeekInfo[] {
  const mon = weekStartOf(today)
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(mon, i * 7)
    const end = addDays(start, 6)
    return {
      index: i,
      label: WEEK_LABELS[i] ?? `+${i}週`,
      start,
      end,
      startISO: toISO(start),
      endISO: toISO(end),
      range: `${fmtMDDate(start)}–${fmtMDDate(end)}`,
    }
  })
}

/**
 * hours を [max(開始日, 今週月曜), 終了日] の稼働日へ均等に割り振り、表示週ごとの時間を返す。
 *  - 終了日が今週より前（遅延）の場合は、すべて今週(0)に計上
 *  - 稼働日が1日もない期間（土日のみ等）は開始日の属する週に計上
 *  - 表示範囲より先の分は含めない
 */
export function spreadHours(
  startISO: ISODate,
  endISO: ISODate,
  hours: number,
  weeks: WeekInfo[],
): Map<number, number> {
  const out = new Map<number, number>()
  if (weeks.length === 0 || !(hours > 0)) return out
  const thisMon = weeks[0].start
  const weekIndexOf = (d: Date): number => Math.floor(differenceInCalendarDays(d, thisMon) / 7)
  const put = (wi: number, h: number) => {
    if (wi < 0 || wi >= weeks.length || h <= 0) return
    out.set(wi, (out.get(wi) ?? 0) + h)
  }

  const end = parseDate(endISO)
  const startRaw = parseDate(startISO)
  if (end < thisMon) {
    put(0, hours)
    return out
  }
  const start = startRaw < thisMon ? thisMon : startRaw
  const days = workdaysBetween(start, end)
  if (days.length === 0) {
    put(weekIndexOf(start), hours)
    return out
  }
  const perWeek = new Map<number, number>()
  for (const d of days) perWeek.set(weekIndexOf(d), (perWeek.get(weekIndexOf(d)) ?? 0) + 1)
  for (const [wi, n] of perWeek) put(wi, (hours * n) / days.length)
  return out
}

/** 確定している作業（WBS）が、ある人のある週に割り当てる工数 */
export interface Allocation {
  userId: string
  wbsId: string
  projectId: string
  weekIndex: number
  hours: number
  /** 週別に手で修正された値 */
  manual?: boolean
}

/**
 * 未完了の最下位タスクの ETC（残り）を、対象期間の稼働日へ均等配分して週ごとに集計する。
 * 週別の手修正（AllocationOverride）がある週は、自動配分より優先する。
 */
export function allocateWorkload(
  leaves: WbsItem[],
  weeks: WeekInfo[],
  overrides: AllocationOverride[] = [],
  etcOf: (it: WbsItem) => number = (it) => it.etcHours,
): Allocation[] {
  const out: Allocation[] = []
  if (weeks.length === 0) return out
  const weekIdx = new Map(weeks.map((w) => [w.startISO, w.index]))
  const ovByWbs = new Map<string, Map<number, number>>()
  for (const o of overrides) {
    const wi = weekIdx.get(o.weekStart)
    if (wi === undefined) continue
    const m = ovByWbs.get(o.wbsId) ?? new Map<number, number>()
    m.set(wi, o.hours)
    ovByWbs.set(o.wbsId, m)
  }

  for (const it of leaves) {
    if (!it.ownerId || it.status === 'done' || it.type === 'milestone') continue
    const auto = spreadHours(it.startDate, it.endDate, Math.max(0, etcOf(it)), weeks)
    const ov = ovByWbs.get(it.id)
    const weekSet = new Set<number>([...auto.keys(), ...(ov?.keys() ?? [])])
    for (const wi of weekSet) {
      const manual = ov?.has(wi) ?? false
      const hours = manual ? (ov!.get(wi) as number) : (auto.get(wi) ?? 0)
      if (hours <= 0) continue
      out.push({ userId: it.ownerId, wbsId: it.id, projectId: it.projectId, weekIndex: wi, hours, manual })
    }
  }
  return out
}

/** 週ごとの「自動配分」の値（手修正の元になる値）。ドロワーで「自動に戻す」前の参考表示に使う */
export function autoHoursByWeek(it: WbsItem, weeks: WeekInfo[]): Map<number, number> {
  if (!it.ownerId || it.status === 'done') return new Map()
  return spreadHours(it.startDate, it.endDate, Math.max(0, it.etcHours), weeks)
}

/* ------------------------------------------------------------------ */
/* 配置（Assignment）と案件の需要                                        */
/* ------------------------------------------------------------------ */

/** 配置（仮/確定）による、ある人のある週の予定。確度で重み付けする */
export interface AssignLoad {
  userId: string
  targetType: 'project' | 'opportunity'
  targetId: string
  role: string
  weekIndex: number
  /** 配置された時間 */
  hours: number
  /** 確度の重み（案件=確度%、プロジェクト=1） */
  weight: number
  /** committed: 確定として計上 / expected: 見込みとして計上 */
  kind: 'committed' | 'expected'
}

export interface DemandContext {
  opportunities: Opportunity[]
  projects: Project[]
  /** WBS（作業項目）を持つプロジェクトID。WBS があれば負荷は WBS から計算し、配置は計画用にとどめる */
  projectsWithWbs: Set<string>
}

export function buildAssignLoads(assignments: Assignment[], weeks: WeekInfo[], ctx: DemandContext): AssignLoad[] {
  const weekIdx = new Map(weeks.map((w) => [w.startISO, w.index]))
  const oppById = new Map(ctx.opportunities.map((o) => [o.id, o]))
  const prjById = new Map(ctx.projects.map((p) => [p.id, p]))
  const out: AssignLoad[] = []
  for (const a of assignments) {
    const wi = weekIdx.get(a.weekStart)
    if (wi === undefined) continue
    if (a.targetType === 'opportunity') {
      const o = oppById.get(a.targetId)
      if (!o || o.stage === 'converted' || o.stage === 'lost') continue
      out.push({ userId: a.userId, targetType: 'opportunity', targetId: a.targetId, role: a.role, weekIndex: wi, hours: a.plannedHours, weight: o.probability / 100, kind: 'expected' })
    } else {
      const p = prjById.get(a.targetId)
      if (!p || (p.status !== 'active' && p.status !== 'planned')) continue
      if (ctx.projectsWithWbs.has(p.id)) continue
      out.push({ userId: a.userId, targetType: 'project', targetId: a.targetId, role: a.role, weekIndex: wi, hours: a.plannedHours, weight: 1, kind: a.status === 'confirmed' ? 'committed' : 'expected' })
    }
  }
  return out
}

/** 役割ごとの週別需要（案件・WBS未作成のプロジェクト）から、配置済みを引いた「未配置」分 */
export interface UnassignedItem {
  targetType: 'project' | 'opportunity'
  targetId: string
  role: string
  weekIndex: number
  /** 未配置の時間（重み付け前） */
  hours: number
  weight: number
}

export function buildUnassigned(
  assignments: Assignment[],
  weeks: WeekInfo[],
  ctx: DemandContext,
  baseCapacity: number,
): UnassignedItem[] {
  const weekIdx = new Map(weeks.map((w) => [w.startISO, w.index]))
  const assigned = new Map<string, number>() // `${type}:${id}:${role}:${wi}` -> hours
  for (const a of assignments) {
    const wi = weekIdx.get(a.weekStart)
    if (wi === undefined) continue
    const k = `${a.targetType}:${a.targetId}:${a.role}:${wi}`
    assigned.set(k, (assigned.get(k) ?? 0) + a.plannedHours)
  }
  const out: UnassignedItem[] = []
  const push = (type: 'project' | 'opportunity', id: string, role: string, demand: Map<number, number>, weight: number) => {
    for (const [wi, h] of demand) {
      const left = h - (assigned.get(`${type}:${id}:${role}:${wi}`) ?? 0)
      if (left > 0.01) out.push({ targetType: type, targetId: id, role, weekIndex: wi, hours: left, weight })
    }
  }
  for (const o of ctx.opportunities) {
    if (o.stage === 'converted' || o.stage === 'lost') continue
    for (const d of o.demands) push('opportunity', o.id, d.role, spreadHours(o.startDate, o.endDate, d.hours, weeks), o.probability / 100)
  }
  for (const p of ctx.projects) {
    if (p.status !== 'planned' && p.status !== 'active') continue
    if (ctx.projectsWithWbs.has(p.id)) continue
    for (const n of p.roleNeeds) {
      const total = n.fte * baseCapacity * Math.max(1, workdaysBetween(parseDate(p.startDate), parseDate(p.endDate)).length / 5)
      push('project', p.id, n.role, spreadHours(p.startDate, p.endDate, total, weeks), 1)
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* 負荷率                                                               */
/* ------------------------------------------------------------------ */

export type LoadLevel = 'normal' | 'caution' | 'warn'

/** 85%未満: 通常 / 85〜100%: 注意 / 100%超: 警告（しきい値は設定で変更可） */
export function loadLevel(
  utilization: number,
  th: Pick<Settings, 'loadCaution' | 'loadWarn'> = DEFAULT_SETTINGS,
): LoadLevel {
  // 浮動小数の誤差で 100% ちょうどが警告にならないよう丸めてから判定
  const u = Math.round(utilization * 1000) / 1000
  if (u > th.loadWarn) return 'warn'
  if (u >= th.loadCaution) return 'caution'
  return 'normal'
}

export interface WorkloadCell {
  userId: string
  weekIndex: number
  /** Committed: 確定している予定時間（WBSの残り + 確定配置） */
  planned: number
  /** Expected: 案件・仮配置の見込み（確度加重） */
  expected: number
  /** 標準の稼働（Base Capacity） */
  base: number
  /** 休暇・研修・固定業務など */
  unavailable: number
  /** Available = Base - Unavailable */
  capacity: number
  /** Utilization = Committed / Available */
  utilization: number
  /** Forecast Utilization = (Committed + Expected) / Available */
  forecastUtilization: number
  level: LoadLevel
  forecastLevel: LoadLevel
  /** 確定分のうち WBS に由来する内訳 */
  allocations: Allocation[]
  /** 配置（確定/仮）に由来する内訳 */
  assignLoads: AssignLoad[]
  capacityNote?: string
}

export interface UnassignedWeek {
  weekIndex: number
  /** 確度加重後の未配置時間（チーム全体） */
  weighted: number
  items: UnassignedItem[]
}

export interface WorkloadMatrix {
  weeks: WeekInfo[]
  users: User[]
  /** [userIndex][weekIndex] */
  cells: WorkloadCell[][]
  /** 誰にも配置されていない将来の需要（確度加重） */
  unassigned: UnassignedWeek[]
}

export interface MatrixInputs {
  users: User[]
  allocations: Allocation[]
  assignLoads: AssignLoad[]
  unassigned: UnassignedItem[]
  capacities: Capacity[]
  settings?: Pick<Settings, 'loadCaution' | 'loadWarn'>
}

const MAX_UTIL = 9.99

export function buildWorkloadMatrix(inputs: MatrixInputs, weeks: WeekInfo[]): WorkloadMatrix {
  const { users, allocations, assignLoads, unassigned, capacities } = inputs
  const th = inputs.settings ?? DEFAULT_SETTINGS
  const capKey = new Map(capacities.map((c) => [`${c.userId}:${c.weekStart}`, c]))
  const cells = users.map((u) =>
    weeks.map((w) => {
      const allocs = allocations.filter((a) => a.userId === u.id && a.weekIndex === w.index)
      const loads = assignLoads.filter((a) => a.userId === u.id && a.weekIndex === w.index)
      const committed =
        allocs.reduce((s, a) => s + a.hours, 0) + loads.filter((l) => l.kind === 'committed').reduce((s, l) => s + l.hours * l.weight, 0)
      const expected = loads.filter((l) => l.kind === 'expected').reduce((s, l) => s + l.hours * l.weight, 0)
      const cap = capKey.get(`${u.id}:${w.startISO}`)
      const base = cap?.baseHours ?? u.weeklyCapacity
      const unavailable = cap?.unavailableHours ?? 0
      const capacity = Math.max(0, base - unavailable)
      const ratio = (n: number) => (capacity > 0 ? Math.min(MAX_UTIL, n / capacity) : n > 0 ? MAX_UTIL : 0)
      const utilization = ratio(committed)
      const forecastUtilization = ratio(committed + expected)
      return {
        userId: u.id,
        weekIndex: w.index,
        planned: committed,
        expected,
        base,
        unavailable,
        capacity,
        utilization,
        forecastUtilization,
        level: loadLevel(utilization, th),
        forecastLevel: loadLevel(forecastUtilization, th),
        allocations: allocs,
        assignLoads: loads,
        capacityNote: cap?.note,
      } satisfies WorkloadCell
    }),
  )
  const unassignedWeeks: UnassignedWeek[] = weeks.map((w) => {
    const items = unassigned.filter((i) => i.weekIndex === w.index)
    return { weekIndex: w.index, weighted: items.reduce((s, i) => s + i.hours * i.weight, 0), items }
  })
  return { weeks, users, cells, unassigned: unassignedWeeks }
}

export function cellOf(matrix: WorkloadMatrix, userId: string, weekIndex: number): WorkloadCell | undefined {
  const ui = matrix.users.findIndex((u) => u.id === userId)
  if (ui < 0) return undefined
  return matrix.cells[ui]?.[weekIndex]
}

/** 見込みを含める/含めない を切り替えたときに使う負荷率 */
export function cellRatio(c: WorkloadCell, forecast: boolean): number {
  return forecast ? c.forecastUtilization : c.utilization
}
export function cellLevel(c: WorkloadCell, forecast: boolean): LoadLevel {
  return forecast ? c.forecastLevel : c.level
}

/** 先頭 n 週だけの行列に切り出す（ホーム等は今週〜+3週の固定表示） */
export function sliceMatrix(m: WorkloadMatrix, n: number): WorkloadMatrix {
  return { weeks: m.weeks.slice(0, n), users: m.users, cells: m.cells.map((r) => r.slice(0, n)), unassigned: m.unassigned.slice(0, n) }
}
