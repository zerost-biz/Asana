import {
  addDays,
  differenceInCalendarDays,
  format,
  isWeekend,
  parseISO,
  startOfWeek,
} from 'date-fns'
import { ja } from 'date-fns/locale'
import type { ISODate } from './types'

export const toISO = (d: Date): ISODate => format(d, 'yyyy-MM-dd')
export const parseDate = (iso: ISODate): Date => parseISO(iso)

/** 月曜始まりの週頭 */
export const weekStartOf = (d: Date): Date => startOfWeek(d, { weekStartsOn: 1 })

export const isWorkday = (d: Date): boolean => !isWeekend(d)

/**
 * 「今日」を返す。デモ確認用に ?today=yyyy-MM-dd で固定できる。
 */
export function getToday(): Date {
  try {
    const q = new URLSearchParams(window.location.search).get('today')
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
      const d = parseISO(q)
      if (!Number.isNaN(d.getTime())) return d
    }
  } catch {
    /* ignore */
  }
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

/** from〜to（両端含む）の稼働日(平日)一覧 */
export function workdaysBetween(from: Date, to: Date): Date[] {
  const out: Date[] = []
  const total = differenceInCalendarDays(to, from)
  for (let i = 0; i <= total; i++) {
    const d = addDays(from, i)
    if (isWorkday(d)) out.push(d)
  }
  return out
}

export const daysBetween = (a: ISODate, b: ISODate): number =>
  differenceInCalendarDays(parseISO(b), parseISO(a))

/** 10/8 形式 */
export const fmtMD = (iso: ISODate): string => format(parseISO(iso), 'M/d')
export const fmtMDDate = (d: Date): string => format(d, 'M/d')
/** 10/8(水) 形式 */
export const fmtMDW = (iso: ISODate): string => format(parseISO(iso), 'M/d(E)', { locale: ja })
export const fmtFull = (d: Date): string => format(d, 'yyyy年M月d日(E)', { locale: ja })

export { addDays, differenceInCalendarDays }
