import { inPeriod, type ClosingPeriod } from './closing'
import type { CsvCell } from './csv'
import type { Customer, InternalOrder, Project, TimeEntry, User, WbsItem } from './types'

/** オーダーが未設定の作業時間の表示名 */
export const NO_ORDER_CODE = '（未設定）'

export interface ReportContext {
  entries: TimeEntry[]
  wbsById: Map<string, WbsItem>
  /** WBS番号（"1.2.1"）。無ければ空欄 */
  wbsNumbers?: Map<string, string>
  projects: Project[]
  customers: Customer[]
  orders: InternalOrder[]
  users: User[]
  /** 担当者の時間単価（円/時間）。実績の人件費は「入力した人」の単価で計算する */
  rateOf: (userId: string | null) => number
}

export interface ReportFilter {
  period: Pick<ClosingPeriod, 'start' | 'end'>
  /** 'all' なら全プロジェクト */
  projectId: string | 'all'
}

/** 作業時間1件ぶん */
export interface DetailRow {
  date: string
  projectId: string
  projectName: string
  customerName: string
  orderId: string | null
  orderCode: string
  orderName: string
  wbsNo: string
  wbsTitle: string
  userId: string
  userName: string
  hours: number
  rate: number
  cost: number
  comment: string
}

export interface SummaryRow {
  projectId: string
  projectName: string
  customerName: string
  orderId: string | null
  orderCode: string
  orderName: string
  /** 担当者別に分けたときだけ入る */
  userId: string | null
  userName: string
  hours: number
  cost: number
  /** 作業時間の件数 */
  count: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** 期間・プロジェクトで絞り込んだ作業時間の明細（日付 → プロジェクト → オーダー → 作業の順） */
export function buildDetail(ctx: ReportContext, f: ReportFilter): DetailRow[] {
  const projectById = new Map(ctx.projects.map((p) => [p.id, p]))
  const customerById = new Map(ctx.customers.map((c) => [c.id, c]))
  const orderById = new Map(ctx.orders.map((o) => [o.id, o]))
  const userById = new Map(ctx.users.map((u) => [u.id, u]))
  const out: DetailRow[] = []
  for (const e of ctx.entries) {
    if (!inPeriod(e.date, f.period)) continue
    if (f.projectId !== 'all' && e.projectId !== f.projectId) continue
    const p = projectById.get(e.projectId)
    const o = e.orderId ? orderById.get(e.orderId) : undefined
    const w = ctx.wbsById.get(e.wbsId)
    const rate = ctx.rateOf(e.userId)
    out.push({
      date: e.date,
      projectId: e.projectId,
      projectName: p?.name ?? '（削除されたプロジェクト）',
      customerName: customerById.get(p?.customerId ?? '')?.name ?? '',
      orderId: o?.id ?? null,
      orderCode: o?.code ?? NO_ORDER_CODE,
      orderName: o?.name ?? '',
      wbsNo: ctx.wbsNumbers?.get(e.wbsId) ?? '',
      wbsTitle: w?.title ?? '（削除された作業）',
      userId: e.userId,
      userName: userById.get(e.userId)?.name ?? e.userId,
      hours: e.hours,
      rate,
      cost: e.hours * rate,
      comment: e.comment,
    })
  }
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.projectName.localeCompare(b.projectName, 'ja') ||
      a.orderCode.localeCompare(b.orderCode) ||
      a.wbsNo.localeCompare(b.wbsNo, undefined, { numeric: true }) ||
      a.userName.localeCompare(b.userName, 'ja'),
  )
}

/** オーダー別の集計（プロジェクト → オーダー番号の順。未設定は各プロジェクトの最後）。byUser なら担当者別にも分ける */
export function buildSummary(detail: DetailRow[], byUser = false): SummaryRow[] {
  const map = new Map<string, SummaryRow>()
  for (const d of detail) {
    const key = `${d.projectId}|${d.orderId ?? ''}|${byUser ? d.userId : ''}`
    const cur =
      map.get(key) ??
      ({
        projectId: d.projectId,
        projectName: d.projectName,
        customerName: d.customerName,
        orderId: d.orderId,
        orderCode: d.orderCode,
        orderName: d.orderName,
        userId: byUser ? d.userId : null,
        userName: byUser ? d.userName : '',
        hours: 0,
        cost: 0,
        count: 0,
      } satisfies SummaryRow)
    cur.hours += d.hours
    cur.cost += d.cost
    cur.count += 1
    map.set(key, cur)
  }
  return [...map.values()].sort(
    (a, b) =>
      a.projectName.localeCompare(b.projectName, 'ja') ||
      Number(a.orderId === null) - Number(b.orderId === null) ||
      a.orderCode.localeCompare(b.orderCode) ||
      a.userName.localeCompare(b.userName, 'ja'),
  )
}

export const sumHours = (rows: { hours: number }[]): number => rows.reduce((s, r) => s + r.hours, 0)
export const sumCost = (rows: { cost: number }[]): number => rows.reduce((s, r) => s + r.cost, 0)

/* ---------------- CSV ---------------- */

const periodCells = (p: Pick<ClosingPeriod, 'start' | 'end'> & { shortLabel?: string }): CsvCell[] => [p.shortLabel ?? '', p.start, p.end]

export function summaryCsvRows(rows: SummaryRow[], period: ClosingPeriod, opts: { byUser: boolean; total: boolean }): CsvCell[][] {
  const head: CsvCell[] = ['締め期間', '期間開始', '期間終了', 'プロジェクト', '顧客', '社内オーダー番号', 'オーダー名']
  if (opts.byUser) head.push('担当者')
  head.push('作業時間(h)', '人件費(円)', '件数')
  const body = rows.map((r): CsvCell[] => {
    const c: CsvCell[] = [...periodCells(period), r.projectName, r.customerName, r.orderCode, r.orderName]
    if (opts.byUser) c.push(r.userName)
    c.push(round2(r.hours), Math.round(r.cost), r.count)
    return c
  })
  if (opts.total) {
    const t: CsvCell[] = [...periodCells(period), '合計', '', '', '']
    if (opts.byUser) t.push('')
    t.push(round2(sumHours(rows)), Math.round(sumCost(rows)), rows.reduce((s, r) => s + r.count, 0))
    body.push(t)
  }
  return [head, ...body]
}

export function detailCsvRows(rows: DetailRow[], period: ClosingPeriod, opts: { total: boolean }): CsvCell[][] {
  const head: CsvCell[] = ['締め期間', '作業日', 'プロジェクト', '顧客', '社内オーダー番号', 'オーダー名', '作業番号', '作業', '担当者', '作業時間(h)', '時間単価(円/h)', '人件費(円)', 'コメント']
  const body = rows.map((r): CsvCell[] => [
    period.shortLabel, r.date, r.projectName, r.customerName, r.orderCode, r.orderName, r.wbsNo, r.wbsTitle, r.userName, round2(r.hours), Math.round(r.rate), Math.round(r.cost), r.comment,
  ])
  if (opts.total) body.push([period.shortLabel, '', '合計', '', '', '', '', '', '', round2(sumHours(rows)), '', Math.round(sumCost(rows)), ''])
  return [head, ...body]
}

/** ファイル名: 社内オーダー別集計_2026年10月前半.csv */
export const reportFileName = (kind: 'summary' | 'detail', period: ClosingPeriod, projectName?: string): string =>
  `${kind === 'summary' ? '社内オーダー別集計' : '作業時間明細'}_${period.shortLabel}${projectName ? `_${projectName.replace(/[\\/:*?"<>|\s]+/g, '')}` : ''}.csv`
