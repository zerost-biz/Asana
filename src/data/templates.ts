import { addDays, parseDate, toISO, workdaysBetween } from '../domain/dates'
import type { ISODate, WbsItem } from '../domain/types'

interface TemplateTask {
  title: string
  plan: number
}
interface TemplatePhase {
  title: string
  tasks: TemplateTask[]
}

/** 標準WBSテンプレート（現状分析 → To-Be設計 → ロードマップ策定） */
export const STANDARD_TEMPLATE: TemplatePhase[] = [
  {
    title: '現状分析',
    tasks: [
      { title: 'ヒアリング', plan: 20 },
      { title: '現場調査', plan: 24 },
      { title: 'As-Is整理', plan: 32 },
    ],
  },
  {
    title: 'To-Be設計',
    tasks: [
      { title: '課題整理', plan: 16 },
      { title: '構想策定', plan: 40 },
      { title: 'システム構成', plan: 32 },
    ],
  },
  {
    title: 'ロードマップ策定',
    tasks: [
      { title: 'ロードマップ案作成', plan: 16 },
      { title: '概算見積・報告', plan: 16 },
    ],
  },
]

export const templateTotalHours = (): number =>
  STANDARD_TEMPLATE.reduce((s, p) => s + p.tasks.reduce((t, k) => t + k.plan, 0), 0)

/**
 * テンプレートから WBS を生成する。
 * 各タスクの期間は、プロジェクト期間の稼働日を PLAN 工数の比率で順番に割り当てる（ウォーターフォール）。
 * 担当者は ownerIds を順番に割り当てる（1人なら全タスクがその人、複数なら持ち回り、空なら未設定）。
 * あとから WBS のドロワーで個別に変更できる。
 */
export function buildTemplateItems(
  projectId: string,
  startDate: ISODate,
  endDate: ISODate,
  ownerIds: string[],
  newId: (prefix: string) => string,
): WbsItem[] {
  let days = workdaysBetween(parseDate(startDate), parseDate(endDate))
  if (days.length === 0) days = [parseDate(startDate)]
  const total = templateTotalHours()
  const n = days.length
  const dayISO = (i: number): ISODate => toISO(days[Math.min(n - 1, Math.max(0, i))] ?? addDays(parseDate(startDate), 0))

  const items: WbsItem[] = []
  let cum = 0
  let taskNo = 0
  for (const phase of STANDARD_TEMPLATE) {
    const phaseId = newId('w')
    const children: WbsItem[] = []
    for (const t of phase.tasks) {
      const from = Math.floor((cum / total) * n)
      cum += t.plan
      const to = Math.max(from, Math.ceil((cum / total) * n) - 1)
      children.push({
        id: newId('w'),
        projectId,
        parentId: phaseId,
        title: t.title,
        ownerId: ownerIds.length > 0 ? ownerIds[taskNo++ % ownerIds.length] : null,
        startDate: dayISO(from),
        endDate: dayISO(to),
        planHours: t.plan,
        etcHours: t.plan,
        progress: 0,
        status: 'Not started',
      })
    }
    items.push({
      id: phaseId,
      projectId,
      parentId: null,
      title: phase.title,
      ownerId: null,
      startDate: children[0].startDate,
      endDate: children[children.length - 1].endDate,
      planHours: 0,
      etcHours: 0,
      progress: 0,
      status: 'Not started',
    })
    items.push(...children)
  }
  return items
}
