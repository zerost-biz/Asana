import type { HealthInfo } from './calculations'
import { daysBetween } from './dates'
import { fmtSignedH, fmtSignedYen, fmtYen } from './format'
import { isOpenOpp, roleGapsForOpp, roleGapsForProject, totalGap, fmtManMonths } from './pipeline'
import type { Assignment, Customer, Opportunity, Project, Risk, Settings, User, WbsItem } from './types'
import type { WorkloadMatrix } from './workload'

export type AlertKind =
  | 'overload'
  | 'forecast_overload'
  | 'eac'
  | 'margin'
  | 'risk'
  | 'overdue'
  | 'blocked'
  | 'deadline'
  | 'etc_stale'
  | 'pj_decision'
  | 'assignment_gap'
  | 'dependency'

/** red は「重大リスク・100%超負荷」に限定するため、tone は 3 段階 */
export type AlertTone = 'critical' | 'attention' | 'info'

export interface Alert {
  id: string
  kind: AlertKind
  tone: AlertTone
  title: string
  detail: string
  /** クリック時の遷移先 */
  to: string
  /** true の場合は「要判断」（ホーム・週次レビューの判断リスト）にも出す */
  decision: boolean
}

/** 以前の名称（要判断）との互換 */
export type Decision = Alert
export type DecisionKind = AlertKind
export type DecisionTone = AlertTone

export interface ProjectAlertInput {
  project: Project
  shortName: string
  health: HealthInfo
  variance: number
  plan: number
  cost: { budget: number; eacCost: number; margin: number; marginRate: number } | null
  overdue: { id: string; title: string; days: number }[]
  blocked: { id: string; title: string }[]
}

export interface AlertInput {
  todayISO: string
  settings: Settings
  matrix: WorkloadMatrix
  projects: ProjectAlertInput[]
  projectById: Map<string, Project>
  leaves: WbsItem[]
  risks: Risk[]
  opportunities: Opportunity[]
  customers: Customer[]
  assignments: Assignment[]
  userById: Map<string, User>
}

const rank = (t: AlertTone) => (t === 'critical' ? 0 : t === 'attention' ? 1 : 2)

export function buildAlerts(input: AlertInput): Alert[] {
  const { todayISO, settings, matrix, projects, risks, opportunities, customers, assignments } = input
  const out: Alert[] = []
  const custName = (id: string) => customers.find((c) => c.id === id)?.name ?? ''
  const proj = (id: string) => input.projectById.get(id)

  // 1. 過負荷（確定分で100%超）/ 見込み案件を含めると100%超
  const over: Alert[] = []
  matrix.users.forEach((u, ui) => {
    matrix.weeks.forEach((w, wi) => {
      const c = matrix.cells[ui][wi]
      if (c.level === 'warn') {
        over.push({
          id: `overload:${u.id}:${w.index}`,
          kind: 'overload',
          tone: 'critical',
          title: `${u.name} ${w.label}${Math.round(c.utilization * 100)}%`,
          detail: `${w.range} · 超過 ${fmtSignedH(c.planned - c.capacity)}（${c.planned.toFixed(0)}h / ${c.capacity}h）`,
          to: `/workload?cell=${u.id}:${w.index}`,
          decision: true,
        })
      } else if (c.forecastLevel === 'warn') {
        out.push({
          id: `forecast:${u.id}:${w.index}`,
          kind: 'forecast_overload',
          tone: 'attention',
          title: `${u.name} ${w.label} 見込み込み${Math.round(c.forecastUtilization * 100)}%`,
          detail: `${w.range} · 受注見込みの案件を含めると稼働を超えます（確定 ${Math.round(c.utilization * 100)}%）`,
          to: `/workload?cell=${u.id}:${w.index}`,
          decision: false,
        })
      }
    })
  })
  over.sort((a, b) => Number(b.title.match(/(\d+)%/)?.[1] ?? 0) - Number(a.title.match(/(\d+)%/)?.[1] ?? 0))
  out.push(...over)

  // 2. プロジェクト単位
  for (const p of projects) {
    if (p.project.status === 'completed' || p.project.status === 'archived') continue
    const name = p.shortName
    const ratio = p.health.varianceRatio
    if (p.variance > 0 && ratio >= settings.watchVarianceRatio) {
      out.push({
        id: `eac:${p.project.id}`,
        kind: 'eac',
        tone: ratio >= settings.riskVarianceRatio ? 'critical' : 'attention',
        title: `${name} 時間超過 ${fmtSignedH(p.variance)}`,
        detail: `計画を${Math.round(ratio * 100)}%超える見込み。作業範囲・体制の見直しを判断`,
        to: `/projects/${p.project.id}`,
        decision: true,
      })
    }
    if (p.cost && p.cost.marginRate < settings.marginTarget) {
      const c = p.cost
      out.push({
        id: `margin:${p.project.id}`,
        kind: 'margin',
        tone: c.marginRate < 0 ? 'critical' : 'attention',
        title: `${name} 粗利率 ${Math.round(c.marginRate * 100)}%`,
        detail: `受注 ${fmtYen(c.budget)} − 見込みの人件費 ${fmtYen(c.eacCost)} ＝ 粗利 ${fmtSignedYen(c.margin)}（目安 ${Math.round(settings.marginTarget * 100)}%）`,
        to: `/projects/${p.project.id}/dashboard`,
        decision: true,
      })
    }
    if (p.overdue.length > 0) {
      const worst = [...p.overdue].sort((a, b) => b.days - a.days)[0]
      out.push({
        id: `overdue:${p.project.id}`,
        kind: 'overdue',
        tone: 'attention',
        title: `${name} 遅延タスク ${p.overdue.length}件`,
        detail: `最大 ${worst.days}日遅れ：${worst.title}`,
        to: `/projects/${p.project.id}/wbs?task=${worst.id}`,
        decision: true,
      })
    }
  }

  // 3. 停止中が一定期間以上続いている作業
  const blockedByProject = new Map<string, { id: string; title: string; days: number }[]>()
  for (const l of input.leaves) {
    if (l.status !== 'blocked') continue
    const p = proj(l.projectId)
    if (!p || p.status === 'completed' || p.status === 'archived') continue
    const days = daysBetween(l.statusChangedAt, todayISO)
    if (days < settings.blockedAlertDays) continue
    const arr = blockedByProject.get(l.projectId) ?? []
    arr.push({ id: l.id, title: l.title, days })
    blockedByProject.set(l.projectId, arr)
  }
  for (const [pid, list] of blockedByProject) {
    const p = proj(pid)!
    out.push({
      id: `blocked:${pid}`,
      kind: 'blocked',
      tone: 'attention',
      title: `${p.name.split(/\s+/)[0]} 停止中のタスク ${list.length}件`,
      detail: list.map((b) => `${b.title}（${b.days}日間）`).join(' / '),
      to: `/projects/${pid}/wbs?task=${list[0].id}`,
      decision: true,
    })
  }

  // 4. 未解決リスク（高・中）
  for (const r of risks) {
    if (r.status !== 'open' || r.severity === 'low') continue
    const p = proj(r.projectId)
    if (!p || p.status === 'completed' || p.status === 'archived') continue
    out.push({
      id: `risk:${r.id}`,
      kind: 'risk',
      tone: r.severity === 'high' ? 'critical' : 'attention',
      title: `${p.name.split(/\s+/)[0]} ${r.title}`,
      detail: r.severity === 'high' ? '重大リスク（未対応）' : 'リスク（要判断）',
      to: `/projects/${p.id}/risks`,
      decision: true,
    })
  }

  // 5. 期限が近い作業（遅延でないもの）
  const soon = new Map<string, WbsItem[]>()
  for (const l of input.leaves) {
    if (l.status === 'done') continue
    const p = proj(l.projectId)
    if (!p || p.status === 'completed' || p.status === 'archived') continue
    const d = daysBetween(todayISO, l.endDate)
    if (d >= 0 && d <= settings.deadlineSoonDays) soon.set(l.projectId, [...(soon.get(l.projectId) ?? []), l])
  }
  for (const [pid, list] of soon) {
    const p = proj(pid)!
    out.push({
      id: `deadline:${pid}`,
      kind: 'deadline',
      tone: 'info',
      title: `${p.name.split(/\s+/)[0]} 期限が近い作業 ${list.length}件`,
      detail: list.slice(0, 3).map((l) => `${l.title}（${l.endDate.slice(5).replace('-', '/')}）`).join(' / '),
      to: `/projects/${pid}/wbs?task=${list[0].id}`,
      decision: false,
    })
  }

  // 6. 残りが長く更新されていない作業
  const stale = new Map<string, WbsItem[]>()
  for (const l of input.leaves) {
    if (l.status !== 'in_progress') continue
    const p = proj(l.projectId)
    if (!p || p.status !== 'active') continue
    if (daysBetween(l.etcUpdatedAt, todayISO) >= settings.etcStaleDays) stale.set(l.projectId, [...(stale.get(l.projectId) ?? []), l])
  }
  for (const [pid, list] of stale) {
    const p = proj(pid)!
    out.push({
      id: `etc_stale:${pid}`,
      kind: 'etc_stale',
      tone: 'info',
      title: `${p.name.split(/\s+/)[0]} 残りが${settings.etcStaleDays}日以上更新されていない作業 ${list.length}件`,
      detail: list.slice(0, 3).map((l) => l.title).join(' / '),
      to: `/projects/${pid}/wbs?task=${list[0].id}`,
      decision: false,
    })
  }

  // 7. 依存関係の矛盾（先行タスクが終わる前に開始日がある）
  const byId = new Map(input.leaves.map((l) => [l.id, l]))
  const dep = new Map<string, WbsItem[]>()
  for (const l of input.leaves) {
    if (!l.predecessorId || l.status === 'done') continue
    const pre = byId.get(l.predecessorId)
    if (pre && pre.status !== 'done' && l.startDate < pre.endDate) dep.set(l.projectId, [...(dep.get(l.projectId) ?? []), l])
  }
  for (const [pid, list] of dep) {
    const p = proj(pid)!
    out.push({
      id: `dependency:${pid}`,
      kind: 'dependency',
      tone: 'info',
      title: `${p.name.split(/\s+/)[0]} 先行タスクとの日程が矛盾 ${list.length}件`,
      detail: list.slice(0, 3).map((l) => l.title).join(' / '),
      to: `/projects/${pid}/wbs?task=${list[0].id}`,
      decision: false,
    })
  }

  // 8. PJ化判断（評価中・PJ化待ち）
  for (const o of opportunities) {
    if (o.stage !== 'evaluation' && o.stage !== 'approval_wait') continue
    const due = o.decisionDue
    const dueIn = due ? daysBetween(todayISO, due) : null
    if (o.stage === 'evaluation' && (dueIn === null || dueIn > 7)) continue
    out.push({
      id: `pj_decision:${o.id}`,
      kind: 'pj_decision',
      tone: dueIn !== null && dueIn <= 0 ? 'critical' : 'attention',
      title: `${custName(o.customerId)} PJ化判断`,
      detail: `${o.title}（確度${o.probability}%・${fmtManMonths(o.demands.reduce((s, d) => s + d.hours, 0))}）${due ? ` · 期限 ${due.slice(5).replace('-', '/')}${dueIn !== null && dueIn < 0 ? '（超過）' : ''}` : ''}`,
      to: `/pipeline/${o.id}/evaluation`,
      decision: true,
    })
  }

  // 9. 必要な役割が配置されていない（人員不足）
  for (const o of opportunities) {
    if (!isOpenOpp(o) || o.stage === 'consultation' || o.stage === 'explore') continue
    const gaps = roleGapsForOpp(o, assignments, settings.baseCapacity).filter((g) => g.gap > 1)
    if (gaps.length === 0) continue
    const startsIn = daysBetween(todayISO, o.startDate)
    out.push({
      id: `assignment_gap:opp:${o.id}`,
      kind: 'assignment_gap',
      tone: 'attention',
      title: `${custName(o.customerId)} 人員未配置（${gaps.length}役割）`,
      detail: `${o.title}：${gaps.map((g) => g.role).join('・')}（開始まで${Math.max(0, startsIn)}日）`,
      to: `/assignments?target=opp:${o.id}`,
      decision: o.probability >= 50 && startsIn <= 60,
    })
  }
  for (const p of input.projectById.values()) {
    if (p.status !== 'planned' || p.roleNeeds.length === 0) continue
    const gaps = roleGapsForProject(p, assignments, settings.baseCapacity).filter((g) => g.gap > 1)
    if (gaps.length === 0 || totalGap(gaps) <= 0) continue
    out.push({
      id: `assignment_gap:prj:${p.id}`,
      kind: 'assignment_gap',
      tone: 'attention',
      title: `${p.name.split(/\s+/)[0]} 人員未配置（${gaps.length}役割）`,
      detail: `${p.name}：${gaps.map((g) => g.role).join('・')}`,
      to: `/assignments?target=prj:${p.id}`,
      decision: true,
    })
  }

  return out.map((a, i) => ({ a, i })).sort((x, y) => rank(x.a.tone) - rank(y.a.tone) || x.i - y.i).map((x) => x.a)
}

