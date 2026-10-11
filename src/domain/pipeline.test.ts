import { describe, expect, it } from 'vitest'
import type { Assignment, Opportunity } from './types'
import { evaluateOpp, fmtManMonths, isOpenOpp, oppHours, roleGapsForOpp, suggestFeasibility, weightedHours } from './pipeline'

const opp = (o: Partial<Opportunity> = {}): Opportunity =>
  ({
    id: 'o', customerId: 'c', title: 't', ownerId: 'u', stage: 'candidate', probability: 50, startDate: '2026-11-02', endDate: '2027-01-25',
    nextAction: '', demands: [{ role: 'PJリード', hours: 160, skillIds: [] }, { role: 'ITエンジニア', hours: 160, skillIds: [] }],
    skills: [], scores: {}, evalComment: '', createdAt: '2026-10-01', ...o,
  }) as Opportunity

describe('受注見込み（人月・確度）', () => {
  it('1人月 = 160時間。確度を掛けた量（Expected）を出す', () => {
    expect(oppHours(opp())).toBe(320)
    expect(fmtManMonths(320)).toBe('2.0人月')
    expect(weightedHours(opp({ probability: 50 }))).toBe(160)
  })

  it('PJ化済み・見送りは検討中ではない', () => {
    expect(isOpenOpp(opp({ stage: 'evaluation' }))).toBe(true)
    expect(isOpenOpp(opp({ stage: 'converted' }))).toBe(false)
    expect(isOpenOpp(opp({ stage: 'lost' }))).toBe(false)
  })
})

describe('役割ごとの人員不足', () => {
  it('必要 − 配置済み（仮 + 確定）', () => {
    const a: Assignment[] = [
      { id: '1', targetType: 'opportunity', targetId: 'o', userId: 'u', role: 'PJリード', weekStart: '2026-11-02', plannedHours: 100, status: 'tentative', batchId: 'b' },
      { id: '2', targetType: 'opportunity', targetId: 'o', userId: 'u', role: 'PJリード', weekStart: '2026-11-09', plannedHours: 60, status: 'confirmed', batchId: 'b' },
    ]
    const gaps = roleGapsForOpp(opp(), a, 40)
    expect(gaps.find((g) => g.role === 'PJリード')).toMatchObject({ demand: 160, assigned: 160, gap: 0 })
    expect(gaps.find((g) => g.role === 'ITエンジニア')).toMatchObject({ assigned: 0, gap: 160 })
  })
})

describe('PJ化評価（推奨の判断材料。自動で可否は決めない）', () => {
  const all = (v: number) => ({ customerValue: v, ltv: v, strategic: v, ripple: v, winning: v, capability: v, feasibility: v, risk: v })

  it('半数未満しか入力がなければ「入力が足りません」', () => {
    const r = evaluateOpp({ customerValue: 5, ltv: 5 })
    expect(r.recommendation).toBe('incomplete')
    expect(r.score).toBeNull()
  })

  it('平均 × 20 点。70点以上かつ人員確保が3以上 = 推奨 / 50点以上 = 要検討 / それ未満 = 見送り寄り', () => {
    expect(evaluateOpp(all(4))).toMatchObject({ score: 80, recommendation: 'go' })
    expect(evaluateOpp(all(3))).toMatchObject({ score: 60, recommendation: 'consider' })
    expect(evaluateOpp(all(2))).toMatchObject({ score: 40, recommendation: 'hold' })
  })

  it('点が高くても人員確保の実現性が低ければ「推奨」にしない', () => {
    expect(evaluateOpp({ ...all(5), feasibility: 2 }).recommendation).toBe('consider')
  })

  it('人員確保の実現性の目安: 必要時間に対する空きの比率', () => {
    expect(suggestFeasibility(100, 200)).toBe(5)
    expect(suggestFeasibility(100, 110)).toBe(4)
    expect(suggestFeasibility(100, 90)).toBe(3)
    expect(suggestFeasibility(100, 60)).toBe(2)
    expect(suggestFeasibility(100, 10)).toBe(1)
    expect(suggestFeasibility(0, 10)).toBe(3)
  })
})
