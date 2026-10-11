import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { buildTemplateItems } from '../data/templates'
import { createSeed } from '../data/seed'
import { can as canDo, type Action as PermAction, type Ctx as PermCtx } from '../domain/permissions'
import { getToday, toISO, parseDate } from '../domain/dates'
import type {
  AppData,
  Assignment,
  Capacity,
  Customer,
  EntityType,
  Experience,
  GrowthFocus,
  Opportunity,
  OppStage,
  Project,
  ProjectClose,
  Risk,
  Settings,
  Skill,
  User,
  UserSkill,
  WbsItem,
} from '../domain/types'
import { repository } from '../repository'
import { buildDerived, type Derived } from './derived'
import { newId, reducer, type Body, type LogWorkPayload } from './reducer'

export interface NewProjectInput {
  name: string
  customerId: string
  ownerId: string
  status: Project['status']
  priority: Project['priority']
  startDate: string
  endDate: string
  budget?: number
  description?: string
  /** 'standard' なら標準の作業テンプレートから作成、'blank' なら空のプロジェクト */
  template: 'blank' | 'standard'
  /** テンプレートのタスクに順番に割り当てる担当者（空なら未設定） */
  ownerIds: string[]
  roleNeeds?: Project['roleNeeds']
  opportunityId?: string
}

export type NewWbsInput = Pick<WbsItem, 'projectId' | 'parentId' | 'type' | 'title' | 'ownerId' | 'startDate' | 'endDate' | 'planHours' | 'etcHours' | 'progress' | 'status' | 'priority'> &
  Partial<Pick<WbsItem, 'description' | 'predecessorId' | 'deliverableUrl' | 'comment'>>

export interface ProposeInput {
  targetType: 'project' | 'opportunity'
  targetId: string
  userId: string
  role: string
  /** 配置する週（月曜の ISO 日付） */
  weekStarts: string[]
  hoursPerWeek: number
  reason?: string
  status?: Assignment['status']
}

export interface ConvertInput {
  name: string
  ownerId: string
  startDate: string
  endDate: string
  budget?: number
  template: 'blank' | 'standard'
}

export interface AppActions {
  addProject: (input: NewProjectInput) => string
  updateProject: (id: string, patch: Partial<Omit<Project, 'id'>>) => void
  deleteProject: (id: string) => void
  addWbs: (item: NewWbsInput) => string
  addTemplateWbs: (projectId: string, startDate: string, endDate: string, ownerIds: string[]) => void
  updateWbs: (id: string, patch: Partial<Omit<WbsItem, 'id' | 'projectId'>>) => void
  deleteWbs: (id: string) => void
  duplicateWbs: (id: string) => string
  moveWbs: (id: string, dir: 'up' | 'down') => void
  /** 作業時間の記録を追加し、作業項目の残り・進捗・状態を更新する */
  logWork: (payload: LogWorkPayload) => void
  deleteEntry: (id: string) => void
  setAllocation: (wbsId: string, weekStart: string, hours: number | null) => void
  setCapacity: (capacity: Capacity) => void
  addRisk: (input: Omit<Risk, 'id' | 'createdAt'>) => void
  updateRisk: (id: string, patch: Partial<Omit<Risk, 'id'>>) => void
  deleteRisk: (id: string) => void
  addComment: (entityType: EntityType, entityId: string, projectId: string | undefined, text: string) => void
  addOpportunity: (opp: Omit<Opportunity, 'id' | 'createdAt'>) => string
  updateOpportunity: (id: string, patch: Partial<Omit<Opportunity, 'id'>>) => void
  moveOpportunity: (id: string, stage: OppStage, lostReason?: string) => void
  convertOpportunity: (oppId: string, input: ConvertInput) => string
  /** 仮アサインを作成し、配置のまとまり(batchId)を返す */
  proposeAssignment: (input: ProposeInput) => string
  setAssignmentStatus: (batchId: string, status: Assignment['status']) => void
  removeAssignment: (batchId: string) => void
  addUser: (user: Omit<User, 'id'>) => string
  updateUser: (id: string, patch: Partial<Omit<User, 'id'>>) => void
  setCurrentUser: (id: string) => void
  upsertSkill: (skill: Omit<Skill, 'id'> & { id?: string }) => void
  deleteSkill: (id: string) => void
  setUserSkill: (userSkill: UserSkill) => void
  upsertGrowth: (focus: Omit<GrowthFocus, 'id'> & { id?: string }) => void
  deleteGrowth: (id: string) => void
  upsertCustomer: (customer: Omit<Customer, 'id'> & { id?: string }) => void
  addExperience: (experience: Omit<Experience, 'id' | 'createdAt'>) => void
  confirmExperience: (id: string, levelUp: string[]) => void
  deleteExperience: (id: string) => void
  saveClose: (close: ProjectClose) => void
  finalizeClose: (projectId: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  addReviewNote: (weekStart: string, text: string) => void
  /** デモデータを初期化（保存データも seed に戻す） */
  resetDemo: () => Promise<void>
}

interface AppContextValue {
  data: AppData
  today: Date
  derived: Derived
  actions: AppActions
  /** 操作ユーザー（ログイン相当） */
  me: User
  /** 操作ユーザーがその操作をできるか */
  can: (action: PermAction, ctx?: PermCtx) => boolean
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<AppData | null>(null)

  useEffect(() => {
    let alive = true
    repository.load().then((d) => {
      if (alive) setBoot(d ?? createSeed(getToday()))
    })
    return () => {
      alive = false
    }
  }, [])

  if (!boot) return <div className="splash">読み込み中…</div>
  return <AppRuntime initial={boot}>{children}</AppRuntime>
}

function AppRuntime({ initial, children }: { initial: AppData; children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, initial)
  const [today, setToday] = useState<Date>(() => getToday())
  const actorRef = useRef(data.currentUserId)
  const todayRef = useRef(today)

  useEffect(() => {
    actorRef.current = data.currentUserId
  }, [data.currentUserId])
  useEffect(() => {
    todayRef.current = today
  }, [today])

  // 変更のたびに保存（失敗は握りつぶさず Repository 側で警告）
  useEffect(() => {
    void repository.save(data)
  }, [data])

  // 他タブ・他ユーザーでの変更を反映
  useEffect(() => repository.subscribe?.((d) => dispatch({ type: 'LOAD', data: d })), [])

  // 日付をまたいだら「今日」を更新
  useEffect(() => {
    const t = window.setInterval(() => {
      const n = getToday()
      setToday((prev) => (toISO(prev) === toISO(n) ? prev : n))
    }, 60_000)
    return () => window.clearInterval(t)
  }, [])

  const derived = useMemo(() => buildDerived(data, today), [data, today])

  const send = useCallback((body: Body) => {
    dispatch({
      ...body,
      meta: { actorId: actorRef.current, now: new Date().toISOString(), today: toISO(todayRef.current) },
    } as never)
  }, [])

  const actions = useMemo<AppActions>(() => {
    const t = () => toISO(todayRef.current)
    const wbsFrom = (i: NewWbsInput): WbsItem => ({
      ...i,
      id: newId('w'),
      baselinePlanHours: i.planHours,
      baselineStart: i.startDate,
      baselineEnd: i.endDate,
      statusChangedAt: t(),
      etcUpdatedAt: t(),
    })
    return {
      addProject: (input) => {
        const id = newId('p')
        const project: Project = {
          id,
          customerId: input.customerId,
          name: input.name,
          ownerId: input.ownerId,
          status: input.status,
          startDate: input.startDate,
          endDate: input.endDate,
          priority: input.priority,
          health: null,
          budget: input.budget,
          description: input.description ?? '',
          roleNeeds: input.roleNeeds ?? [],
          opportunityId: input.opportunityId,
        }
        const items =
          input.template === 'standard' ? buildTemplateItems(id, input.startDate, input.endDate, input.ownerIds, newId, t()) : []
        send({ type: 'PROJECT_ADD', project, items })
        return id
      },
      updateProject: (id, patch) => send({ type: 'PROJECT_UPDATE', id, patch }),
      deleteProject: (id) => send({ type: 'PROJECT_DELETE', id }),
      addWbs: (item) => {
        const w = wbsFrom(item)
        send({ type: 'WBS_ADD', item: w })
        return w.id
      },
      addTemplateWbs: (projectId, startDate, endDate, ownerIds) =>
        send({ type: 'WBS_ADD_MANY', items: buildTemplateItems(projectId, startDate, endDate, ownerIds, newId, t()) }),
      updateWbs: (id, patch) => send({ type: 'WBS_UPDATE', id, patch }),
      deleteWbs: (id) => send({ type: 'WBS_DELETE', id }),
      duplicateWbs: (id) => {
        // 複製対象（自分と配下）すべてに新しいIDを割り当てる。実際のツリーは reducer が組み立てる
        const idMap: Record<string, string> = {}
        const walk = (cur: string) => {
          idMap[cur] = newId('w')
          data.wbs.filter((w) => w.parentId === cur).forEach((c) => walk(c.id))
        }
        walk(id)
        send({ type: 'WBS_DUPLICATE', id, idMap })
        return idMap[id]
      },
      moveWbs: (id, dir) => send({ type: 'WBS_MOVE', id, dir }),
      logWork: (payload) => send({ type: 'LOG_WORK', payload }),
      deleteEntry: (id) => send({ type: 'ENTRY_DELETE', id }),
      setAllocation: (wbsId, weekStart, hours) => send({ type: 'ALLOC_SET', wbsId, weekStart, hours }),
      setCapacity: (capacity) => send({ type: 'CAPACITY_SET', capacity }),
      addRisk: (input) => send({ type: 'RISK_ADD', risk: { ...input, id: newId('r'), createdAt: t() } }),
      updateRisk: (id, patch) => send({ type: 'RISK_UPDATE', id, patch }),
      deleteRisk: (id) => send({ type: 'RISK_DELETE', id }),
      addComment: (entityType, entityId, projectId, text) =>
        send({ type: 'COMMENT_ADD', entityType, entityId, projectId, text, id: newId('c') }),
      addOpportunity: (opp) => {
        const id = newId('o')
        send({ type: 'OPP_ADD', opp: { ...opp, id, createdAt: t() } })
        return id
      },
      updateOpportunity: (id, patch) => send({ type: 'OPP_UPDATE', id, patch }),
      moveOpportunity: (id, stage, lostReason) => send({ type: 'OPP_MOVE', id, stage, lostReason }),
      convertOpportunity: (oppId, input) => {
        const o = data.opportunities.find((x) => x.id === oppId)
        if (!o) return ''
        const id = newId('p')
        const weeks = Math.max(1, (parseDate(input.endDate).getTime() - parseDate(input.startDate).getTime()) / (7 * 86400000))
        const project: Project = {
          id,
          customerId: o.customerId,
          name: input.name,
          ownerId: input.ownerId,
          status: input.startDate <= t() ? 'active' : 'planned',
          startDate: input.startDate,
          endDate: input.endDate,
          priority: 'medium',
          health: null,
          budget: input.budget,
          description: o.title,
          roleNeeds: o.demands.map((d) => ({ role: d.role, fte: Math.round((d.hours / weeks / data.settings.baseCapacity) * 10) / 10 })),
          opportunityId: o.id,
        }
        const assignedUsers = [...new Set(data.assignments.filter((a) => a.targetType === 'opportunity' && a.targetId === oppId).map((a) => a.userId))]
        const items =
          input.template === 'standard' ? buildTemplateItems(id, input.startDate, input.endDate, assignedUsers, newId, t()) : []
        send({ type: 'OPP_CONVERT', oppId, project, items })
        return id
      },
      proposeAssignment: (input) => {
        const batchId = newId('as')
        const rows: Assignment[] = input.weekStarts.map((w, i) => ({
          id: `${batchId}-${i}`,
          targetType: input.targetType,
          targetId: input.targetId,
          userId: input.userId,
          role: input.role,
          weekStart: w,
          plannedHours: input.hoursPerWeek,
          status: input.status ?? 'tentative',
          batchId,
          reason: input.reason,
        }))
        send({ type: 'ASSIGN_ADD', rows })
        return batchId
      },
      setAssignmentStatus: (batchId, status) => send({ type: 'ASSIGN_STATUS', batchId, status }),
      removeAssignment: (batchId) => send({ type: 'ASSIGN_REMOVE', batchId }),
      addUser: (user) => {
        const id = newId('u')
        send({ type: 'USER_ADD', user: { ...user, id } })
        return id
      },
      updateUser: (id, patch) => send({ type: 'USER_UPDATE', id, patch }),
      setCurrentUser: (id) => send({ type: 'SET_CURRENT_USER', id }),
      upsertSkill: (skill) => send({ type: 'SKILL_UPSERT', skill: { ...skill, id: skill.id ?? newId('sk') } }),
      deleteSkill: (id) => send({ type: 'SKILL_DELETE', id }),
      setUserSkill: (userSkill) => send({ type: 'USER_SKILL_SET', userSkill }),
      upsertGrowth: (focus) => send({ type: 'GROWTH_UPSERT', focus: { ...focus, id: focus.id ?? newId('g') } }),
      deleteGrowth: (id) => send({ type: 'GROWTH_DELETE', id }),
      upsertCustomer: (customer) => send({ type: 'CUSTOMER_UPSERT', customer: { ...customer, id: customer.id ?? newId('c') } }),
      addExperience: (e) => send({ type: 'EXPERIENCE_ADD', experience: { ...e, id: newId('e'), createdAt: t() } }),
      confirmExperience: (id, levelUp) => send({ type: 'EXPERIENCE_CONFIRM', id, levelUp }),
      deleteExperience: (id) => send({ type: 'EXPERIENCE_DELETE', id }),
      saveClose: (close) => send({ type: 'CLOSE_SAVE', close }),
      finalizeClose: (projectId) => send({ type: 'CLOSE_FINALIZE', projectId, idPrefix: newId('e') }),
      updateSettings: (patch) => send({ type: 'SETTINGS_UPDATE', patch }),
      addReviewNote: (weekStart, text) => send({ type: 'REVIEW_NOTE_ADD', id: newId('rn'), weekStart, text }),
      resetDemo: async () => {
        await repository.clear()
        const now = getToday()
        dispatch({ type: 'RESET', data: createSeed(now) })
        setToday(now)
      },
    }
    // data.wbs / data.opportunities / data.assignments / settings を参照するアクションのため依存に含める
  }, [send, data.wbs, data.opportunities, data.assignments, data.settings.baseCapacity])

  const me = useMemo(
    () => data.users.find((u) => u.id === data.currentUserId) ?? data.users[0],
    [data.users, data.currentUserId],
  )
  const can = useCallback((action: PermAction, ctx?: PermCtx) => canDo(me, action, ctx), [me])

  const value = useMemo(() => ({ data, today, derived, actions, me, can }), [data, today, derived, actions, me, can])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

