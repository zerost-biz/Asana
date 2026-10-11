import { addDays, parseDate, toISO, workdaysBetween } from '../domain/dates'
import type { ISODate, WbsItem, WbsType } from '../domain/types'

interface TplNode {
  title: string
  type?: WbsType
  /** タスクの計画時間 (h)。親は子の合計 */
  plan?: number
  kids?: TplNode[]
}

const task = (title: string, plan: number): TplNode => ({ title, plan })
const wp = (title: string, kids: TplNode[]): TplNode => ({ title, type: 'work_package', kids })
const milestone = (title: string): TplNode => ({ title, type: 'milestone', plan: 0 })

/** 標準の作業テンプレート（フェーズ > 作業パッケージ > タスク + マイルストーン） */
export const STANDARD_TEMPLATE: TplNode[] = [
  {
    title: '現状分析',
    type: 'phase',
    kids: [
      wp('ヒアリング', [task('質問票の作成', 4), task('ヒアリングの実施', 12), task('議事録・整理', 4)]),
      wp('現場調査', [task('調査計画', 4), task('現場調査', 16), task('結果のまとめ', 4)]),
      wp('As-Is整理', [task('業務フローの整理', 12), task('課題一覧の作成', 8), task('As-Is報告', 4)]),
      milestone('現状分析完了'),
    ],
  },
  {
    title: 'To-Be設計',
    type: 'phase',
    kids: [
      wp('課題整理', [task('課題の分類', 6), task('優先順位づけ', 6)]),
      wp('構想策定', [task('構想案の作成', 20), task('構想レビュー', 8)]),
      wp('システム構成', [task('構成案の作成', 16), task('実現性の確認', 8)]),
      milestone('To-Be設計レビュー'),
    ],
  },
  {
    title: 'ロードマップ策定',
    type: 'phase',
    kids: [
      wp('ロードマップ', [task('ロードマップ案の作成', 12), task('関係者との調整', 4)]),
      wp('概算見積・報告', [task('概算見積', 8), task('経営報告', 8)]),
      milestone('最終報告'),
    ],
  },
]

const planOf = (n: TplNode): number => (n.kids ? n.kids.reduce((s, k) => s + planOf(k), 0) : n.plan ?? 0)
const countTasks = (n: TplNode): number => (n.kids ? n.kids.reduce((s, k) => s + countTasks(k), 0) : n.type === 'milestone' ? 0 : 1)

export const templateTotalHours = (): number => STANDARD_TEMPLATE.reduce((s, n) => s + planOf(n), 0)
export const templateTaskCount = (): number => STANDARD_TEMPLATE.reduce((s, n) => s + countTasks(n), 0)

/**
 * テンプレートから作業項目を生成する。
 * 各タスクの期間は、期間内の営業日を計画時間の比率で順番に割り当てる（ウォーターフォール）。
 * 先行タスクは直前のタスクにして、マイルストーンは直前のタスクの終了日に置く。
 * 担当者は ownerIds を順番に割り当てる（1人なら全タスクがその人、複数なら持ち回り、空なら未設定）。
 */
export function buildTemplateItems(
  projectId: string,
  startDate: ISODate,
  endDate: ISODate,
  ownerIds: string[],
  newId: (prefix: string) => string,
  today: ISODate,
): WbsItem[] {
  let days = workdaysBetween(parseDate(startDate), parseDate(endDate))
  if (days.length === 0) days = [parseDate(startDate)]
  const total = Math.max(1, templateTotalHours())
  const n = days.length
  const dayISO = (i: number): ISODate => toISO(days[Math.min(n - 1, Math.max(0, i))] ?? addDays(parseDate(startDate), 0))

  const items: WbsItem[] = []
  let cum = 0
  let taskNo = 0
  let prevTaskId: string | undefined
  let lastEnd: ISODate = dayISO(0)

  const base = (id: string, parentId: string | null, type: WbsType, title: string, s: ISODate, e: ISODate, plan: number): WbsItem => ({
    id, projectId, parentId, type, title, ownerId: null,
    startDate: s, endDate: e, planHours: plan, etcHours: plan, progress: 0, status: 'not_started', priority: 'medium',
    baselinePlanHours: plan, baselineStart: s, baselineEnd: e, statusChangedAt: today, etcUpdatedAt: today,
  })

  const walk = (node: TplNode, parentId: string | null, depth: number): { start: ISODate; end: ISODate } => {
    const id = newId('w')
    if (node.kids) {
      const type: WbsType = node.type ?? (depth === 0 ? 'phase' : 'work_package')
      const holder = base(id, parentId, type, node.title, lastEnd, lastEnd, 0)
      items.push(holder)
      const ranges = node.kids.map((k) => walk(k, id, depth + 1))
      holder.startDate = ranges[0].start
      holder.endDate = ranges[ranges.length - 1].end
      holder.baselineStart = holder.startDate
      holder.baselineEnd = holder.endDate
      return { start: holder.startDate, end: holder.endDate }
    }
    if (node.type === 'milestone') {
      const m = base(id, parentId, 'milestone', node.title, lastEnd, lastEnd, 0)
      m.ownerId = ownerIds[0] ?? null
      m.predecessorId = prevTaskId
      items.push(m)
      return { start: lastEnd, end: lastEnd }
    }
    const plan = node.plan ?? 0
    const from = Math.floor((cum / total) * n)
    cum += plan
    const to = Math.max(from, Math.ceil((cum / total) * n) - 1)
    const t = base(id, parentId, 'task', node.title, dayISO(from), dayISO(to), plan)
    t.ownerId = ownerIds.length > 0 ? ownerIds[taskNo++ % ownerIds.length] : null
    t.predecessorId = prevTaskId
    prevTaskId = id
    lastEnd = t.endDate
    items.push(t)
    return { start: t.startDate, end: t.endDate }
  }

  STANDARD_TEMPLATE.forEach((n) => walk(n, null, 0))
  return items
}
