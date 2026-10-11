import { describe, expect, it } from 'vitest'
import { inPeriod, makePeriod, periodContaining, periodDays, stepPeriod } from './closing'

describe('締め期間（15日締め・末締め）', () => {
  it('前半は 1日〜15日（15日締め）、後半は 16日〜末日（末締め）、月全体は 1日〜末日', () => {
    expect(makePeriod(2026, 10, 'first')).toMatchObject({ start: '2026-10-01', end: '2026-10-15', closingDate: '2026-10-15' })
    expect(makePeriod(2026, 10, 'second')).toMatchObject({ start: '2026-10-16', end: '2026-10-31', closingDate: '2026-10-31' })
    expect(makePeriod(2026, 10, 'month')).toMatchObject({ start: '2026-10-01', end: '2026-10-31' })
  })

  it('末日は月ごとに変わる（30日・2月の28/29日）', () => {
    expect(makePeriod(2026, 9, 'second').end).toBe('2026-09-30')
    expect(makePeriod(2026, 2, 'second').end).toBe('2026-02-28')
    expect(makePeriod(2028, 2, 'second').end).toBe('2028-02-29')
    expect(makePeriod(2028, 2, 'second').label).toContain('末締め')
  })

  it('その日が属する締め期間: 15日は前半、16日は後半、末日は後半', () => {
    expect(periodContaining(new Date(2026, 9, 1)).kind).toBe('first')
    expect(periodContaining(new Date(2026, 9, 15)).kind).toBe('first')
    expect(periodContaining(new Date(2026, 9, 16)).kind).toBe('second')
    expect(periodContaining(new Date(2026, 9, 31))).toMatchObject({ kind: 'second', end: '2026-10-31' })
  })

  it('前後へ動かす: 前半 ⇄ 後半 を半月ずつ、月をまたぐ・年をまたぐ', () => {
    const first = makePeriod(2026, 10, 'first')
    expect(stepPeriod(first, 1)).toMatchObject({ kind: 'second', month: 10 })
    expect(stepPeriod(first, -1)).toMatchObject({ kind: 'second', month: 9, end: '2026-09-30' })
    expect(stepPeriod(makePeriod(2026, 12, 'second'), 1)).toMatchObject({ kind: 'first', year: 2027, month: 1 })
    expect(stepPeriod(makePeriod(2027, 1, 'first'), -1)).toMatchObject({ kind: 'second', year: 2026, month: 12 })
    expect(stepPeriod(stepPeriod(first, 3), -3)).toMatchObject({ kind: 'first', month: 10, year: 2026 })
  })

  it('月全体は1か月ずつ動く', () => {
    expect(stepPeriod(makePeriod(2026, 12, 'month'), 1)).toMatchObject({ year: 2027, month: 1, kind: 'month' })
    expect(stepPeriod(makePeriod(2026, 1, 'month'), -1)).toMatchObject({ year: 2025, month: 12 })
  })

  it('期間に入るか（両端を含む）と日数', () => {
    const p = makePeriod(2026, 10, 'first')
    expect(inPeriod('2026-10-01', p)).toBe(true)
    expect(inPeriod('2026-10-15', p)).toBe(true)
    expect(inPeriod('2026-10-16', p)).toBe(false)
    expect(inPeriod('2026-09-30', p)).toBe(false)
    expect(periodDays(p)).toBe(15)
    expect(periodDays(makePeriod(2026, 10, 'second'))).toBe(16)
  })
})
