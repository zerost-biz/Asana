import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

describe('CSV', () => {
  it('UTF-8 の BOM と CRLF 改行を付ける（Excel で文字化けしない）', () => {
    const t = toCsv([['a', 'b'], [1, 2]])
    expect(t.startsWith('﻿')).toBe(true)
    expect(t).toBe('﻿a,b\r\n1,2\r\n')
    expect(toCsv([['x']], { bom: false })).toBe('x\r\n')
  })

  it('カンマ・引用符・改行を含む値は " で囲み、" は "" にする', () => {
    expect(toCsv([['a,b', 'c"d', 'e\nf']], { bom: false })).toBe('"a,b","c""d","e\nf"\r\n')
  })

  it('空・未設定は空欄、数値はそのまま、日本語もそのまま', () => {
    expect(toCsv([[null, undefined, 0, 12.5, 'B社 MES構想']], { bom: false })).toBe(',,0,12.5,B社 MES構想\r\n')
  })

  it('表計算で式として実行されうる文字列（= + - @ で始まる）は、先頭に \' を付けて文字にする', () => {
    expect(toCsv([['=SUM(A1)', '+1', '-1x', '@cmd', '通常']], { bom: false })).toBe("'=SUM(A1),'+1,'-1x,'@cmd,通常\r\n")
    // 数値の負数はそのまま
    expect(toCsv([[-5]], { bom: false })).toBe('-5\r\n')
  })
})
