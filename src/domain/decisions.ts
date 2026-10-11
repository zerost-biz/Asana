import type { Project, Risk } from './types'
import type { HealthInfo } from './calculations'
import type { WorkloadMatrix } from './workload'
import { fmtSignedH, fmtSignedYen, fmtYen } from './format'

export type DecisionKind = 'overload' | 'eac' | 'margin' | 'risk' | 'overdue' | 'blocked'

/** 粗利率がこれを下回ると「要判断」に出す（プロトタイプの目安） */
export const MARGIN_TARGET = 0.1
/** red は「重大リスク・100%超負荷」に限定するため、severity は 2 段階で表す */
export type DecisionTone = 'critical' | 'attention'

export interface Decision {
  id: string
  kind: DecisionKind
  tone: DecisionTone
  title: string
  detail: string
  /** クリック時の遷移先 */
  to: string
}

export interface ProjectDecisionInput {
  project: Project
  health: HealthInfo
  variance: number
  plan: number
  /** 受注額・EAC原価・粗利率（受注額が未設定なら null） */
  cost: { budget: number; eacCost: number; margin: number; marginRate: number } | null
  /** 遅延している最下位タスク（先頭を遷移先にする） */
  overdue: { id: string; title: string; days: number }[]
  blocked: { id: string; title: string }[]
}

/**
 * 「要判断」リストを現在の状態から導出する。
 * 入力（工数・WBS・Workload）が変わるたびに再計算されるため、Dashboard が常に最新になる。
 */
export function buildDecisions(
  matrix: WorkloadMatrix,
  projects: ProjectDecisionInput[],
  risks: Risk[],
  projectById: Map<string, Project>,
  shortName: (p: Project) => string,
): Decision[] {
  const out: Decision[] = []

  // 1. 過負荷 (100%超)
  const over: Decision[] = []
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
        })
      }
    })
  })
  over.sort((a, b) => {
    const pa = Number(a.title.match(/(\d+)%/)?.[1] ?? 0)
    const pb = Number(b.title.match(/(\d+)%/)?.[1] ?? 0)
    return pb - pa
  })
  out.push(...over)

  // 2. プロジェクト単位 (EAC超過 / 遅延 / Blocked)
  for (const p of projects) {
    if (p.project.status === 'completed') continue
    const name = shortName(p.project)
    if (p.variance > 0 && p.health.varianceRatio >= 0.05) {
      out.push({
        id: `eac:${p.project.id}`,
        kind: 'eac',
        tone: p.health.varianceRatio >= 0.15 ? 'critical' : 'attention',
        title: `${name} EAC ${fmtSignedH(p.variance)}`,
        detail: `PLANを${Math.round(p.health.varianceRatio * 100)}%超過する見込み。スコープ/体制の見直しを判断`,
        to: `/projects/${p.project.id}`,
      })
    }
    if (p.cost && p.cost.marginRate < MARGIN_TARGET) {
      const c = p.cost
      out.push({
        id: `margin:${p.project.id}`,
        kind: 'margin',
        tone: c.marginRate < 0 ? 'critical' : 'attention',
        title: `${name} 粗利率 ${Math.round(c.marginRate * 100)}%`,
        detail: `受注 ${fmtYen(c.budget)} − EAC原価 ${fmtYen(c.eacCost)} ＝ 粗利 ${fmtSignedYen(c.margin)}（目安 ${Math.round(MARGIN_TARGET * 100)}%）`,
        to: `/projects/${p.project.id}/dashboard`,
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
        to: `/projects/${p.project.id}?task=${worst.id}`,
      })
    }
    if (p.blocked.length > 0) {
      out.push({
        id: `blocked:${p.project.id}`,
        kind: 'blocked',
        tone: 'attention',
        title: `${name} Blockedタスク ${p.blocked.length}件`,
        detail: p.blocked.map((b) => b.title).join(' / '),
        to: `/projects/${p.project.id}?task=${p.blocked[0].id}`,
      })
    }
  }

  // 3. 未解決リスク（high / medium）
  for (const r of risks) {
    // 監視中(watching)は判断不要。未解決(open)の high / medium のみ
    if (r.status !== 'open' || r.severity === 'low') continue
    const p = projectById.get(r.projectId)
    if (!p || p.status === 'completed') continue
    out.push({
      id: `risk:${r.id}`,
      kind: 'risk',
      tone: r.severity === 'high' ? 'critical' : 'attention',
      title: `${shortName(p)} ${r.title}`,
      detail: r.severity === 'high' ? '重大リスク（未解決）' : 'リスク（要判断）',
      to: `/projects/${p.id}/dashboard`,
    })
  }

  // 並び: critical → attention（同tone内は生成順）
  const rank = (t: DecisionTone) => (t === 'critical' ? 0 : 1)
  return out.map((d, i) => ({ d, i })).sort((a, b) => rank(a.d.tone) - rank(b.d.tone) || a.i - b.i).map((x) => x.d)
}

