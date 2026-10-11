import type { Project, Role, User, WbsItem } from './types'

/**
 * 権限の方針（仕様書 21.1）
 *  - 担当メンバー : 自分のタスク/実績/残り/進捗を更新
 *  - リーダー     : 自分がリーダーのプロジェクトのWBS・担当・計画・リスクを更新、配置を提案
 *  - 課長         : 全プロジェクト・案件・配置・稼働を参照・判断
 *  - 管理者       : マスタ・ユーザー・設定
 *  - 閲覧者       : 参照のみ
 * ローカル試作では画面側で制御する。本番(GAS)ではサーバー側でも必ず同じ検証を行う。
 */
const RANK: Record<Role, number> = { viewer: 0, member: 1, leader: 2, manager: 3, admin: 4 }

export const atLeast = (user: User | undefined, role: Role): boolean => !!user && RANK[user.role] >= RANK[role]

export type Action =
  | 'admin.access'
  | 'project.create'
  | 'project.edit'
  | 'project.delete'
  | 'wbs.structure' // 作業項目の追加・削除・並べ替え・担当/日付/計画の変更
  | 'wbs.progress' // 自分の担当の 残り・進捗・状態・コメント
  | 'risk.edit'
  | 'time.log'
  | 'pipeline.edit'
  | 'pipeline.decide' // PJ化の判断
  | 'assignment.propose'
  | 'assignment.confirm'
  | 'capacity.edit'
  | 'skill.edit'
  | 'skill.confirm'
  | 'experience.confirm'
  | 'close.edit'
  | 'review.edit'
  | 'mission.edit'

export interface Ctx {
  project?: Project
  wbs?: WbsItem
  /** 対象となる人（スキル・稼働・経験の本人） */
  targetUserId?: string
}

export function can(user: User | undefined, action: Action, ctx: Ctx = {}): boolean {
  if (!user || user.status !== 'active') return false
  const isLeaderOf = !!ctx.project && ctx.project.ownerId === user.id
  const self = !!ctx.targetUserId && ctx.targetUserId === user.id
  switch (action) {
    case 'admin.access':
      return atLeast(user, 'admin')
    case 'project.create':
    case 'project.delete':
    case 'pipeline.edit':
    case 'pipeline.decide':
    case 'assignment.confirm':
      return atLeast(user, 'manager')
    case 'project.edit':
    case 'wbs.structure':
    case 'risk.edit':
    case 'close.edit':
      return atLeast(user, 'manager') || (atLeast(user, 'leader') && isLeaderOf)
    case 'wbs.progress':
      return (
        can(user, 'wbs.structure', ctx) || (atLeast(user, 'member') && !!ctx.wbs && ctx.wbs.ownerId === user.id)
      )
    case 'time.log':
      return atLeast(user, 'member') && (!ctx.targetUserId || self)
    case 'assignment.propose':
      return atLeast(user, 'leader')
    case 'capacity.edit':
      return atLeast(user, 'manager') || (atLeast(user, 'member') && self)
    case 'skill.edit':
      return atLeast(user, 'leader') || (atLeast(user, 'member') && self)
    case 'skill.confirm':
      return atLeast(user, 'leader')
    case 'experience.confirm':
      return atLeast(user, 'manager') || (atLeast(user, 'member') && self) || (atLeast(user, 'leader') && isLeaderOf)
    case 'review.edit':
    case 'mission.edit':
      return atLeast(user, 'leader')
  }
}

/** 操作できないときに画面で出す理由 */
export function denyReason(action: Action): string {
  switch (action) {
    case 'admin.access':
      return '管理者のみ利用できます'
    case 'project.create':
    case 'project.delete':
    case 'pipeline.edit':
    case 'pipeline.decide':
    case 'assignment.confirm':
      return '課長（マネージャー）以上の権限が必要です'
    case 'project.edit':
    case 'wbs.structure':
    case 'risk.edit':
    case 'close.edit':
      return 'このプロジェクトのリーダー、または課長以上の権限が必要です'
    case 'wbs.progress':
      return '担当者本人、またはプロジェクトのリーダー以上のみ変更できます'
    case 'time.log':
      return '自分の作業時間のみ入力できます'
    case 'assignment.propose':
      return 'リーダー以上の権限が必要です'
    case 'capacity.edit':
    case 'skill.edit':
    case 'experience.confirm':
      return '本人、またはリーダー・課長以上のみ変更できます'
    case 'skill.confirm':
    case 'review.edit':
    case 'mission.edit':
      return 'リーダー以上の権限が必要です'
  }
}
