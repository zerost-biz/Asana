import { fmtMD } from './dates'
import { fmtNum } from './format'
import { WBS_STATUS_LABEL, WBS_TYPE_LABEL, PRIORITY_LABEL, type User, type WbsItem } from './types'

const TRACKED: (keyof WbsItem)[] = [
  'title', 'type', 'ownerId', 'startDate', 'endDate', 'planHours', 'etcHours', 'progress', 'status',
  'priority', 'predecessorId', 'deliverableUrl', 'description',
]

/** 作業項目の変更を、更新履歴に出す1行の説明にする */
export function describeWbsChange(
  before: WbsItem,
  after: WbsItem,
  users: User[],
  title: (id: string | undefined) => string,
): { summary: string; before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const name = (id: string | null | undefined) => (id ? users.find((u) => u.id === id)?.name ?? id : '未設定')
  const parts: string[] = []
  const b: Record<string, unknown> = {}
  const a: Record<string, unknown> = {}
  for (const k of TRACKED) {
    if (before[k] === after[k]) continue
    b[k] = before[k]
    a[k] = after[k]
    switch (k) {
      case 'title': parts.push(`名称「${before.title}」→「${after.title}」`); break
      case 'type': parts.push(`種別 ${WBS_TYPE_LABEL[before.type]}→${WBS_TYPE_LABEL[after.type]}`); break
      case 'ownerId': parts.push(`担当 ${name(before.ownerId)}→${name(after.ownerId)}`); break
      case 'startDate': parts.push(`開始日 ${fmtMD(before.startDate)}→${fmtMD(after.startDate)}`); break
      case 'endDate': parts.push(`終了日 ${fmtMD(before.endDate)}→${fmtMD(after.endDate)}`); break
      case 'planHours': parts.push(`計画 ${fmtNum(before.planHours)}h→${fmtNum(after.planHours)}h`); break
      case 'etcHours': parts.push(`残り ${fmtNum(before.etcHours)}h→${fmtNum(after.etcHours)}h`); break
      case 'progress': parts.push(`進捗 ${before.progress}%→${after.progress}%`); break
      case 'status': parts.push(`状態 ${WBS_STATUS_LABEL[before.status]}→${WBS_STATUS_LABEL[after.status]}`); break
      case 'priority': parts.push(`優先度 ${PRIORITY_LABEL[before.priority]}→${PRIORITY_LABEL[after.priority]}`); break
      case 'predecessorId': parts.push(`先行 ${title(before.predecessorId)}→${title(after.predecessorId)}`); break
      case 'deliverableUrl': parts.push('成果物のURLを変更'); break
      case 'description': parts.push('説明を変更'); break
    }
  }
  if (parts.length === 0) return null
  return { summary: `${after.title}: ${parts.join(' / ')}`, before: b, after: a }
}
