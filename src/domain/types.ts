/** 日付は常に 'yyyy-MM-dd' 形式の文字列で保持する（タイムゾーン事故を避ける） */
export type ISODate = string
/** 日時は ISO 8601（toISOString） */
export type ISODateTime = string

/* ------------------------------------------------------------------ */
/* ユーザー・ロール・スキル                                              */
/* ------------------------------------------------------------------ */

export type Role = 'admin' | 'manager' | 'leader' | 'member' | 'viewer'

export const ROLE_LABEL: Record<Role, string> = {
  admin: '管理者',
  manager: '課長（マネージャー）',
  leader: 'リーダー',
  member: '担当メンバー',
  viewer: '閲覧者',
}

export interface User {
  id: string
  name: string
  initials: string
  email: string
  /** システム上の権限ロール */
  role: Role
  /** 所属チーム */
  team: string
  /** 役職・役割（例: コンサルタント） */
  jobTitle: string
  /** 週あたりの標準稼働可能時間 (h) = Base Capacity */
  weeklyCapacity: number
  /** 原価単価（円/時間）。人件費 = 工数(h) × 単価。1人日 = 8h として人日単価に換算できる */
  hourlyRate: number
  status: 'active' | 'inactive'
  /** 得意領域（自由記述） */
  strengths: string[]
}

export interface Skill {
  id: string
  name: string
  category: string
  description: string
  /** 組織として確保したい「レベル3以上」の人数（スキルマップの目標） */
  targetLv3Count: number
}

/** 1=基礎 2=支援あり 3=自走 4=指導 5=専門責任者 */
export type SkillLevel = 1 | 2 | 3 | 4 | 5

export const SKILL_LEVEL_LABEL: Record<number, string> = {
  0: '未経験',
  1: '基礎',
  2: '支援あり',
  3: '自走',
  4: '指導',
  5: '専門責任者',
}

export interface UserSkill {
  userId: string
  skillId: string
  level: number
  /** 根拠（経験したPJ・上司確認など） */
  evidence: string
  updatedAt: ISODate
  /** 上司・リーダーが確認した場合の確認者 */
  confirmedBy?: string
}

/** 育成テーマ（本人・上司） */
export interface GrowthFocus {
  id: string
  userId: string
  text: string
  by: 'self' | 'manager'
  /** 関連するスキル（あれば） */
  skillId?: string
  /** 関連する役割（あれば） */
  role?: string
}

export interface Customer {
  id: string
  name: string
  industry: string
}

/* ------------------------------------------------------------------ */
/* 受注見込み（パイプライン）                                            */
/* ------------------------------------------------------------------ */

export type OppStage = 'consultation' | 'explore' | 'candidate' | 'evaluation' | 'approval_wait' | 'converted' | 'lost'

export const OPP_STAGES: OppStage[] = ['consultation', 'explore', 'candidate', 'evaluation', 'approval_wait']

export const OPP_STAGE_LABEL: Record<OppStage, string> = {
  consultation: '相談',
  explore: '探索',
  candidate: 'PJ候補',
  evaluation: '評価中',
  approval_wait: 'PJ化待ち',
  converted: 'PJ化済み',
  lost: '見送り',
}

/** 役割ごとの必要工数（開始〜終了期間の合計）。週別需要は期間の稼働週へ均等配分して導出する */
export interface RoleDemand {
  role: string
  hours: number
  /** この役割に必要なスキル（Opportunity.skills の skillId）。空なら案件全体のスキルで判定 */
  skillIds: string[]
}

export interface OpportunitySkill {
  skillId: string
  requiredLevel: number
}

/** PJ化評価の軸（1〜5点） */
export type EvalAxis =
  | 'customerValue'
  | 'ltv'
  | 'strategic'
  | 'ripple'
  | 'winning'
  | 'capability'
  | 'feasibility'
  | 'risk'

export const EVAL_AXES: { key: EvalAxis; label: string; hint: string }[] = [
  { key: 'customerValue', label: '顧客価値', hint: '課題の重要度・成果インパクト' },
  { key: 'ltv', label: '将来の継続性(LTV)', hint: '将来の契約・継続性' },
  { key: 'strategic', label: '戦略顧客性', hint: '戦略的に重要な顧客か' },
  { key: 'ripple', label: '横展開・波及', hint: '業界・他拠点への横展開' },
  { key: 'winning', label: '新しい勝ち筋', hint: '新しい顧客攻略モデル・新商材の勝ち筋' },
  { key: 'capability', label: '組織能力の獲得', hint: 'やることで組織の力が付くか' },
  { key: 'feasibility', label: '人員確保の実現性', hint: '必要な人工を確保できるか' },
  { key: 'risk', label: 'リスクの低さ', hint: '技術・納期・責任範囲のリスクが小さいほど高得点' },
]

export type EvalScores = Partial<Record<EvalAxis, number>>

export interface Opportunity {
  id: string
  customerId: string
  title: string
  ownerId: string
  stage: OppStage
  /** 確度 0〜100 (%) */
  probability: number
  startDate: ISODate
  endDate: ISODate
  /** 次のアクション */
  nextAction: string
  /** PJ化判断の期限 */
  decisionDue?: ISODate
  demands: RoleDemand[]
  skills: OpportunitySkill[]
  scores: EvalScores
  evalComment: string
  createdAt: ISODate
  convertedProjectId?: string
  convertedAt?: ISODate
  lostReason?: string
}

/* ------------------------------------------------------------------ */
/* プロジェクト・WBS                                                    */
/* ------------------------------------------------------------------ */

export type ProjectStatus = 'planned' | 'active' | 'on_hold' | 'completed' | 'archived'
export type Priority = 'high' | 'medium' | 'low'
export type Health = 'GOOD' | 'WATCH' | 'RISK'

/** 配置計画で必要な役割（FTE = 週あたりの人数換算。0.3 = 週あたり0.3人分） */
export interface RoleNeed {
  role: string
  fte: number
}

export interface Project {
  id: string
  customerId: string
  name: string
  /** PJリーダー */
  ownerId: string
  status: ProjectStatus
  startDate: ISODate
  endDate: ISODate
  priority: Priority
  /**
   * 状態(Health)の手動上書き。null の場合は WBS の実データから自動判定する。
   * （EAC差異・遅延・Blocked・リスクから calculations.computeProjectHealth が算出）
   */
  health: Health | null
  /** 受注額・予算（円）。未設定なら粗利は計算しない（社内PJなど） */
  budget?: number
  description: string
  roleNeeds: RoleNeed[]
  /** PJ化した元の案件 */
  opportunityId?: string
}

export type WbsStatus = 'not_started' | 'in_progress' | 'blocked' | 'done'
export type WbsType = 'phase' | 'work_package' | 'task' | 'milestone'

export interface WbsItem {
  id: string
  projectId: string
  /** 親WBSのid。最上位は null */
  parentId: string | null
  type: WbsType
  title: string
  description?: string
  /** 担当者。親(フェーズ/WP)行は null（子から集計） */
  ownerId: string | null
  startDate: ISODate
  endDate: ISODate
  /** PLAN: 計画工数 (h)。親行は子の合計を使うため無視される */
  planHours: number
  /** ETC: 完了までに必要な残工数 (h)。進捗率からは算出しない独立入力値 */
  etcHours: number
  /** 0〜100 */
  progress: number
  status: WbsStatus
  priority: Priority
  /** 先行タスク（終了してから開始する関係） */
  predecessorId?: string
  /** 成果物のURL（Drive等） */
  deliverableUrl?: string
  /** 社内オーダー（作業時間を計上するオーダー）。未設定なら「オーダー未設定」として集計される */
  orderId?: string
  /** タスクメモ */
  comment?: string
  /** 当初計画（再計画してもここは変えない） */
  baselinePlanHours: number
  baselineStart: ISODate
  baselineEnd: ISODate
  /** 状態を最後に変えた日（停止中が何日続いているか等） */
  statusChangedAt: ISODate
  /** ETC（残り）を最後に更新した日 */
  etcUpdatedAt: ISODate
}

export interface TimeEntry {
  id: string
  userId: string
  projectId: string
  wbsId: string
  date: ISODate
  /** 実績工数 (h) */
  hours: number
  comment: string
  /** 作業時間を計上した社内オーダー（入力時の作業のオーダー。レポートの集計キー） */
  orderId?: string
}

/**
 * 社内オーダー: プロジェクトごとに登録する、作業時間・人件費の計上先（内部オーダー番号）。
 * 番号は会社全体で一意。「終了」にすると新しい入力では選べなくなるが、過去の集計は残る。
 */
export interface InternalOrder {
  id: string
  projectId: string
  /** オーダー番号（例: IO-2601-001）。全プロジェクトで重複不可 */
  code: string
  name: string
  status: 'active' | 'closed'
  note?: string
}

/** 週別の配置（仮アサイン/確定）。1回の配置操作 = 期間内の複数週分の行 */
export interface Assignment {
  id: string
  /** 配置先の種別。project の場合 targetId は projectId、opportunity の場合は案件ID */
  targetType: 'project' | 'opportunity'
  targetId: string
  wbsId?: string
  userId: string
  role: string
  weekStart: ISODate
  plannedHours: number
  status: 'tentative' | 'confirmed'
  /** 同じ配置操作でできた行をまとめるID */
  batchId: string
  /** 配置の理由（育成意図など） */
  reason?: string
}

/** 作業項目×週の工数を手で修正した値（自動配分より優先） */
export interface AllocationOverride {
  wbsId: string
  weekStart: ISODate
  hours: number
}

/** 人×週の稼働（休暇・研修・固定業務などで使えない時間） */
export interface Capacity {
  userId: string
  weekStart: ISODate
  /** 未指定ならユーザーの標準稼働 */
  baseHours?: number
  unavailableHours: number
  note?: string
}

export type RiskSeverity = 'high' | 'medium' | 'low'
export type RiskStatus = 'open' | 'mitigating' | 'closed'

export interface Risk {
  id: string
  projectId: string
  wbsId?: string
  kind: 'risk' | 'issue'
  severity: RiskSeverity
  /** 発生確率 */
  probability: RiskSeverity
  title: string
  ownerId?: string
  status: RiskStatus
  createdAt: ISODate
}

/* ------------------------------------------------------------------ */
/* 経験・プロジェクト完了                                                */
/* ------------------------------------------------------------------ */

export interface Experience {
  id: string
  userId: string
  projectId: string
  role: string
  summary: string
  skillIds: string[]
  /** candidate: 完了時に自動で作られた候補 / confirmed: 本人・リーダーが確定 */
  status: 'candidate' | 'confirmed'
  startDate: ISODate
  endDate: ISODate
  createdAt: ISODate
}

export interface CloseMember {
  userId: string
  role: string
  summary: string
  skillIds: string[]
  nextRecommendation: string
}

export interface ProjectClose {
  projectId: string
  outcome: string
  /** 売上または価値 */
  valueText: string
  revenue?: number
  lessons: string
  reusableAssets: string
  members: CloseMember[]
  status: 'draft' | 'closed'
  closedAt?: ISODate
}

/* ------------------------------------------------------------------ */
/* 更新履歴・設定・週次レビュー                                          */
/* ------------------------------------------------------------------ */

export type EntityType =
  | 'wbs'
  | 'project'
  | 'time_entry'
  | 'opportunity'
  | 'assignment'
  | 'risk'
  | 'user'
  | 'user_skill'
  | 'experience'
  | 'close'
  | 'setting'
  | 'capacity'
  | 'order'

export interface ActivityLog {
  id: string
  entityType: EntityType
  entityId: string
  /** 関連するプロジェクト（絞り込み用） */
  projectId?: string
  userId: string
  /** create / update / delete / comment / move / convert など */
  action: string
  /** 画面に出す1行の説明 */
  summary: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  timestamp: ISODateTime
}

export interface ReviewNote {
  id: string
  weekStart: ISODate
  text: string
  authorId: string
  createdAt: ISODateTime
}

export interface MatchWeights {
  skill: number
  capacity: number
  experience: number
  growth: number
  continuity: number
}

export interface Settings {
  /** 工数入力の刻み (h) */
  hoursStep: 0.25 | 0.5
  /** 親行の進捗の加重（計画 or 見込み） */
  parentProgressWeight: 'plan' | 'eac'
  /** 状態判定: 見込み超過がこの割合以上で「危険」「注意」 */
  riskVarianceRatio: number
  watchVarianceRatio: number
  /** 粗利率の目安 */
  marginTarget: number
  /** 負荷率のしきい値 */
  loadCaution: number
  loadWarn: number
  /** 標準の週稼働 (h) */
  baseCapacity: number
  /** 残りが何日更新されていないと通知するか */
  etcStaleDays: number
  /** 停止中が何日以上続くと通知するか（24時間以上 = 1日） */
  blockedAlertDays: number
  /** 期限の何日前から通知するか */
  deadlineSoonDays: number
  matchWeights: MatchWeights
  /** 今週のチーム重点テーマ（ホームに表示） */
  mission: string
  /** 役割マスタ */
  roles: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  hoursStep: 0.5,
  parentProgressWeight: 'plan',
  riskVarianceRatio: 0.15,
  watchVarianceRatio: 0.05,
  marginTarget: 0.1,
  loadCaution: 0.85,
  loadWarn: 1,
  baseCapacity: 40,
  etcStaleDays: 7,
  blockedAlertDays: 1,
  deadlineSoonDays: 3,
  matchWeights: { skill: 0.4, capacity: 0.3, experience: 0.15, growth: 0.1, continuity: 0.05 },
  mission: '',
  roles: ['PJリード', 'MESコンサルタント', 'SCADAエンジニア', 'ITエンジニア', '営業・企画', 'メンバー'],
}

/** localStorage（本番は Sheets）に保存するアプリ全体の状態 */
export interface AppData {
  users: User[]
  skills: Skill[]
  userSkills: UserSkill[]
  growthFocus: GrowthFocus[]
  customers: Customer[]
  opportunities: Opportunity[]
  projects: Project[]
  wbs: WbsItem[]
  timeEntries: TimeEntry[]
  internalOrders: InternalOrder[]
  assignments: Assignment[]
  allocationOverrides: AllocationOverride[]
  capacities: Capacity[]
  risks: Risk[]
  experiences: Experience[]
  closes: ProjectClose[]
  activity: ActivityLog[]
  reviewNotes: ReviewNote[]
  settings: Settings
  /** 操作ユーザー（ログイン相当） */
  currentUserId: string
  /** seed を生成した基準日（リセット時の確認用） */
  seededOn: ISODate
}

export const WBS_STATUSES: WbsStatus[] = ['not_started', 'in_progress', 'blocked', 'done']

export const WBS_STATUS_LABEL: Record<WbsStatus, string> = {
  not_started: '未着手',
  in_progress: '進行中',
  blocked: '停止中',
  done: '完了',
}

export const WBS_TYPE_LABEL: Record<WbsType, string> = {
  phase: 'フェーズ',
  work_package: '作業パッケージ',
  task: 'タスク',
  milestone: 'マイルストーン',
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: '計画中',
  active: '進行中',
  on_hold: '保留',
  completed: '完了',
  archived: 'アーカイブ',
}

export const PRIORITY_LABEL: Record<Priority, string> = { high: '高', medium: '中', low: '低' }
export const SEVERITY_LABEL: Record<RiskSeverity, string> = { high: '高', medium: '中', low: '低' }
export const RISK_STATUS_LABEL: Record<RiskStatus, string> = { open: '未対応', mitigating: '対応中', closed: '解決済み' }
