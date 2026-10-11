export type CsvCell = string | number | null | undefined

/** 表計算ソフトで式として実行されうる先頭文字（CSVインジェクション対策） */
const FORMULA_START = /^[=+\-@\t\r]/

function cell(v: CsvCell): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  // 文字列の先頭が式に見える場合は、先頭に ' を付けて文字として扱わせる（数値は対象外）
  const s = FORMULA_START.test(v) ? `'${v}` : v
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * CSV 文字列を作る。Excel（日本語環境）でそのまま開けるよう、既定で UTF-8 の BOM と CRLF 改行を付ける。
 * 値に , " 改行が含まれる場合は " で囲み、" は "" にする。
 */
export function toCsv(rows: CsvCell[][], opts: { bom?: boolean } = {}): string {
  const body = rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
  return (opts.bom === false ? '' : '﻿') + body
}
