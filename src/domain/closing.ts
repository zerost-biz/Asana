import { addDays, format, getDaysInMonth } from 'date-fns'
import type { ISODate } from './types'

/**
 * 締め期間: 月を「前半（1日〜15日・15日締め）」と「後半（16日〜末日・末締め）」に分ける。
 * 「月全体」は前半と後半をまとめた月次の集計。作業時間は「作業日」で期間に振り分ける。
 */
export type ClosingKind = 'first' | 'second' | 'month'

export const CLOSING_KIND_LABEL: Record<ClosingKind, string> = {
  first: '前半（15日締め）',
  second: '後半（末締め）',
  month: '月全体',
}

export interface ClosingPeriod {
  year: number
  month: number
  kind: ClosingKind
  /** 期間の最初の日・最後の日（両端を含む） */
  start: ISODate
  end: ISODate
  /** 締め日 */
  closingDate: ISODate
  /** 例: 2026年10月 前半（1日〜15日・15日締め） */
  label: string
  /** ファイル名などに使う短い名前。例: 2026年10月前半 */
  shortLabel: string
}

const iso = (y: number, m: number, d: number): ISODate => format(new Date(y, m - 1, d), 'yyyy-MM-dd')

export function makePeriod(year: number, month: number, kind: ClosingKind): ClosingPeriod {
  const last = getDaysInMonth(new Date(year, month - 1, 1))
  const ym = `${year}年${month}月`
  switch (kind) {
    case 'first':
      return { year, month, kind, start: iso(year, month, 1), end: iso(year, month, 15), closingDate: iso(year, month, 15), label: `${ym} 前半（1日〜15日・15日締め）`, shortLabel: `${ym}前半` }
    case 'second':
      return { year, month, kind, start: iso(year, month, 16), end: iso(year, month, last), closingDate: iso(year, month, last), label: `${ym} 後半（16日〜${last}日・末締め）`, shortLabel: `${ym}後半` }
    default:
      return { year, month, kind, start: iso(year, month, 1), end: iso(year, month, last), closingDate: iso(year, month, last), label: `${ym} 月全体（1日〜${last}日）`, shortLabel: `${ym}` }
  }
}

/** その日が属する締め期間（前半 / 後半） */
export function periodContaining(date: Date): ClosingPeriod {
  return makePeriod(date.getFullYear(), date.getMonth() + 1, date.getDate() <= 15 ? 'first' : 'second')
}

/** 指定した種類のまま、その日を含む期間 */
export function periodOfKind(date: Date, kind: ClosingKind): ClosingPeriod {
  if (kind === 'month') return makePeriod(date.getFullYear(), date.getMonth() + 1, 'month')
  return periodContaining(date)
}

/** 前の期間（delta=-1）・次の期間（delta=+1）。前半/後半は半月ずつ、月全体は1か月ずつ動く */
export function stepPeriod(p: ClosingPeriod, delta: number): ClosingPeriod {
  if (p.kind === 'month') {
    const d = new Date(p.year, p.month - 1 + delta, 1)
    return makePeriod(d.getFullYear(), d.getMonth() + 1, 'month')
  }
  // 前半=0 後半=1 を通し番号にして動かす
  const n = (p.year * 12 + (p.month - 1)) * 2 + (p.kind === 'second' ? 1 : 0) + delta
  const half = ((n % 2) + 2) % 2
  const months = (n - half) / 2
  return makePeriod(Math.floor(months / 12), (((months % 12) + 12) % 12) + 1, half === 1 ? 'second' : 'first')
}

/** 日付（yyyy-MM-dd）が期間に入っているか（両端を含む） */
export const inPeriod = (date: ISODate, p: Pick<ClosingPeriod, 'start' | 'end'>): boolean => date >= p.start && date <= p.end

/** 期間の日数（両端を含む） */
export const periodDays = (p: Pick<ClosingPeriod, 'start' | 'end'>): number =>
  Math.round((new Date(p.end).getTime() - new Date(p.start).getTime()) / 86400000) + 1

export { addDays }
