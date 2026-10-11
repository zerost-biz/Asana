import type { ISODate, User, WbsItem } from './types'
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

/** 1つのタスクが 1つの週に割り当てる工数 */
export interface Allocation {
  userId: string
  wbsId: string
  projectId: string
  weekIndex: number
  hours: number
}

/**
 * 未完了の最下位タスクの ETC を、対象期間の稼働日へ均等配分して週ごとに集計する。
 *
 *  - 配分対象の期間 = max(開始日, 今週の月曜) 〜 終了日
 *    （過去に消化済みの期間へは配分しない）
 *  - 終了日が今週より前（遅延）のタスクは、残工数をすべて今週に計上
 *  - 稼働日が1日もない期間（土日のみ等）は開始日の属する週に計上
 *  - 表示範囲（今週〜+3週）より先の分は配分から外れる
 */
export function allocateWorkload(
  leaves: WbsItem[],
  weeks: WeekInfo[],
  etcOf: (it: WbsItem) => number = (it) => it.etcHours,
): Allocation[] {
  const out: Allocation[] = []
  if (weeks.length === 0) return out
  const thisMon = weeks[0].start
  const weekIndexOf = (d: Date): number => Math.floor(differenceInCalendarDays(d, thisMon) / 7)

  for (const it of leaves) {
    if (!it.ownerId || it.status === 'Done') continue
    const etc = etcOf(it)
    if (!(etc > 0)) continue

    const end = parseDate(it.endDate)
    const startRaw = parseDate(it.startDate)
    const push = (weekIndex: number, hours: number) => {
      if (weekIndex < 0 || weekIndex >= weeks.length || hours <= 0) return
      out.push({ userId: it.ownerId!, wbsId: it.id, projectId: it.projectId, weekIndex, hours })
    }

    if (end < thisMon) {
      push(0, etc)
      continue
    }
    const start = startRaw < thisMon ? thisMon : startRaw
    const days = workdaysBetween(start, end)
    if (days.length === 0) {
      push(weekIndexOf(start), etc)
      continue
    }
    const perWeek = new Map<number, number>()
    for (const d of days) {
      const wi = weekIndexOf(d)
      perWeek.set(wi, (perWeek.get(wi) ?? 0) + 1)
    }
    for (const [wi, n] of perWeek) push(wi, (etc * n) / days.length)
  }
  return out
}

export type LoadLevel = 'normal' | 'caution' | 'warn'

/** 85%未満: 通常 / 85〜100%: 注意 / 100%超: 警告 */
export function loadLevel(utilization: number): LoadLevel {
  // 浮動小数の誤差で 100% ちょうどが警告にならないよう丸めてから判定
  const u = Math.round(utilization * 1000) / 1000
  if (u > 1) return 'warn'
  if (u >= 0.85) return 'caution'
  return 'normal'
}

export interface WorkloadCell {
  userId: string
  weekIndex: number
  /** Planned Hours */
  planned: number
  /** Available Hours */
  capacity: number
  /** Planned / Available */
  utilization: number
  level: LoadLevel
  allocations: Allocation[]
}

export interface WorkloadMatrix {
  weeks: WeekInfo[]
  users: User[]
  /** [userIndex][weekIndex] */
  cells: WorkloadCell[][]
}

export function buildWorkloadMatrix(
  users: User[],
  allocations: Allocation[],
  weeks: WeekInfo[],
): WorkloadMatrix {
  const cells = users.map((u) =>
    weeks.map((w) => {
      const allocs = allocations.filter((a) => a.userId === u.id && a.weekIndex === w.index)
      const planned = allocs.reduce((s, a) => s + a.hours, 0)
      const capacity = u.weeklyCapacity
      const utilization = capacity > 0 ? planned / capacity : planned > 0 ? Infinity : 0
      return {
        userId: u.id,
        weekIndex: w.index,
        planned,
        capacity,
        utilization,
        level: loadLevel(utilization),
        allocations: allocs,
      } satisfies WorkloadCell
    }),
  )
  return { weeks, users, cells }
}

export function cellOf(matrix: WorkloadMatrix, userId: string, weekIndex: number): WorkloadCell | undefined {
  const ui = matrix.users.findIndex((u) => u.id === userId)
  if (ui < 0) return undefined
  return matrix.cells[ui]?.[weekIndex]
}
