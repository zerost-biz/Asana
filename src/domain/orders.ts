import type { InternalOrder, TimeEntry } from './types'

/** オーダー番号の表記ゆれ（前後の空白・全角英数・大文字小文字）をそろえる */
export const normalizeOrderCode = (s: string): string =>
  s
    .trim()
    .replace(/[Ａ-Ｚａ-ｚ０-９－]/g, (c) => (c === '－' ? '-' : String.fromCharCode(c.charCodeAt(0) - 0xfee0)))
    .toUpperCase()

/** 同じ番号のオーダーが既にあるか（番号は全プロジェクトで一意）。exceptId は編集中の自分自身 */
export const isOrderCodeTaken = (orders: InternalOrder[], code: string, exceptId?: string): boolean => {
  const n = normalizeOrderCode(code)
  return orders.some((o) => o.id !== exceptId && normalizeOrderCode(o.code) === n)
}

export const ordersOfProject = (orders: InternalOrder[], projectId: string): InternalOrder[] =>
  orders.filter((o) => o.projectId === projectId)

/** 新しく選べるオーダー = 使用中のもの（＋いま設定されている終了済みのもの） */
export const selectableOrders = (orders: InternalOrder[], projectId: string, currentId?: string): InternalOrder[] =>
  ordersOfProject(orders, projectId).filter((o) => o.status === 'active' || o.id === currentId)

/** 使用中のオーダーがちょうど1つなら、入力時の初期値にする */
export const defaultOrderId = (orders: InternalOrder[], projectId: string): string | undefined => {
  const active = orders.filter((o) => o.projectId === projectId && o.status === 'active')
  return active.length === 1 ? active[0].id : undefined
}

/** オーダーごとの作業時間（h）の合計 */
export function hoursByOrder(entries: TimeEntry[]): Map<string | null, number> {
  const m = new Map<string | null, number>()
  for (const e of entries) m.set(e.orderId ?? null, (m.get(e.orderId ?? null) ?? 0) + e.hours)
  return m
}
