import { describe, expect, it } from 'vitest'
import { atLeast, can, denyReason } from './permissions'
import type { Project, Role, User, WbsItem } from './types'

const u = (id: string, role: Role, status: User['status'] = 'active'): User => ({ id, name: id, initials: id, email: '', role, team: '', jobTitle: '', weeklyCapacity: 40, hourlyRate: 0, status, strengths: [] })
const admin = u('a', 'admin')
const manager = u('m', 'manager')
const leader = u('l', 'leader')
const member = u('u', 'member')
const viewer = u('v', 'viewer')
const project = { id: 'p', ownerId: 'l' } as Project
const mine = { id: 'w', ownerId: 'u' } as WbsItem
const others = { id: 'w2', ownerId: 'x' } as WbsItem

describe('権限（画面側の制御。本番ではGAS側でも同じ検証をする）', () => {
  it('ロールの強さ: 閲覧者 < 担当 < リーダー < 課長 < 管理者', () => {
    expect(atLeast(member, 'leader')).toBe(false)
    expect(atLeast(manager, 'leader')).toBe(true)
    expect(atLeast(admin, 'manager')).toBe(true)
    expect(atLeast(undefined, 'viewer')).toBe(false)
  })

  it('担当者: 自分のタスクの残り・進捗は更新できるが、構成（日付・計画・担当）は変えられない', () => {
    expect(can(member, 'wbs.progress', { project, wbs: mine })).toBe(true)
    expect(can(member, 'wbs.progress', { project, wbs: others })).toBe(false)
    expect(can(member, 'wbs.structure', { project })).toBe(false)
  })

  it('リーダー: 自分のプロジェクトのWBS・リスクを更新できる。他のプロジェクトは不可', () => {
    expect(can(leader, 'wbs.structure', { project })).toBe(true)
    expect(can(leader, 'risk.edit', { project })).toBe(true)
    expect(can(leader, 'wbs.structure', { project: { ...project, ownerId: 'other' } })).toBe(false)
    expect(can(leader, 'project.create')).toBe(false)
  })

  it('課長以上: 全プロジェクト・案件・配置の判断ができる', () => {
    for (const a of ['project.create', 'project.edit', 'pipeline.edit', 'pipeline.decide', 'assignment.confirm', 'wbs.structure'] as const) {
      expect(can(manager, a, { project })).toBe(true)
    }
    expect(can(manager, 'admin.access')).toBe(false)
  })

  it('管理者のみ 管理 に入れる', () => {
    expect(can(admin, 'admin.access')).toBe(true)
    for (const x of [manager, leader, member, viewer]) expect(can(x, 'admin.access')).toBe(false)
  })

  it('閲覧者は何も変更できない / 停止中のユーザーも操作できない', () => {
    expect(can(viewer, 'time.log')).toBe(false)
    expect(can(viewer, 'wbs.progress', { project, wbs: { ...mine, ownerId: 'v' } })).toBe(false)
    expect(can(u('x', 'admin', 'inactive'), 'admin.access')).toBe(false)
  })

  it('スキル・稼働: 本人またはリーダー以上（確認はリーダー以上）', () => {
    expect(can(member, 'skill.edit', { targetUserId: 'u' })).toBe(true)
    expect(can(member, 'skill.edit', { targetUserId: 'other' })).toBe(false)
    expect(can(leader, 'skill.edit', { targetUserId: 'other' })).toBe(true)
    expect(can(member, 'skill.confirm')).toBe(false)
    expect(can(member, 'capacity.edit', { targetUserId: 'u' })).toBe(true)
    expect(can(member, 'capacity.edit', { targetUserId: 'other' })).toBe(false)
    expect(can(manager, 'capacity.edit', { targetUserId: 'other' })).toBe(true)
  })

  it('自分の作業時間だけ入力できる', () => {
    expect(can(member, 'time.log', { targetUserId: 'u' })).toBe(true)
    expect(can(member, 'time.log', { targetUserId: 'other' })).toBe(false)
  })

  it('操作できない理由が日本語で返る', () => {
    expect(denyReason('admin.access')).toContain('管理者')
    expect(denyReason('pipeline.decide')).toContain('課長')
  })
})
