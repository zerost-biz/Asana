import type { AppData, Project, Risk, User, WbsItem } from '../domain/types'
import {
  computeAllMetrics,
  computeProjectHealth,
  indexWbs,
  isOverdue,
  leafItems,
  projectMetrics,
  wbsNumbering,
  type HealthInfo,
  type MetricsMap,
  type WbsIndex,
} from '../domain/calculations'
import { buildDecisions, type Decision } from '../domain/decisions'
import { daysBetween, toISO } from '../domain/dates'
import {
  allocateWorkload,
  buildWeeks,
  buildWorkloadMatrix,
  type Allocation,
  type WeekInfo,
  type WorkloadMatrix,
} from '../domain/workload'

export interface ProjectSummary {
  project: Project
  /** "B社 MES構想" -> "B社" */
  shortName: string
  totals: ReturnType<typeof projectMetrics>
  health: HealthInfo
  overdue: { id: string; title: string; days: number }[]
  blocked: { id: string; title: string }[]
  openRisks: Risk[]
}

/** state から毎回導出される集計値。入力が変わると全画面が同じ元データから再計算される */
export interface Derived {
  todayISO: string
  idx: WbsIndex
  metrics: MetricsMap
  numbers: Map<string, string>
  userById: Map<string, User>
  projectById: Map<string, Project>
  leaves: WbsItem[]
  weeks: WeekInfo[]
  allocations: Allocation[]
  workload: WorkloadMatrix
  summaries: ProjectSummary[]
  summaryById: Map<string, ProjectSummary>
  decisions: Decision[]
  /** 4週の見通しの中に 100%超 の週がある人 */
  overloadUsers: User[]
  /** 今週の実績工数（チーム全体） */
  weekActualHours: number
}

export const shortProjectName = (p: Project): string => p.name.split(/\s+/)[0]

export function buildDerived(data: AppData, today: Date): Derived {
  const todayISO = toISO(today)
  const idx = indexWbs(data.wbs)
  const metrics = computeAllMetrics(data.wbs, data.timeEntries)
  const numbers = wbsNumbering(idx, data.projects)
  const userById = new Map(data.users.map((u) => [u.id, u]))
  const projectById = new Map(data.projects.map((p) => [p.id, p]))
  const leaves = leafItems(data.wbs, idx)
  const weeks = buildWeeks(today)
  const allocations = allocateWorkload(leaves, weeks)
  const workload = buildWorkloadMatrix(data.users, allocations, weeks)

  const summaries: ProjectSummary[] = data.projects.map((project) => {
    const totals = projectMetrics(project.id, idx, metrics)
    const pLeaves = leaves.filter((l) => l.projectId === project.id)
    const leafMs = pLeaves.map((l) => metrics.get(l.id)!)
    const health = computeProjectHealth(project, totals, leafMs, data.risks, todayISO)
    const overdue = pLeaves
      .filter((l) => isOverdue(l.status, l.endDate, todayISO))
      .map((l) => ({ id: l.id, title: l.title, days: daysBetween(l.endDate, todayISO) }))
    const blocked = pLeaves.filter((l) => l.status === 'Blocked').map((l) => ({ id: l.id, title: l.title }))
    return {
      project,
      shortName: shortProjectName(project),
      totals,
      health,
      overdue,
      blocked,
      openRisks: data.risks.filter((r) => r.projectId === project.id && r.status !== 'closed'),
    }
  })
  const summaryById = new Map(summaries.map((s) => [s.project.id, s]))

  const decisions = buildDecisions(
    workload,
    summaries.map((s) => ({
      project: s.project,
      health: s.health,
      variance: s.totals.variance,
      plan: s.totals.plan,
      overdue: s.overdue,
      blocked: s.blocked,
    })),
    data.risks,
    projectById,
    shortProjectName,
  )

  const overloadUsers = data.users.filter((_, ui) => workload.cells[ui].some((c) => c.level === 'warn'))

  const w0 = weeks[0]
  const weekActualHours = data.timeEntries
    .filter((e) => e.date >= w0.startISO && e.date <= w0.endISO)
    .reduce((s, e) => s + e.hours, 0)

  return {
    todayISO,
    idx,
    metrics,
    numbers,
    userById,
    projectById,
    leaves,
    weeks,
    allocations,
    workload,
    summaries,
    summaryById,
    decisions,
    overloadUsers,
    weekActualHours,
  }
}
