import type {
  Customer,
  Experience,
  GrowthFocus,
  MatchWeights,
  Opportunity,
  OpportunitySkill,
  Project,
  Skill,
  User,
  UserSkill,
} from './types'
import type { WeekInfo, WorkloadCell } from './workload'

export const skillLevelOf = (userSkills: UserSkill[], userId: string, skillId: string): number =>
  userSkills.find((s) => s.userId === userId && s.skillId === skillId)?.level ?? 0

/* ------------------------------------------------------------------ */
/* スキルマップ                                                          */
/* ------------------------------------------------------------------ */

export interface SkillRow {
  skill: Skill
  /** userId -> level */
  levels: Map<string, number>
  /** レベル3以上（自走）の人数 */
  lv3Count: number
  /** 目標との差（不足人数。0なら充足） */
  shortage: number
}

export function buildSkillMatrix(users: User[], skills: Skill[], userSkills: UserSkill[]): SkillRow[] {
  return skills.map((skill) => {
    const levels = new Map(users.map((u) => [u.id, skillLevelOf(userSkills, u.id, skill.id)]))
    const lv3Count = [...levels.values()].filter((l) => l >= 3).length
    return { skill, levels, lv3Count, shortage: Math.max(0, skill.targetLv3Count - lv3Count) }
  })
}

/** 不足しているスキルについて、あと一歩（レベル2）の人 = 育成候補 */
export function growthCandidates(row: SkillRow, users: User[]): User[] {
  return users.filter((u) => (row.levels.get(u.id) ?? 0) === 2)
}

/* ------------------------------------------------------------------ */
/* 空き状況                                                              */
/* ------------------------------------------------------------------ */

export interface Availability {
  /** 今週の負荷率（確定のみ） */
  thisWeek: number
  /** 来週以降の平均の空き割合（見込み込み） */
  futureFree: number
  /** 週ごとの空き時間（見込み込み） */
  freeHours: number[]
}

export function availabilityOf(cells: WorkloadCell[]): Availability {
  const free = cells.map((c) => Math.max(0, c.capacity - c.planned - c.expected))
  const future = cells.slice(1)
  const ratios = future.map((c) => (c.capacity > 0 ? Math.max(0, 1 - c.forecastUtilization) : 0))
  return {
    thisWeek: cells[0]?.utilization ?? 0,
    futureFree: ratios.length > 0 ? ratios.reduce((s, r) => s + r, 0) / ratios.length : 0,
    freeHours: free,
  }
}

/* ------------------------------------------------------------------ */
/* 経験・得意                                                            */
/* ------------------------------------------------------------------ */

export interface ExperienceView {
  experience: Experience
  project: Project | undefined
  customer: Customer | undefined
}

export function experienceViews(
  userId: string,
  experiences: Experience[],
  projects: Project[],
  customers: Customer[],
): ExperienceView[] {
  return experiences
    .filter((e) => e.userId === userId)
    .map((e) => {
      const project = projects.find((p) => p.id === e.projectId)
      return { experience: e, project, customer: customers.find((c) => c.id === project?.customerId) }
    })
    .sort((a, b) => (a.experience.endDate < b.experience.endDate ? 1 : -1))
}

/** 経験した業界・顧客（重複なし） */
export function domainsOf(views: ExperienceView[]): { industries: string[]; customers: string[] } {
  const industries = new Set<string>()
  const customers = new Set<string>()
  for (const v of views) {
    if (v.experience.status !== 'confirmed' || !v.customer) continue
    industries.add(v.customer.industry)
    customers.add(v.customer.name)
  }
  return { industries: [...industries], customers: [...customers] }
}

/* ------------------------------------------------------------------ */
/* アサイン適合度（推薦。最終判断は人）                                   */
/* ------------------------------------------------------------------ */

export interface MatchContext {
  userSkills: UserSkill[]
  experiences: Experience[]
  growthFocus: GrowthFocus[]
  projects: Project[]
  customers: Customer[]
  weights: MatchWeights
}

export interface MatchTarget {
  role: string
  skills: OpportunitySkill[]
  customerId: string
  /** 配置の期間（週の開始日 ISO の一覧） */
  weekStarts: string[]
  /** 追加する週あたりの時間 */
  hoursPerWeek: number
}

export interface MatchResult {
  userId: string
  /** 0〜100 */
  total: number
  skill: number
  capacity: number
  experience: number
  growth: number
  continuity: number
  /** 配置前・後の負荷率（見込み込み）。表示週ごと */
  before: number[]
  after: number[]
  /** 配置後に100%を超える週がある */
  overload: boolean
  /** おすすめ理由・注意点 */
  notes: string[]
}

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))

function capacityFitOf(utils: number[]): number {
  if (utils.length === 0) return 50
  const f = (u: number) => (u <= 0.85 ? 100 : u >= 1.15 ? 0 : ((1.15 - u) / 0.3) * 100)
  return utils.reduce((s, u) => s + f(u), 0) / utils.length
}

export function matchUser(
  user: User,
  target: MatchTarget,
  cells: WorkloadCell[],
  weeks: WeekInfo[],
  ctx: MatchContext,
): MatchResult {
  const notes: string[] = []

  // スキル適合
  let skill = 70
  if (target.skills.length > 0) {
    const parts = target.skills.map((rs) => {
      const lv = skillLevelOf(ctx.userSkills, user.id, rs.skillId)
      return Math.min(1, lv / Math.max(1, rs.requiredLevel))
    })
    skill = (parts.reduce((s, p) => s + p, 0) / parts.length) * 100
    const lacking = target.skills.filter((rs) => skillLevelOf(ctx.userSkills, user.id, rs.skillId) < rs.requiredLevel)
    if (lacking.length === 0) notes.push('必要スキルを満たしています')
    else notes.push(`スキル不足: ${lacking.length}件（育成機会になります）`)
  }

  // 空き適合（配置した場合の負荷率）
  const wkSet = new Set(target.weekStarts)
  const before: number[] = []
  const after: number[] = []
  const inPeriod: number[] = []
  weeks.forEach((w, i) => {
    const c = cells[i]
    if (!c) return
    const b = c.forecastUtilization
    const add = wkSet.has(w.startISO) ? target.hoursPerWeek : 0
    const a = c.capacity > 0 ? Math.min(9.99, (c.planned + c.expected + add) / c.capacity) : add > 0 ? 9.99 : 0
    before.push(b)
    after.push(a)
    if (add > 0) inPeriod.push(a)
  })
  // 期間が表示範囲外（先の案件）の場合は、表示範囲の末尾の状況を参考にする
  const refUtils = inPeriod.length > 0 ? inPeriod : after.slice(-2).map((a) => a + (cells[0]?.capacity ? target.hoursPerWeek / cells[0].capacity : 0))
  const capacity = capacityFitOf(refUtils)
  const overload = after.some((a, i) => a > 1 && wkSet.has(weeks[i].startISO))
  if (overload) notes.push('配置すると100%を超える週があります')
  else if (capacity >= 80) notes.push('空きに余裕があります')

  // 経験適合
  const myExp = ctx.experiences.filter((e) => e.userId === user.id && e.status === 'confirmed')
  const sameRole = myExp.filter((e) => e.role === target.role).length
  const targetCustomer = ctx.customers.find((c) => c.id === target.customerId)
  const expProjects = myExp.map((e) => ctx.projects.find((p) => p.id === e.projectId))
  const sameCustomer = expProjects.filter((p) => p?.customerId === target.customerId).length
  const sameIndustry = expProjects.filter(
    (p) => !!targetCustomer && ctx.customers.find((c) => c.id === p?.customerId)?.industry === targetCustomer.industry,
  ).length
  const skillOverlap = myExp.filter((e) => e.skillIds.some((sid) => target.skills.some((rs) => rs.skillId === sid))).length
  let experience = 20
  if (sameRole > 0) experience += 40 + (sameRole > 1 ? 10 : 0)
  if (sameIndustry > 0) experience += 15
  if (skillOverlap > 0) experience += 15
  experience = clamp(experience, 0, 100)
  if (sameRole > 0) notes.push(`同じ役割（${target.role}）の経験が${sameRole}件あります`)

  // 成長適合（育成テーマとの一致）
  const gf = ctx.growthFocus.filter((g) => g.userId === user.id)
  const growthHit = gf.some((g) => (g.role && g.role === target.role) || (g.skillId && target.skills.some((rs) => rs.skillId === g.skillId)))
  const growth = growthHit ? 100 : 40
  if (growthHit) notes.push('本人・上司の育成テーマに合っています')

  // 継続性（同じ顧客・業界の経験）
  const continuity = sameCustomer > 0 ? 100 : sameIndustry > 0 ? 60 : 30
  if (sameCustomer > 0) notes.push('この顧客の経験があります（継続性）')

  const w = ctx.weights
  const wsum = w.skill + w.capacity + w.experience + w.growth + w.continuity || 1
  const total = (skill * w.skill + capacity * w.capacity + experience * w.experience + growth * w.growth + continuity * w.continuity) / wsum

  return {
    userId: user.id,
    total: Math.round(total),
    skill: Math.round(skill),
    capacity: Math.round(capacity),
    experience: Math.round(experience),
    growth: Math.round(growth),
    continuity: Math.round(continuity),
    before,
    after,
    overload,
    notes,
  }
}

/** 案件の各役割に対する、候補者の適合度（高い順） */
export function rankCandidates(
  users: User[],
  target: MatchTarget,
  cellsByUser: Map<string, WorkloadCell[]>,
  weeks: WeekInfo[],
  ctx: MatchContext,
): MatchResult[] {
  return users
    .filter((u) => u.status === 'active')
    .map((u) => matchUser(u, target, cellsByUser.get(u.id) ?? [], weeks, ctx))
    .sort((a, b) => b.total - a.total)
}

export interface Recommendation {
  kind: 'opportunity' | 'project'
  id: string
  title: string
  role: string
  total: number
}

/** この人に次に合う案件・役割（適合度の高い順） */
export function recommendNext(
  user: User,
  opportunities: Opportunity[],
  weeks: WeekInfo[],
  cells: WorkloadCell[],
  ctx: MatchContext,
  baseCapacity: number,
): Recommendation[] {
  const out: Recommendation[] = []
  for (const o of opportunities) {
    if (o.stage === 'converted' || o.stage === 'lost') continue
    for (const d of o.demands) {
      const periodWeeks = Math.max(1, (new Date(o.endDate).getTime() - new Date(o.startDate).getTime()) / (7 * 86400000))
      const hpw = d.hours / periodWeeks
      const skills = d.skillIds.length > 0 ? o.skills.filter((s) => d.skillIds.includes(s.skillId)) : o.skills
      const r = matchUser(
        user,
        { role: d.role, skills, customerId: o.customerId, weekStarts: weeks.filter((w) => w.endISO >= o.startDate && w.startISO <= o.endDate).map((w) => w.startISO), hoursPerWeek: Math.min(hpw, baseCapacity) },
        cells,
        weeks,
        ctx,
      )
      out.push({ kind: 'opportunity', id: o.id, title: o.title, role: d.role, total: r.total })
    }
  }
  return out.sort((a, b) => b.total - a.total)
}
