import type { Assignment, EvalAxis, EvalScores, Opportunity, Project, RoleDemand, Settings } from './types'
import { EVAL_AXES } from './types'
import type { OppStage } from './types'

/** 1人月 = 160時間 */
export const HOURS_PER_MONTH = 160

export const toManMonths = (hours: number): number => hours / HOURS_PER_MONTH
export const fmtManMonths = (hours: number): string => `${(Math.round(toManMonths(hours) * 10) / 10).toFixed(1)}人月`

/** 段階ごとの標準の確度(%)。段階を動かしたとき、確度が標準のままなら新しい段階の標準へ合わせる */
export const STAGE_DEFAULT_PROB: Record<OppStage, number> = {
  consultation: 20,
  explore: 30,
  candidate: 50,
  evaluation: 70,
  approval_wait: 90,
  converted: 100,
  lost: 0,
}

/** 概算総工数（役割別の合計） */
export const oppHours = (o: Pick<Opportunity, 'demands'>): number => o.demands.reduce((s, d) => s + d.hours, 0)

/** 確度加重の工数（Expected） */
export const weightedHours = (o: Opportunity): number => (oppHours(o) * o.probability) / 100

export const isOpenOpp = (o: Opportunity): boolean => o.stage !== 'converted' && o.stage !== 'lost'

export interface RoleGap {
  role: string
  /** 必要な時間 */
  demand: number
  /** 配置済みの時間（仮 + 確定） */
  assigned: number
  gap: number
  /** 必要人数（週あたりの人数換算） */
  fte: number
}

/** 役割ごとの 必要 − 配置済み。期間全体で比較する */
export function roleGapsForOpp(o: Opportunity, assignments: Assignment[], baseCapacity: number): RoleGap[] {
  const weeks = Math.max(1, (new Date(o.endDate).getTime() - new Date(o.startDate).getTime()) / (7 * 86400000))
  return o.demands.map((d) => {
    const assigned = assignments
      .filter((a) => a.targetType === 'opportunity' && a.targetId === o.id && a.role === d.role)
      .reduce((s, a) => s + a.plannedHours, 0)
    return {
      role: d.role,
      demand: d.hours,
      assigned,
      gap: Math.max(0, d.hours - assigned),
      fte: d.hours / weeks / baseCapacity,
    }
  })
}

export function roleGapsForProject(p: Project, assignments: Assignment[], baseCapacity: number): RoleGap[] {
  const weeks = Math.max(1, (new Date(p.endDate).getTime() - new Date(p.startDate).getTime()) / (7 * 86400000))
  return p.roleNeeds.map((n) => {
    const demand = n.fte * baseCapacity * weeks
    const assigned = assignments
      .filter((a) => a.targetType === 'project' && a.targetId === p.id && a.role === n.role)
      .reduce((s, a) => s + a.plannedHours, 0)
    return { role: n.role, demand, assigned, gap: Math.max(0, demand - assigned), fte: n.fte }
  })
}

export const totalGap = (gaps: RoleGap[]): number => gaps.reduce((s, g) => s + g.gap, 0)

/** 週あたりの時間 → FTE（人数換算） */
export const toFte = (hoursPerWeek: number, baseCapacity: number): number => (baseCapacity > 0 ? hoursPerWeek / baseCapacity : 0)

/* ------------------------------------------------------------------ */
/* PJ化評価（推奨判断材料。自動で可否は決めない）                         */
/* ------------------------------------------------------------------ */

export interface EvalResult {
  /** 入力済みの軸の平均 × 20（0〜100）。未入力の軸は除外 */
  score: number | null
  answered: number
  total: number
  /** 推奨の目安 */
  recommendation: 'go' | 'consider' | 'hold' | 'incomplete'
  label: string
}

export function evaluateOpp(scores: EvalScores): EvalResult {
  const vals = EVAL_AXES.map((a) => scores[a.key]).filter((v): v is number => typeof v === 'number' && v > 0)
  const total = EVAL_AXES.length
  if (vals.length < Math.ceil(total / 2)) {
    return { score: null, answered: vals.length, total, recommendation: 'incomplete', label: '評価の入力が足りません（半数以上の軸を入力してください）' }
  }
  const score = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 20)
  const feas = scores.feasibility ?? 3
  if (score >= 70 && feas >= 3) return { score, answered: vals.length, total, recommendation: 'go', label: 'PJ化を推奨' }
  if (score >= 50) return { score, answered: vals.length, total, recommendation: 'consider', label: '要検討（懸念点を確認）' }
  return { score, answered: vals.length, total, recommendation: 'hold', label: '見送り寄り（再評価を推奨）' }
}

/** 人員確保の実現性の目安点（1〜5）。必要時間に対する、期間中の空き時間の割合から算出（入力の参考値） */
export function suggestFeasibility(demandHours: number, freeHours: number): number {
  if (demandHours <= 0) return 3
  const r = freeHours / demandHours
  if (r >= 1.5) return 5
  if (r >= 1.1) return 4
  if (r >= 0.8) return 3
  if (r >= 0.5) return 2
  return 1
}

export const EVAL_LABEL: Record<EvalAxis, string> = Object.fromEntries(EVAL_AXES.map((a) => [a.key, a.label])) as Record<EvalAxis, string>

export type { RoleDemand, Settings }
