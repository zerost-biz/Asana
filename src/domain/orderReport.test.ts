import { describe, expect, it } from 'vitest'
import { entry, wbs } from '../test/factories'
import { makePeriod } from './closing'
import { toCsv } from './csv'
import { buildDetail, buildSummary, detailCsvRows, NO_ORDER_CODE, reportFileName, summaryCsvRows, sumCost, sumHours } from './orderReport'
import type { Customer, InternalOrder, Project, User } from './types'

const projects = [
  { id: 'p', name: 'B社 MES構想', customerId: 'c' },
  { id: 'q', name: 'A社 SaaS導入', customerId: 'c2' },
] as Project[]
const customers = [{ id: 'c', name: 'B社', industry: '' }, { id: 'c2', name: 'A社', industry: '' }] as Customer[]
const orders: InternalOrder[] = [
  { id: 'o1', projectId: 'p', code: 'IO-1', name: '現状分析', status: 'active' },
  { id: 'o2', projectId: 'p', code: 'IO-2', name: 'To-Be', status: 'active' },
  { id: 'o3', projectId: 'q', code: 'IO-3', name: 'SaaS', status: 'active' },
]
const users = [{ id: 'u-k', name: 'Kさん' }, { id: 'u-h', name: 'Hさん' }] as User[]
const rates: Record<string, number> = { 'u-k': 8000, 'u-h': 7000 }
const wbsById = new Map([['x', wbs({ id: 'x', title: 'As-Is整理' })], ['y', wbs({ id: 'y', projectId: 'q', title: '設定' })]])

const entries = [
  entry({ id: '1', date: '2026-10-01', hours: 4, orderId: 'o1' }),
  entry({ id: '2', date: '2026-10-15', hours: 3, orderId: 'o1', userId: 'u-h' }),
  entry({ id: '3', date: '2026-10-16', hours: 2, orderId: 'o2' }),
  entry({ id: '4', date: '2026-10-31', hours: 5, orderId: 'o2', comment: '=危険,"引用"' }),
  entry({ id: '5', date: '2026-09-30', hours: 8, orderId: 'o1' }),
  entry({ id: '6', date: '2026-11-01', hours: 8, orderId: 'o1' }),
  entry({ id: '7', date: '2026-10-10', hours: 1.5 }), // オーダー未設定
  entry({ id: '8', date: '2026-10-20', hours: 6, projectId: 'q', wbsId: 'y', orderId: 'o3' }),
]
const ctx = { entries, wbsById, wbsNumbers: new Map([['x', '1.3']]), projects, customers, orders, users, rateOf: (id: string | null) => (id ? rates[id] ?? 0 : 0) }
const first = makePeriod(2026, 10, 'first')
const second = makePeriod(2026, 10, 'second')

describe('社内オーダー別レポート（15日締め・末締め）', () => {
  it('15日締め: 1日〜15日の作業時間だけ（15日を含み、16日は含まない）', () => {
    const d = buildDetail(ctx, { period: first, projectId: 'all' })
    expect(d.map((r) => r.date)).toEqual(['2026-10-01', '2026-10-10', '2026-10-15'])
    expect(sumHours(d)).toBe(8.5)
  })

  it('末締め: 16日〜末日（末日を含み、翌月1日は含まない）', () => {
    const d = buildDetail(ctx, { period: second, projectId: 'all' })
    expect(d.map((r) => r.date)).toEqual(['2026-10-16', '2026-10-20', '2026-10-31'])
  })

  it('月全体は 前半 + 後半 の合計に一致する', () => {
    const m = buildDetail(ctx, { period: makePeriod(2026, 10, 'month'), projectId: 'all' })
    const f = buildDetail(ctx, { period: first, projectId: 'all' })
    const s = buildDetail(ctx, { period: second, projectId: 'all' })
    expect(sumHours(m)).toBe(sumHours(f) + sumHours(s))
    expect(sumCost(m)).toBe(sumCost(f) + sumCost(s))
  })

  it('人件費 = 時間 × 入力した人の単価', () => {
    const d = buildDetail(ctx, { period: first, projectId: 'all' })
    expect(d.find((r) => r.date === '2026-10-01')).toMatchObject({ hours: 4, rate: 8000, cost: 32000, userName: 'Kさん' })
    expect(d.find((r) => r.date === '2026-10-15')).toMatchObject({ rate: 7000, cost: 21000, userName: 'Hさん' })
  })

  it('オーダー未設定は「（未設定）」として残る（集計から落とさない）', () => {
    const d = buildDetail(ctx, { period: first, projectId: 'all' })
    const unset = d.find((r) => r.orderId === null)!
    expect(unset.orderCode).toBe(NO_ORDER_CODE)
    const s = buildSummary(d)
    expect(sumHours(s)).toBe(sumHours(d))
    expect(s.find((r) => r.orderId === null)).toMatchObject({ hours: 1.5 })
  })

  it('プロジェクトで絞り込める', () => {
    const d = buildDetail(ctx, { period: second, projectId: 'q' })
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ projectName: 'A社 SaaS導入', orderCode: 'IO-3', customerName: 'A社' })
  })

  it('オーダー別に集計し、同じプロジェクト内では未設定が最後、担当者別にも分けられる', () => {
    const d = buildDetail(ctx, { period: makePeriod(2026, 10, 'month'), projectId: 'p' })
    const s = buildSummary(d)
    expect(s.map((r) => [r.orderCode, r.hours])).toEqual([['IO-1', 7], ['IO-2', 7], [NO_ORDER_CODE, 1.5]])
    const u = buildSummary(d, true)
    expect(u.filter((r) => r.orderCode === 'IO-1').map((r) => [r.userName, r.hours])).toEqual([['Hさん', 3], ['Kさん', 4]])
  })

  it('CSV: 見出し・期間・合計行つき。コメントの危険な文字は無害化される', () => {
    const d = buildDetail(ctx, { period: second, projectId: 'p' })
    const rows = detailCsvRows(d, second, { total: true })
    const text = toCsv(rows)
    expect(rows[0]).toContain('社内オーダー番号')
    expect(text).toContain("'=危険")
    expect(text).toContain('""引用""')
    expect(rows.at(-1)).toContain('合計')
    const sum = summaryCsvRows(buildSummary(d), second, { byUser: false, total: false })
    expect(sum[0]).toEqual(['締め期間', '期間開始', '期間終了', 'プロジェクト', '顧客', '社内オーダー番号', 'オーダー名', '作業時間(h)', '人件費(円)', '件数'])
    expect(sum[1]).toEqual(['2026年10月後半', '2026-10-16', '2026-10-31', 'B社 MES構想', 'B社', 'IO-2', 'To-Be', 7, 56000, 2])
  })

  it('ファイル名に期間とプロジェクト名が入る', () => {
    expect(reportFileName('summary', first)).toBe('社内オーダー別集計_2026年10月前半.csv')
    expect(reportFileName('detail', second, 'B社 MES構想')).toBe('作業時間明細_2026年10月後半_B社MES構想.csv')
  })
})
