import { describe, expect, it } from 'vitest'
import { createSeed } from '../data/seed'
import { MONDAY } from '../test/factories'
import { buildDerived } from '../store/derived'
import { availabilityOf, buildSkillMatrix, domainsOf, experienceViews, growthCandidates, matchUser, rankCandidates, recommendNext, skillLevelOf } from './talent'
import type { MatchContext, MatchTarget } from './talent'

const data = createSeed(MONDAY)
const d = buildDerived(data, MONDAY)
const ctx: MatchContext = {
  userSkills: data.userSkills, experiences: data.experiences, growthFocus: data.growthFocus,
  projects: data.projects, customers: data.customers, weights: data.settings.matchWeights,
}
const cellsOf = (uid: string) => d.workloadAll.cells[d.workloadAll.users.findIndex((u) => u.id === uid)]
const cellsByUser = new Map(d.workloadAll.users.map((u, i) => [u.id, d.workloadAll.cells[i]]))
const bmes = data.projects.find((p) => p.id === 'bmes')!
const targetFor = (over: Partial<MatchTarget> = {}): MatchTarget => ({
  role: 'MESコンサルタント',
  skills: [{ skillId: 'sk-mes', requiredLevel: 3 }],
  customerId: bmes.customerId,
  weekStarts: d.weeksAll.slice(4, 8).map((w) => w.startISO),
  hoursPerWeek: 12,
  ...over,
})

describe('スキルマップ', () => {
  const rows = buildSkillMatrix(d.activeUsers, data.skills, data.userSkills)

  it('レベル3以上の人数と、目標との差（不足人数）を数える', () => {
    for (const r of rows) {
      const lv3 = d.activeUsers.filter((u) => skillLevelOf(data.userSkills, u.id, r.skill.id) >= 3).length
      expect(r.lv3Count).toBe(lv3)
      expect(r.shortage).toBe(Math.max(0, r.skill.targetLv3Count - lv3))
    }
    expect(rows.some((r) => r.shortage > 0)).toBe(true) // seed には不足スキルがある
  })

  it('育成候補 = 不足スキルについてレベル2の人', () => {
    const short = rows.find((r) => r.shortage > 0)!
    for (const u of growthCandidates(short, d.activeUsers)) expect(short.levels.get(u.id)).toBe(2)
  })

  it('未登録のスキルレベルは 0', () => {
    expect(skillLevelOf([], 'x', 'y')).toBe(0)
  })
})

describe('空き状況・経験', () => {
  it('availabilityOf: 週ごとの空き時間は 稼働可能 − 確定 − 見込み（負にならない）', () => {
    const a = availabilityOf(cellsOf('u-k'))
    expect(a.freeHours).toHaveLength(12)
    expect(a.freeHours.every((h) => h >= 0)).toBe(true)
    expect(a.thisWeek).toBeGreaterThan(0.8)
  })

  it('確定した経験だけが業界・顧客の経験に数えられる', () => {
    const views = experienceViews('u-h', data.experiences, data.projects, data.customers)
    expect(views.some((v) => v.experience.status === 'candidate')).toBe(true)
    const dom = domainsOf(views)
    const confirmedIndustries = views.filter((v) => v.experience.status === 'confirmed').map((v) => v.customer?.industry)
    expect(dom.industries.sort()).toEqual([...new Set(confirmedIndustries)].sort())
  })
})

describe('配置の適合度（推薦。最終判断は人）', () => {
  it('重みは スキル40・空き30・経験15・育成10・継続性5', () => {
    expect(ctx.weights).toEqual({ skill: 0.4, capacity: 0.3, experience: 0.15, growth: 0.1, continuity: 0.05 })
  })

  it('総合点は各項目の重み付き平均', () => {
    const user = d.activeUsers[0]
    const r = matchUser(user, targetFor(), cellsOf(user.id), d.weeksAll, ctx)
    const w = ctx.weights
    const expected = r.skill * w.skill + r.capacity * w.capacity + r.experience * w.experience + r.growth * w.growth + r.continuity * w.continuity
    expect(Math.abs(r.total - expected)).toBeLessThanOrEqual(1)
  })

  it('必要スキルのレベルを満たす人は スキル適合 が高い', () => {
    const strong = d.activeUsers.find((u) => skillLevelOf(data.userSkills, u.id, 'sk-mes') >= 3)!
    const weak = d.activeUsers.find((u) => skillLevelOf(data.userSkills, u.id, 'sk-mes') <= 2)!
    const a = matchUser(strong, targetFor(), cellsOf(strong.id), d.weeksAll, ctx)
    const b = matchUser(weak, targetFor(), cellsOf(weak.id), d.weeksAll, ctx)
    expect(a.skill).toBe(100)
    expect(b.skill).toBeLessThan(100)
  })

  it('配置後に100%を超える週があれば overload（警告）になり、空き適合が下がる', () => {
    const busy = 'u-k'
    const heavy = matchUser(d.activeUsers.find((u) => u.id === busy)!, targetFor({ weekStarts: d.weeksAll.slice(0, 4).map((w) => w.startISO), hoursPerWeek: 30 }), cellsOf(busy), d.weeksAll, ctx)
    const light = matchUser(d.activeUsers.find((u) => u.id === busy)!, targetFor({ weekStarts: d.weeksAll.slice(0, 4).map((w) => w.startISO), hoursPerWeek: 1 }), cellsOf(busy), d.weeksAll, ctx)
    expect(heavy.overload).toBe(true)
    expect(heavy.notes.join()).toContain('100%')
    expect(heavy.capacity).toBeLessThan(light.capacity)
    // 配置前後の負荷率が返る（後 >= 前）
    heavy.after.forEach((a, i) => expect(a).toBeGreaterThanOrEqual(heavy.before[i]))
  })

  it('候補は適合度の高い順に並び、重みを変えると順位が変わりうる', () => {
    const ranked = rankCandidates(d.activeUsers, targetFor(), cellsByUser, d.weeksAll, ctx)
    expect(ranked.map((r) => r.total)).toEqual([...ranked.map((r) => r.total)].sort((a, b) => b - a))
    const skillOnly = rankCandidates(d.activeUsers, targetFor(), cellsByUser, d.weeksAll, { ...ctx, weights: { skill: 1, capacity: 0, experience: 0, growth: 0, continuity: 0 } })
    expect(skillOnly[0].skill).toBe(Math.max(...skillOnly.map((r) => r.skill)))
    const capOnly = rankCandidates(d.activeUsers, targetFor(), cellsByUser, d.weeksAll, { ...ctx, weights: { skill: 0, capacity: 1, experience: 0, growth: 0, continuity: 0 } })
    expect(capOnly[0].capacity).toBe(Math.max(...capOnly.map((r) => r.capacity)))
  })

  it('停止中のメンバーは候補に出ない', () => {
    const users = d.activeUsers.map((u, i) => (i === 0 ? { ...u, status: 'inactive' as const } : u))
    const ranked = rankCandidates(users, targetFor(), cellsByUser, d.weeksAll, ctx)
    expect(ranked.some((r) => r.userId === users[0].id)).toBe(false)
  })

  it('次におすすめの案件・役割は適合度の高い順で、PJ化済み・見送りは出ない', () => {
    const user = d.activeUsers.find((u) => u.id === 'u-h')!
    const recs = recommendNext(user, data.opportunities, d.weeksAll, cellsOf('u-h'), ctx, 40)
    expect(recs.length).toBeGreaterThan(0)
    expect(recs.map((r) => r.total)).toEqual([...recs.map((r) => r.total)].sort((a, b) => b - a))
    expect(recs.every((r) => data.opportunities.find((o) => o.id === r.id)!.stage !== 'converted')).toBe(true)
  })
})
