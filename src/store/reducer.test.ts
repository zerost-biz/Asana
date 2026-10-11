import { describe, expect, it } from 'vitest'
import { buildTemplateItems, templateTaskCount, templateTotalHours } from '../data/templates'
import { createSeed } from '../data/seed'
import { MONDAY, MONDAY_ISO } from '../test/factories'
import type { Assignment, InternalOrder, Project } from '../domain/types'
import { buildDerived } from './derived'
import { reducer, type Body } from './reducer'

const seed = createSeed(MONDAY)
const meta = { actorId: 'u-k', now: '2026-10-12T09:00:00.000Z', today: MONDAY_ISO }
const run = (state: typeof seed, body: Body) => reducer(state, { ...body, meta } as never)
const derive = (s: typeof seed) => buildDerived(s, MONDAY)
let n = 0
const gen = (p: string) => `${p}-t${++n}`

describe('工数入力 → ACT・ETC・EAC・Variance・Workload が連動して再計算される', () => {
  const asis = seed.wbs.find((w) => w.title === 'As-Is整理')!

  it('作業時間を記録すると ACT が増え、ETC/進捗が更新され、履歴が残る', () => {
    const before = derive(seed).metrics.get(asis.id)!
    const next = run(seed, { type: 'LOG_WORK', payload: { wbsId: asis.id, userId: 'u-h', date: MONDAY_ISO, hours: 3, comment: 'ヒアリング整理', etcHours: 10, progress: 80 } })
    const after = derive(next).metrics.get(asis.id)!
    expect(after.act).toBe(before.act + 3)
    expect(after.etc).toBe(10)
    expect(after.eac).toBe(after.act + 10)
    expect(after.variance).toBe(after.eac - after.plan)
    expect(next.timeEntries.at(-1)).toMatchObject({ wbsId: asis.id, projectId: asis.projectId, hours: 3, userId: 'u-h' })
    expect(next.wbs.find((w) => w.id === asis.id)).toMatchObject({ etcHours: 10, progress: 80, etcUpdatedAt: MONDAY_ISO })
    expect(next.activity.at(-1)?.summary).toContain('3h')
  })

  it('進捗100%で完了になり ETC=0。プロジェクト合計と Workload からも外れる', () => {
    const next = run(seed, { type: 'LOG_WORK', payload: { wbsId: asis.id, userId: 'u-h', date: MONDAY_ISO, hours: 1, comment: '', etcHours: 8, progress: 100 } })
    const w = next.wbs.find((x) => x.id === asis.id)!
    expect([w.status, w.etcHours]).toEqual(['done', 0])
    expect(derive(next).allocations.some((a) => a.wbsId === asis.id)).toBe(false)
  })

  it('残り（ETC）を増やすと、見込み・差異・担当者の負荷が上がる', () => {
    const d0 = derive(seed)
    const next = run(seed, { type: 'WBS_UPDATE', id: asis.id, patch: { etcHours: asis.etcHours + 20 } })
    const d1 = derive(next)
    expect(d1.metrics.get(asis.id)!.eac).toBe(d0.metrics.get(asis.id)!.eac + 20)
    expect(d1.summaryById.get(asis.projectId)!.totals.variance).toBeCloseTo(d0.summaryById.get(asis.projectId)!.totals.variance + 20)
    const ui = d0.workload.users.findIndex((u) => u.id === asis.ownerId)
    const sum = (d: typeof d0) => d.workload.cells[ui].reduce((s, c) => s + c.planned, 0)
    expect(sum(d1)).toBeGreaterThan(sum(d0))
  })

  it('作業時間の記録を取り消すと ACT が元に戻る', () => {
    const logged = run(seed, { type: 'LOG_WORK', payload: { wbsId: asis.id, userId: 'u-h', date: MONDAY_ISO, hours: 2, comment: '', etcHours: asis.etcHours, progress: asis.progress } })
    const id = logged.timeEntries.at(-1)!.id
    const back = run(logged, { type: 'ENTRY_DELETE', id })
    expect(derive(back).metrics.get(asis.id)!.act).toBe(derive(seed).metrics.get(asis.id)!.act)
  })
})

describe('WBS の編集', () => {
  it('停止中にすると statusChangedAt が今日になり、更新履歴に日本語で残る', () => {
    const w = seed.wbs.find((x) => x.status === 'in_progress')!
    const next = run(seed, { type: 'WBS_UPDATE', id: w.id, patch: { status: 'blocked' } })
    expect(next.wbs.find((x) => x.id === w.id)).toMatchObject({ status: 'blocked', statusChangedAt: MONDAY_ISO })
    expect(next.activity.at(-1)?.summary).toContain('停止中')
  })

  it('削除すると配下・実績・先行の参照・リスクの紐づけ・週別の手修正も整理される', () => {
    const parent = seed.wbs.find((w) => seed.wbs.some((c) => c.parentId === w.id))!
    const kids = seed.wbs.filter((c) => c.parentId === parent.id).map((c) => c.id)
    const withOv = { ...seed, allocationOverrides: [{ wbsId: kids[0], weekStart: MONDAY_ISO, hours: 4 }] }
    const next = run(withOv, { type: 'WBS_DELETE', id: parent.id })
    expect(next.wbs.some((w) => w.id === parent.id || kids.includes(w.id))).toBe(false)
    expect(next.timeEntries.some((e) => kids.includes(e.wbsId))).toBe(false)
    expect(next.allocationOverrides).toHaveLength(0)
    expect(next.wbs.every((w) => !w.predecessorId || next.wbs.some((x) => x.id === w.predecessorId))).toBe(true)
  })

  it('複製すると進捗0・未着手になり、配下ごと元のすぐ後ろに入る', () => {
    const task = seed.wbs.find((w) => w.status === 'in_progress' && !seed.wbs.some((c) => c.parentId === w.id))!
    const id = 'dup-1'
    const next = run(seed, { type: 'WBS_DUPLICATE', id: task.id, idMap: { [task.id]: id } })
    const copy = next.wbs.find((w) => w.id === id)!
    expect(copy).toMatchObject({ progress: 0, status: 'not_started', etcHours: task.planHours })
    expect(copy.title).toContain('コピー')
    expect(next.wbs.findIndex((w) => w.id === id)).toBe(next.wbs.findIndex((w) => w.id === task.id) + 1)
  })

  it('並べ替え（上へ/下へ）で兄弟の順序が入れ替わり、端では何も起きない', () => {
    const tops = seed.wbs.filter((w) => w.projectId === 'bmes' && w.parentId === null)
    const next = run(seed, { type: 'WBS_MOVE', id: tops[1].id, dir: 'up' })
    const order = next.wbs.filter((w) => w.projectId === 'bmes' && w.parentId === null).map((w) => w.id)
    expect(order[0]).toBe(tops[1].id)
    expect(run(next, { type: 'WBS_MOVE', id: tops[1].id, dir: 'up' }).wbs).toEqual(next.wbs)
  })

  it('週別の手修正を設定/解除すると、稼働状況が変わる/戻る', () => {
    const task = derive(seed).allocations[0]
    const week = derive(seed).weeksAll[task.weekIndex].startISO
    const set = run(seed, { type: 'ALLOC_SET', wbsId: task.wbsId, weekStart: week, hours: task.hours + 6 })
    expect(derive(set).allocations.find((a) => a.wbsId === task.wbsId && a.weekIndex === task.weekIndex)!.hours).toBe(task.hours + 6)
    const cleared = run(set, { type: 'ALLOC_SET', wbsId: task.wbsId, weekStart: week, hours: null })
    expect(cleared.allocationOverrides).toHaveLength(0)
  })
})

describe('プロジェクトの追加・削除・テンプレート', () => {
  it('標準テンプレートは 3フェーズ・作業パッケージ・タスク・マイルストーン を期間内に順番に配置する', () => {
    const items = buildTemplateItems('pnew', '2026-10-12', '2026-12-04', ['u-h'], gen, MONDAY_ISO)
    const tasks = items.filter((i) => i.type === 'task')
    expect(items.filter((i) => i.type === 'phase')).toHaveLength(3)
    expect(items.filter((i) => i.type === 'milestone')).toHaveLength(3)
    expect(tasks).toHaveLength(templateTaskCount())
    expect(tasks.reduce((s, t) => s + t.planHours, 0)).toBe(templateTotalHours())
    for (const t of tasks) {
      expect(t.startDate >= '2026-10-12' && t.endDate <= '2026-12-04' && t.startDate <= t.endDate).toBe(true)
      expect(t.etcHours).toBe(t.planHours)
      expect(t.baselinePlanHours).toBe(t.planHours)
    }
    expect(tasks[1].predecessorId).toBe(tasks[0].id)
  })

  it('PROJECT_ADD で WBS ごと入り、PROJECT_DELETE で作業・実績・リスク・案件の紐づけまで消える', () => {
    const items = buildTemplateItems('pnew', '2026-10-12', '2026-12-04', ['u-h'], gen, MONDAY_ISO)
    const project: Project = { id: 'pnew', customerId: 'c-b', name: 'テストPJ', ownerId: 'u-h', status: 'active', startDate: '2026-10-12', endDate: '2026-12-04', priority: 'medium', health: null, budget: 1_000_000, description: '', roleNeeds: [] }
    const added = run(seed, { type: 'PROJECT_ADD', project, items })
    expect(derive(added).summaryById.get('pnew')!.totals.plan).toBe(templateTotalHours())
    const leaf = items.find((i) => i.type === 'task')!
    const dirty = { ...added, timeEntries: [...added.timeEntries, { id: 'tx', userId: 'u-h', projectId: 'pnew', wbsId: leaf.id, date: MONDAY_ISO, hours: 2, comment: '' }], risks: [...added.risks, { id: 'rx', projectId: 'pnew', kind: 'risk' as const, severity: 'high' as const, probability: 'high' as const, title: 'x', status: 'open' as const, createdAt: MONDAY_ISO }] }
    const removed = run(dirty, { type: 'PROJECT_DELETE', id: 'pnew' })
    expect(removed.projects).toHaveLength(seed.projects.length)
    expect(removed.wbs).toHaveLength(seed.wbs.length)
    expect(removed.timeEntries.some((e) => e.id === 'tx')).toBe(false)
    expect(removed.risks.some((r) => r.id === 'rx')).toBe(false)
  })

  it('空のプロジェクトでも集計・稼働・要判断の導出が壊れない', () => {
    const project: Project = { id: 'pblank', customerId: 'c-b', name: '空PJ', ownerId: 'u-h', status: 'planned', startDate: '2026-10-12', endDate: '2026-11-12', priority: 'low', health: null, description: '', roleNeeds: [] }
    const s = derive(run(seed, { type: 'PROJECT_ADD', project, items: [] })).summaryById.get('pblank')!
    expect(s.totals.plan).toBe(0)
    expect(s.cost.marginRate).toBeNull()
    expect(s.health.health).toBe('GOOD')
    expect(s.nextMilestone).toBeNull()
  })
})

describe('受注見込み → PJ化 → 配置', () => {
  const opp = seed.opportunities.find((o) => o.stage === 'approval_wait')!

  it('段階を動かすと履歴に残る / 同じ段階への移動は何も起きない', () => {
    const next = run(seed, { type: 'OPP_MOVE', id: opp.id, stage: 'evaluation' })
    expect(next.opportunities.find((o) => o.id === opp.id)!.stage).toBe('evaluation')
    expect(next.activity.at(-1)?.summary).toContain('評価中')
    expect(run(seed, { type: 'OPP_MOVE', id: opp.id, stage: opp.stage })).toBe(seed)
  })

  it('見込みの案件は稼働状況の Expected（確度加重）に入り、見送ると外れる', () => {
    const before = derive(seed)
    const expectedSum = (d: typeof before) => d.workloadAll.cells.flat().reduce((s, c) => s + c.expected, 0)
    expect(expectedSum(before)).toBeGreaterThan(0)
    const lost = run(seed, { type: 'OPP_MOVE', id: opp.id, stage: 'lost', lostReason: '体制を確保できない' })
    expect(lost.opportunities.find((o) => o.id === opp.id)).toMatchObject({ stage: 'lost', lostReason: '体制を確保できない' })
    expect(expectedSum(derive(lost))).toBeLessThan(expectedSum(before))
  })

  it('PJ化すると案件は「PJ化済み」になり、プロジェクト・WBS が作られ、仮配置が引き継がれる', () => {
    const project: Project = { id: 'pconv', customerId: opp.customerId, name: opp.title, ownerId: opp.ownerId, status: 'planned', startDate: opp.startDate, endDate: opp.endDate, priority: 'medium', health: null, description: '', roleNeeds: [], opportunityId: opp.id }
    const items = buildTemplateItems('pconv', opp.startDate, opp.endDate, ['u-h'], gen, MONDAY_ISO)
    const tentative = seed.assignments.filter((a) => a.targetType === 'opportunity' && a.targetId === opp.id)
    expect(tentative.length).toBeGreaterThan(0)
    const next = run(seed, { type: 'OPP_CONVERT', oppId: opp.id, project, items })
    expect(next.opportunities.find((o) => o.id === opp.id)).toMatchObject({ stage: 'converted', convertedProjectId: 'pconv', probability: 100 })
    expect(next.projects.some((p) => p.id === 'pconv')).toBe(true)
    expect(next.assignments.filter((a) => a.targetType === 'project' && a.targetId === 'pconv')).toHaveLength(tentative.length)
    expect(next.assignments.some((a) => a.targetType === 'opportunity' && a.targetId === opp.id)).toBe(false)
  })

  it('仮配置を追加 → 確定 → 取り消し。仮配置は Expected、WBS のないPJの確定は Committed に入る', () => {
    const rows: Assignment[] = [0, 1].map((i) => ({ id: `n-${i}`, targetType: 'opportunity', targetId: opp.id, userId: 'u-s', role: opp.demands[0].role, weekStart: derive(seed).weeksAll[i].startISO, plannedHours: 10, status: 'tentative', batchId: 'nb' }))
    const added = run(seed, { type: 'ASSIGN_ADD', rows })
    const exp = (s: typeof seed) => derive(s).workloadAll.cells[derive(s).workloadAll.users.findIndex((u) => u.id === 'u-s')][0].expected
    expect(exp(added)).toBeGreaterThan(exp(seed))
    expect(added.activity.at(-1)?.summary).toContain('仮アサイン')
    const confirmed = run(added, { type: 'ASSIGN_STATUS', batchId: 'nb', status: 'confirmed' })
    expect(confirmed.assignments.filter((a) => a.batchId === 'nb').every((a) => a.status === 'confirmed')).toBe(true)
    const removed = run(confirmed, { type: 'ASSIGN_REMOVE', batchId: 'nb' })
    expect(removed.assignments.some((a) => a.batchId === 'nb')).toBe(false)
  })
})

describe('プロジェクト完了 → 経験 → スキル', () => {
  it('完了すると経験の候補ができ、確定してレベルを上げるとスキルが更新・履歴に残る', () => {
    const project = seed.projects.find((p) => p.id === 'gtm')!
    const close = { projectId: project.id, outcome: 'PoC 完了', valueText: '次期受注', lessons: '早めの合意形成', reusableAssets: 'テンプレ', status: 'draft' as const, members: [{ userId: 'u-u', role: 'ITエンジニア', summary: '構成設計', skillIds: ['sk-it'], nextRecommendation: '' }] }
    const saved = run(seed, { type: 'CLOSE_SAVE', close })
    const done = run(saved, { type: 'CLOSE_FINALIZE', projectId: project.id, idPrefix: 'exp-new' })
    expect(done.projects.find((p) => p.id === project.id)!.status).toBe('completed')
    const cand = done.experiences.find((e) => e.projectId === project.id && e.userId === 'u-u' && e.status === 'candidate')!
    expect(cand).toBeTruthy()
    expect(done.closes.find((c) => c.projectId === project.id)!.status).toBe('closed')

    const before = done.userSkills.find((s) => s.userId === 'u-u' && s.skillId === 'sk-it')?.level ?? 0
    const confirmed = run(done, { type: 'EXPERIENCE_CONFIRM', id: cand.id, levelUp: ['sk-it'] })
    expect(confirmed.experiences.find((e) => e.id === cand.id)!.status).toBe('confirmed')
    expect(confirmed.userSkills.find((s) => s.userId === 'u-u' && s.skillId === 'sk-it')!.level).toBe(Math.min(5, before + 1))
  })

  it('スキルを直接変更するとレベルの変化が履歴に残り、0にすると削除される', () => {
    const next = run(seed, { type: 'USER_SKILL_SET', userSkill: { userId: 'u-h', skillId: 'sk-mes', level: 3, evidence: 'B社で経験', updatedAt: MONDAY_ISO, confirmedBy: 'u-k' } })
    expect(next.userSkills.find((s) => s.userId === 'u-h' && s.skillId === 'sk-mes')!.level).toBe(3)
    expect(next.activity.at(-1)?.summary).toContain('→ 3')
    const none = run(next, { type: 'USER_SKILL_SET', userSkill: { userId: 'u-h', skillId: 'sk-mes', level: 0, evidence: '', updatedAt: MONDAY_ISO } })
    expect(none.userSkills.some((s) => s.userId === 'u-h' && s.skillId === 'sk-mes')).toBe(false)
  })

  it('スキルを削除すると、メンバーのレベルと案件の必要スキルからも外れる', () => {
    const next = run(seed, { type: 'SKILL_DELETE', id: 'sk-mes' })
    expect(next.userSkills.some((s) => s.skillId === 'sk-mes')).toBe(false)
    expect(next.opportunities.every((o) => !o.skills.some((s) => s.skillId === 'sk-mes') && o.demands.every((d) => !d.skillIds.includes('sk-mes')))).toBe(true)
  })
})

describe('設定・履歴・初期化', () => {
  it('設定を変えると状態の判定へ反映される（危険のしきい値を緩めると B社は注意のまま）', () => {
    const strict = run(seed, { type: 'SETTINGS_UPDATE', patch: { riskVarianceRatio: 0.05, watchVarianceRatio: 0.01 } })
    expect(derive(strict).summaryById.get('bmes')!.health.health).toBe('RISK')
  })

  it('更新履歴は500件で頭打ち', () => {
    let s = seed
    for (let i = 0; i < 520; i++) s = run(s, { type: 'SETTINGS_UPDATE', patch: { mission: `m${i}` } })
    expect(s.activity.length).toBeLessThanOrEqual(500)
  })

  it('RESET / LOAD は与えられたデータに置き換わる', () => {
    expect(reducer(seed, { type: 'RESET', data: createSeed(MONDAY) }).currentUserId).toBe(seed.currentUserId)
    expect(reducer(seed, { type: 'LOAD', data: { ...seed, currentUserId: 'u-s' } }).currentUserId).toBe('u-s')
  })
})

describe('社内オーダー', () => {
  const bmesOrders = seed.internalOrders.filter((o) => o.projectId === 'bmes')
  const order = (over: Partial<InternalOrder> = {}): InternalOrder => ({ id: 'io-new', projectId: 'bmes', code: 'IO-9999-001', name: 'テスト', status: 'active', ...over })

  it('登録・名称変更・終了・再開が更新履歴に残る', () => {
    let s = run(seed, { type: 'ORDER_ADD', order: order() })
    expect(s.internalOrders.some((o) => o.id === 'io-new')).toBe(true)
    expect(s.activity.at(-1)?.summary).toContain('IO-9999-001')
    s = run(s, { type: 'ORDER_UPDATE', id: 'io-new', patch: { status: 'closed' } })
    expect(s.internalOrders.find((o) => o.id === 'io-new')!.status).toBe('closed')
    expect(s.activity.at(-1)?.summary).toContain('終了')
    s = run(s, { type: 'ORDER_UPDATE', id: 'io-new', patch: { status: 'active', name: '改名' } })
    expect(s.activity.at(-1)?.summary).toContain('再開')
  })

  it('作業時間を入力すると、作業に設定されたオーダーに計上される（選んだオーダーが優先）', () => {
    const task = seed.wbs.find((w) => w.id === 'bmes-2-1')!
    expect(task.orderId).toBe(bmesOrders[1].id)
    const payload = { wbsId: task.id, userId: 'u-h', date: MONDAY_ISO, hours: 2, comment: '', etcHours: task.etcHours, progress: task.progress }
    const a = run(seed, { type: 'LOG_WORK', payload })
    expect(a.timeEntries.at(-1)!.orderId).toBe(bmesOrders[1].id)
    expect(a.activity.at(-1)?.summary).toContain(bmesOrders[1].code)
    const b = run(seed, { type: 'LOG_WORK', payload: { ...payload, orderId: bmesOrders[0].id } })
    expect(b.timeEntries.at(-1)!.orderId).toBe(bmesOrders[0].id)
  })

  it('他のプロジェクトのオーダーは選べない（無効なら、作業のオーダーを使う）', () => {
    const task = seed.wbs.find((w) => w.id === 'bmes-2-1')!
    const other = seed.internalOrders.find((o) => o.projectId === 'asaas')!
    const next = run(seed, { type: 'LOG_WORK', payload: { wbsId: task.id, userId: 'u-h', date: MONDAY_ISO, hours: 1, comment: '', etcHours: 5, progress: 10, orderId: other.id } })
    expect(next.timeEntries.at(-1)!.orderId).toBe(task.orderId)
  })

  it('オーダーが1つだけのプロジェクトでは、作業に未設定でもそのオーダーに計上される', () => {
    const task = seed.wbs.find((w) => w.id === 'asaas-2-1')!
    const cleared = { ...seed, wbs: seed.wbs.map((w) => (w.id === task.id ? { ...w, orderId: undefined } : w)) }
    const next = run(cleared, { type: 'LOG_WORK', payload: { wbsId: task.id, userId: 'u-s', date: MONDAY_ISO, hours: 1, comment: '', etcHours: 5, progress: 10 } })
    expect(next.timeEntries.at(-1)!.orderId).toBe('io-asaas-1')
  })

  it('テンプレートから作業を追加すると、使用中のオーダーが1つなら自動でそのオーダーに計上する', () => {
    const items = buildTemplateItems('asaas', '2026-10-12', '2026-12-04', ['u-s'], gen, MONDAY_ISO)
    const next = run(seed, { type: 'WBS_ADD_MANY', items })
    const added = next.wbs.filter((w) => items.some((i) => i.id === w.id))
    expect(added.filter((w) => w.type === 'task').every((w) => w.orderId === 'io-asaas-1')).toBe(true)
    expect(added.filter((w) => w.type === 'milestone').every((w) => !w.orderId)).toBe(true)
  })

  it('作業のオーダーを変えると、更新履歴にオーダー番号で残る', () => {
    const task = seed.wbs.find((w) => w.id === 'bmes-2-1')!
    const next = run(seed, { type: 'WBS_UPDATE', id: task.id, patch: { orderId: bmesOrders[0].id } })
    expect(next.activity.at(-1)?.summary).toContain(`${bmesOrders[1].code}→${bmesOrders[0].code}`)
  })

  it('削除すると、使っていた作業・作業時間は「オーダー未設定」に戻る', () => {
    const target = bmesOrders[0]
    const used = seed.timeEntries.filter((e) => e.orderId === target.id).length
    expect(used).toBeGreaterThan(0)
    const next = run(seed, { type: 'ORDER_DELETE', id: target.id })
    expect(next.internalOrders.some((o) => o.id === target.id)).toBe(false)
    expect(next.timeEntries.filter((e) => e.orderId === target.id)).toHaveLength(0)
    expect(next.timeEntries).toHaveLength(seed.timeEntries.length) // 作業時間そのものは消えない
    expect(next.wbs.some((w) => w.orderId === target.id)).toBe(false)
  })

  it('オーダー未設定の作業時間・作業を、まとめて指定のオーダーに割り当てられる', () => {
    const cleared = { ...seed, timeEntries: seed.timeEntries.map((e) => (e.projectId === 'bmes' ? { ...e, orderId: undefined } : e)), wbs: seed.wbs.map((w) => (w.projectId === 'bmes' ? { ...w, orderId: undefined } : w)) }
    const next = run(cleared, { type: 'ORDER_ASSIGN_UNSET', projectId: 'bmes', orderId: bmesOrders[0].id })
    expect(next.timeEntries.filter((e) => e.projectId === 'bmes').every((e) => e.orderId === bmesOrders[0].id)).toBe(true)
    expect(next.timeEntries.filter((e) => e.projectId !== 'bmes').every((e) => e.orderId === cleared.timeEntries.find((x) => x.id === e.id)!.orderId)).toBe(true)
    expect(next.wbs.filter((w) => w.projectId === 'bmes' && w.type === 'task').every((w) => w.orderId === bmesOrders[0].id)).toBe(true)
    // 親（フェーズ）やマイルストーンには付けない
    expect(next.wbs.filter((w) => w.projectId === 'bmes' && (w.type === 'phase' || w.type === 'milestone')).every((w) => !w.orderId)).toBe(true)
    // 他プロジェクトのオーダーは使えない
    expect(run(cleared, { type: 'ORDER_ASSIGN_UNSET', projectId: 'bmes', orderId: 'io-asaas-1' })).toBe(cleared)
  })

  it('プロジェクトを追加するときにオーダー番号も登録でき、削除するとオーダーも消える', () => {
    const items = buildTemplateItems('pord', '2026-10-12', '2026-12-04', ['u-h'], gen, MONDAY_ISO)
    const o: InternalOrder = { id: 'io-pord', projectId: 'pord', code: 'IO-7777-001', name: 'F社', status: 'active' }
    const project: Project = { id: 'pord', customerId: 'c-b', name: 'F社', ownerId: 'u-h', status: 'active', startDate: '2026-10-12', endDate: '2026-12-04', priority: 'medium', health: null, description: '', roleNeeds: [] }
    const added = run(seed, { type: 'PROJECT_ADD', project, items: items.map((i) => (i.type === 'task' ? { ...i, orderId: o.id } : i)), orders: [o] })
    expect(added.internalOrders.some((x) => x.id === 'io-pord')).toBe(true)
    expect(added.activity.at(-1)?.summary).toContain('IO-7777-001')
    const removed = run(added, { type: 'PROJECT_DELETE', id: 'pord' })
    expect(removed.internalOrders.some((x) => x.id === 'io-pord')).toBe(false)
  })
})
