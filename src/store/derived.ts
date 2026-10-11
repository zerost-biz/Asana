import { buildAlerts, type Alert } from '../domain/alerts'
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
import { daysBetween, toISO } from '../domain/dates'
import type { AppData, Customer, Opportunity, Project, Risk, User, WbsItem } from '../domain/types'
import {
  allocateWorkload,
  buildAssignLoads,
  buildUnassigned,
  buildWeeks,
  buildWorkloadMatrix,
  sliceMatrix,
  WEEK_COUNT,
  type Allocation,
  type AssignLoad,
  type UnassignedItem,
  type WeekInfo,
  type WorkloadMatrix,
} from '../domain/workload'

export interface ProjectCost {
  /** 受注額・予算（円）。未設定は null */
  budget: number | null
  /** 計画時点の粗利 = 受注額 - 計画の人件費 */
  planMargin: number | null
  /** 見込み粗利 = 受注額 - 見込みの人件費 */
  margin: number | null
  marginRate: number | null
}

export interface NextMilestone {
  id: string
  title: string
  date: string
  overdue: boolean
}

export interface ProjectSummary {
  project: Project
  /** "B社 MES構想" -> "B社" */
  shortName: string
  customerName: string
  totals: ReturnType<typeof projectMetrics>
  health: HealthInfo
  cost: ProjectCost
  overdue: { id: string; title: string; days: number }[]
  blocked: { id: string; title: string }[]
  /** 未解決（解決済み以外）のリスク・課題 */
  openRisks: Risk[]
  /** 重大（severity=high）で未解決のリスク数 */
  highRiskCount: number
  nextMilestone: NextMilestone | null
  /** リーダー → 担当者の順 */
  memberIds: string[]
  /** 最下位の作業項目（マイルストーンを含む） */
  leaves: WbsItem[]
}

/** state から毎回導出される集計値。入力が変わると全画面が同じ元データから再計算される */
export interface Derived {
  todayISO: string
  idx: WbsIndex
  metrics: MetricsMap
  numbers: Map<string, string>
  userById: Map<string, User>
  activeUsers: User[]
  customerById: Map<string, Customer>
  /** 担当者の原価単価（未設定・不明は全員の平均） */
  rateOf: (userId: string | null) => number
  /** 担当者未設定のときに使う平均単価 */
  defaultRate: number
  projectById: Map<string, Project>
  leaves: WbsItem[]
  /** 今週〜+3週（ホーム等の固定表示） */
  weeks: WeekInfo[]
  /** 今週〜+11週（稼働状況の「8週/12週」表示・配置計画で使用） */
  weeksAll: WeekInfo[]
  /** 確定している作業の配分（12週分） */
  allocations: Allocation[]
  assignLoads: AssignLoad[]
  unassigned: UnassignedItem[]
  /** 今週〜+3週 */
  workload: WorkloadMatrix
  /** 今週〜+11週 */
  workloadAll: WorkloadMatrix
  summaries: ProjectSummary[]
  summaryById: Map<string, ProjectSummary>
  /** すべての通知（要判断を含む） */
  alerts: Alert[]
  /** 要判断（ホーム・週次レビューに出す） */
  decisions: Alert[]
  /** 4週の見通しの中に 100%超 の週がある人 */
  overloadUsers: User[]
  /** 今週の実績工数（チーム全体） */
  weekActualHours: number
  /** 進行中・計画中のプロジェクトを持つ案件（受注見込み）で、まだ生きているもの */
  openOpportunities: Opportunity[]
}

export const shortProjectName = (p: Project): string => p.name.split(/\s+/)[0]

export function buildDerived(data: AppData, today: Date): Derived {
  const todayISO = toISO(today)
  const idx = indexWbs(data.wbs)
  const userById = new Map(data.users.map((u) => [u.id, u]))
  const activeUsers = data.users.filter((u) => u.status === 'active')
  const customerById = new Map(data.customers.map((c) => [c.id, c]))
  const projectById = new Map(data.projects.map((p) => [p.id, p]))
  const defaultRate =
    activeUsers.length > 0 ? activeUsers.reduce((s, u) => s + u.hourlyRate, 0) / activeUsers.length : 0
  const rateOf = (userId: string | null): number => (userId && userById.get(userId)?.hourlyRate) || defaultRate
  const metrics = computeAllMetrics(data.wbs, data.timeEntries, rateOf, data.settings.parentProgressWeight)
  const numbers = wbsNumbering(idx, data.projects)
  const leaves = leafItems(data.wbs, idx)

  // 負荷の対象: 進行中・計画中のプロジェクトの、最下位の作業（マイルストーンを除く）
  const live = new Set(data.projects.filter((p) => p.status === 'active' || p.status === 'planned').map((p) => p.id))
  const workLeaves = leaves.filter((l) => live.has(l.projectId) && l.type !== 'milestone')
  const projectsWithWbs = new Set(leaves.filter((l) => l.type !== 'milestone').map((l) => l.projectId))

  const weeksAll = buildWeeks(today, 12)
  const weeks = weeksAll.slice(0, WEEK_COUNT)
  const allocations = allocateWorkload(workLeaves, weeksAll, data.allocationOverrides)
  const ctx = { opportunities: data.opportunities, projects: data.projects, projectsWithWbs }
  const assignLoads = buildAssignLoads(data.assignments, weeksAll, ctx)
  const unassigned = buildUnassigned(data.assignments, weeksAll, ctx, data.settings.baseCapacity)
  const workloadAll = buildWorkloadMatrix(
    { users: activeUsers, allocations, assignLoads, unassigned, capacities: data.capacities, settings: data.settings },
    weeksAll,
  )
  const workload = sliceMatrix(workloadAll, WEEK_COUNT)

  const summaries: ProjectSummary[] = data.projects.map((project) => {
    const totals = projectMetrics(project.id, idx, metrics, data.settings.parentProgressWeight)
    const pLeaves = leaves.filter((l) => l.projectId === project.id)
    const leafMs = pLeaves.map((l) => metrics.get(l.id)!)
    const health = computeProjectHealth(project, totals, leafMs, data.risks, todayISO, data.settings)
    const overdue = pLeaves
      .filter((l) => isOverdue(l.status, l.endDate, todayISO))
      .map((l) => ({ id: l.id, title: l.title, days: daysBetween(l.endDate, todayISO) }))
    const blocked = pLeaves.filter((l) => l.status === 'blocked').map((l) => ({ id: l.id, title: l.title }))
    const budget = project.budget && project.budget > 0 ? project.budget : null
    const cost: ProjectCost = {
      budget,
      planMargin: budget === null ? null : budget - totals.planCost,
      margin: budget === null ? null : budget - totals.eacCost,
      marginRate: budget === null ? null : (budget - totals.eacCost) / budget,
    }
    const risks = data.risks.filter((r) => r.projectId === project.id && r.status !== 'closed')
    const upcoming = pLeaves
      .filter((l) => l.type === 'milestone' && l.status !== 'done')
      .sort((a, b) => (a.endDate < b.endDate ? -1 : 1))[0]
    const owners = [...new Set(pLeaves.filter((l) => l.type !== 'milestone' && l.ownerId).map((l) => l.ownerId as string))]
    return {
      project,
      shortName: shortProjectName(project),
      customerName: customerById.get(project.customerId)?.name ?? '',
      totals,
      health,
      cost,
      overdue,
      blocked,
      openRisks: risks,
      highRiskCount: risks.filter((r) => r.severity === 'high').length,
      nextMilestone: upcoming ? { id: upcoming.id, title: upcoming.title, date: upcoming.endDate, overdue: upcoming.endDate < todayISO } : null,
      memberIds: [project.ownerId, ...owners.filter((o) => o !== project.ownerId)],
      leaves: pLeaves,
    }
  })
  const summaryById = new Map(summaries.map((s) => [s.project.id, s]))

  const alerts = buildAlerts({
    todayISO,
    settings: data.settings,
    matrix: workload,
    projects: summaries.map((s) => ({
      project: s.project,
      shortName: s.shortName,
      health: s.health,
      variance: s.totals.variance,
      plan: s.totals.plan,
      cost:
        s.cost.budget !== null && s.cost.margin !== null && s.cost.marginRate !== null
          ? { budget: s.cost.budget, eacCost: s.totals.eacCost, margin: s.cost.margin, marginRate: s.cost.marginRate }
          : null,
      overdue: s.overdue,
      blocked: s.blocked,
    })),
    projectById,
    leaves,
    risks: data.risks,
    opportunities: data.opportunities,
    customers: data.customers,
    assignments: data.assignments,
    userById,
  })
  const decisions = alerts.filter((a) => a.decision)

  const overloadUsers = workload.users.filter((_, ui) => workload.cells[ui].some((c) => c.level === 'warn'))

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
    activeUsers,
    customerById,
    rateOf,
    defaultRate,
    projectById,
    leaves,
    weeks,
    weeksAll,
    allocations,
    assignLoads,
    unassigned,
    workload,
    workloadAll,
    summaries,
    summaryById,
    alerts,
    decisions,
    overloadUsers,
    weekActualHours,
    openOpportunities: data.opportunities.filter((o) => o.stage !== 'converted' && o.stage !== 'lost'),
  }
}
