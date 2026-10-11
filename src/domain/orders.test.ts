import { describe, expect, it } from 'vitest'
import type { InternalOrder } from './types'
import { defaultOrderId, isOrderCodeTaken, normalizeOrderCode, selectableOrders } from './orders'

const o = (id: string, projectId: string, code: string, status: InternalOrder['status'] = 'active'): InternalOrder => ({ id, projectId, code, name: code, status })
const orders = [o('a', 'p1', 'IO-2601-001'), o('b', 'p1', 'IO-2601-002', 'closed'), o('c', 'p2', 'IO-2601-010')]

describe('社内オーダー', () => {
  it('番号の表記ゆれ（空白・全角・小文字）をそろえる', () => {
    expect(normalizeOrderCode('  io-2601-003 ')).toBe('IO-2601-003')
    expect(normalizeOrderCode('ＩＯ－２６０１－００３')).toBe('IO-2601-003')
  })

  it('番号は全プロジェクトで一意（自分自身は除く）', () => {
    expect(isOrderCodeTaken(orders, 'io-2601-010')).toBe(true)
    expect(isOrderCodeTaken(orders, 'IO-2601-010', 'c')).toBe(false)
    expect(isOrderCodeTaken(orders, 'IO-2601-099')).toBe(false)
  })

  it('選べるのは使用中のオーダー（いま設定されている終了済みも残す）', () => {
    expect(selectableOrders(orders, 'p1').map((x) => x.id)).toEqual(['a'])
    expect(selectableOrders(orders, 'p1', 'b').map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('使用中のオーダーがちょうど1つのときだけ、入力時の初期値になる', () => {
    expect(defaultOrderId(orders, 'p1')).toBe('a')
    expect(defaultOrderId([...orders, o('d', 'p1', 'IO-2601-004')], 'p1')).toBeUndefined()
    expect(defaultOrderId(orders, 'nobody')).toBeUndefined()
  })
})
