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

export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

/** 0.5h刻みへ丸める */
export const roundHalf = (n: number): number => Math.round(n * 2) / 2
