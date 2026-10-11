import { describe, expect, it } from 'vitest'
import { createSeed } from '../data/seed'
import { MONDAY, MONDAY_ISO } from '../test/factories'
import { buildDerived } from '../store/derived'
import { reducer, type Body } from '../store/reducer'

const seed = createSeed(MONDAY)
const meta = { actorId: 'u-k', now: '2026-10-12T09:00:00.000Z', today: MONDAY_ISO }
const run = (s: typeof seed, b: Body) => reducer(s, { ...b, meta } as never)
const ids = (s: typeof seed) => buildDerived(s, MONDAY).alerts.map((a) => a.id)

describe('通知・要判断（画面内通知）', () => {
  const d = buildDerived(seed, MONDAY)

  it('seed には 過負荷・時間超過・遅延・停止中・リスク・PJ化判断・人員未配置 が含まれる', () => {
    const kinds = new Set(d.alerts.map((a) => a.kind))
    for (const k of ['overload', 'eac', 'overdue', 'blocked', 'risk', 'pj_decision', 'assignment_gap'] as const) expect(kinds.has(k), k).toBe(true)
  })

  it('赤（critical）は 100%超の過負荷・重大リスク・危険な時間超過・期限超過のPJ化判断 に限られ、先頭に並ぶ', () => {
    const tones = d.alerts.map((a) => a.tone)
    expect(tones.indexOf('critical')).toBe(0)
    for (const a of d.alerts.filter((x) => x.tone === 'critical')) expect(['overload', 'risk', 'eac', 'margin', 'pj_decision']).toContain(a.kind)
  })

  it('要判断は alerts の部分集合で、期限・納期などの情報通知は含まない', () => {
    expect(d.decisions.every((x) => d.alerts.includes(x))).toBe(true)
    expect(d.decisions.some((x) => x.kind === 'deadline' || x.kind === 'etc_stale')).toBe(false)
  })

  it('すべての通知に遷移先（to）がある', () => {
    for (const a of d.alerts) expect(a.to.startsWith('/')).toBe(true)
  })

  it('入力で通知が増減する: 停止中を再開すると「停止中」通知が消える', () => {
    const blocked = seed.wbs.filter((w) => w.status === 'blocked')
    expect(blocked.length).toBeGreaterThan(0)
    let s = seed
    for (const w of blocked) s = run(s, { type: 'WBS_UPDATE', id: w.id, patch: { status: 'in_progress' } })
    expect(ids(s).some((i) => i.startsWith('blocked:'))).toBe(false)
  })

  it('停止中は閾値（日数）に満たなければ通知しない', () => {
    const w = seed.wbs.find((x) => x.status === 'blocked')!
    const fresh = run(seed, { type: 'WBS_UPDATE', id: w.id, patch: { status: 'blocked' } }) // 変更なし
    const tight = run({ ...fresh, wbs: fresh.wbs.map((x) => (x.id === w.id ? { ...x, statusChangedAt: MONDAY_ISO } : x)) }, { type: 'SETTINGS_UPDATE', patch: { blockedAlertDays: 1 } })
    expect(ids(tight).includes(`blocked:${w.projectId}`)).toBe(false)
  })

  it('負荷のしきい値を設定で下げると、過負荷の通知が増える', () => {
    const before = ids(seed).filter((i) => i.startsWith('overload:')).length
    const after = ids(run(seed, { type: 'SETTINGS_UPDATE', patch: { loadWarn: 0.8 } })).filter((i) => i.startsWith('overload:')).length
    expect(after).toBeGreaterThan(before)
  })

  it('PJ化判断: 評価中・PJ化待ちの案件が出る。判断期限を過ぎると赤（critical）になる', () => {
    const decision = d.alerts.find((a) => a.kind === 'pj_decision')!
    expect(decision.to).toMatch(/^\/pipeline\/.+\/evaluation$/)
    const opp = seed.opportunities.find((o) => o.stage === 'approval_wait')!
    const late = { ...seed, opportunities: seed.opportunities.map((o) => (o.id === opp.id ? { ...o, decisionDue: '2026-10-01' } : o)) }
    const a = buildDerived(late, MONDAY).alerts.find((x) => x.id === `pj_decision:${opp.id}`)!
    expect(a.tone).toBe('critical')
    expect(a.detail).toContain('超過')
  })

  it('人員未配置の案件・計画中プロジェクトは配置画面へ誘導する', () => {
    const gap = d.alerts.find((a) => a.kind === 'assignment_gap')!
    expect(gap.to).toMatch(/^\/assignments\?target=(opp|prj):/)
  })
})
