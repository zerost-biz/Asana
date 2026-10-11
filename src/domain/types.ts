/** 日付は常に 'yyyy-MM-dd' 形式の文字列で保持する（タイムゾーン事故を避ける） */
export type ISODate = string

export interface User {
  id: string
  name: string
  initials: string
  /** 週あたりの稼働可能時間 (h) */
  weeklyCapacity: number
  /** 原価単価（円/時間）。人件費 = 工数(h) × 単価。1人日 = 8h として人日単価に換算できる */
  hourlyRate: number
}

export type ProjectStatus = 'active' | 'planning' | 'completed'
export type Health = 'GOOD' | 'WATCH' | 'RISK'

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  startDate: ISODate
  endDate: ISODate
  /**
   * Healthの手動上書き。null の場合は WBS の実データから自動判定する。
   * （EAC差異・遅延・Blocked・リスクから calculations.computeHealth が算出）
   */
  health: Health | null
  /** 受注額・予算（円）。未設定なら粗利は計算しない（社内PJなど） */
  budget?: number
}

export type WbsStatus = 'Not started' | 'In progress' | 'Blocked' | 'Done'

export interface WbsItem {
  id: string
  projectId: string
  /** 親WBSのid。最上位は null */
  parentId: string | null
  title: string
  /** 担当者。親(フェーズ)行は null（子から集計） */
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
  /** タスクメモ（ドロワーで編集） */
  comment?: string
}

export interface TimeEntry {
  id: string
  wbsId: string
  userId: string
  date: ISODate
  /** 実績工数 (h) */
  hours: number
  comment: string
}

export type RiskSeverity = 'high' | 'medium' | 'low'
export type RiskStatus = 'open' | 'watching' | 'closed'

export interface Risk {
  id: string
  projectId: string
  wbsId?: string
  severity: RiskSeverity
  title: string
  status: RiskStatus
}

/** localStorage に保存するアプリ全体の状態 */
export interface AppData {
  users: User[]
  projects: Project[]
  wbs: WbsItem[]
  timeEntries: TimeEntry[]
  risks: Risk[]
  /** My Work の操作ユーザー */
  currentUserId: string
  /** seed を生成した基準日（リセット時の確認用） */
  seededOn: ISODate
}

export const WBS_STATUSES: WbsStatus[] = ['Not started', 'In progress', 'Blocked', 'Done']

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: '進行中',
  planning: '計画中',
  completed: '完了',
}

export const WBS_STATUS_LABEL: Record<WbsStatus, string> = {
  'Not started': '未着手',
  'In progress': '進行中',
  Blocked: '停止中',
  Done: '完了',
}
