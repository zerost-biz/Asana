/** 工数 (h) を表示用に整形。整数なら小数なし、それ以外は小数1桁（末尾0は省略） */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '-'
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

export const fmtH = (n: number): string => `${fmtNum(n)}h`

/** 差分表示: +4h / -2h / ±0h */
export function fmtSignedH(n: number): string {
  const r = Math.round(n * 10) / 10
  if (r === 0) return '±0h'
  return `${r > 0 ? '+' : '-'}${fmtNum(Math.abs(r))}h`
}

export const fmtPct = (ratio: number | null): string =>
  ratio === null || !Number.isFinite(ratio) ? '-' : `${Math.round(ratio * 100)}%`

/** 1人日 = 8時間 */
export const HOURS_PER_DAY = 8

/** 人日表記: 4.5人日 */
export const fmtDays = (hours: number): string => `${fmtNum(hours / HOURS_PER_DAY)}人日`

/** 金額（円）: ¥1,234,000 / -¥5,000 */
export function fmtYen(n: number): string {
  if (!Number.isFinite(n)) return '-'
  const r = Math.round(n)
  return `${r < 0 ? '-' : ''}¥${Math.abs(r).toLocaleString('ja-JP')}`
}

/** 表の中で使う短い金額表記: 187万 / 23.4万 / 5,200 */
export function fmtYenShort(n: number): string {
  if (!Number.isFinite(n)) return '-'
  const a = Math.abs(n)
  const sign = n < 0 && Math.round(a) !== 0 ? '-' : ''
  if (a >= 10000) {
    const m = a / 10000
    return `${sign}${m >= 100 ? Math.round(m).toLocaleString('ja-JP') : String(Math.round(m * 10) / 10)}万`
  }
  return `${sign}${Math.round(a).toLocaleString('ja-JP')}`
}

/** 差分（金額）: +2.6万 / -1.2万 / ±0 */
export function fmtSignedYenShort(n: number): string {
  if (Math.round(n) === 0) return '±0'
  return `${n > 0 ? '+' : '-'}${fmtYenShort(Math.abs(n))}`
}

export function fmtSignedYen(n: number): string {
  if (Math.round(n) === 0) return '±¥0'
  return `${n > 0 ? '+' : '-'}${fmtYen(Math.abs(n))}`
}

export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

/** 0.5h刻みへ丸める */
export const roundHalf = (n: number): number => Math.round(n * 2) / 2
