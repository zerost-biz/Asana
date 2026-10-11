import { describeWbsChange } from '../domain/activity'
import { descendantsOf, indexWbs, resolveLogWork } from '../domain/calculations'
import { fmtNum } from '../domain/format'
import { OPP_STAGE_LABEL } from '../domain/types'
import type {
  ActivityLog,
  AppData,
  Assignment,
  Capacity,
  CloseMember,
  Customer,
  EntityType,
  InternalOrder,
  Experience,
  GrowthFocus,
  ISODate,
  ISODateTime,
  Opportunity,
  OppStage,
  Project,
  ProjectClose,
  Risk,
  Settings,
  Skill,
  TimeEntry,
  User,
  UserSkill,
  WbsItem,
} from '../domain/types'

export interface LogWorkPayload {
  wbsId: string
  userId: string
  date: string
  hours: number
  comment: string
  etcHours: number
  progress: number
  /** 作業時間を計上する社内オーダー（省略すると、作業に設定されたオーダー） */
  orderId?: string
}

export interface Meta {
  actorId: string
  now: ISODateTime
  today: ISODate
}

export type Body =
  | { type: 'PROJECT_ADD'; project: Project; items: WbsItem[]; orders?: InternalOrder[] }
  | { type: 'PROJECT_UPDATE'; id: string; patch: Partial<Omit<Project, 'id'>> }
  | { type: 'PROJECT_DELETE'; id: string }
  | { type: 'WBS_ADD'; item: WbsItem }
  | { type: 'WBS_ADD_MANY'; items: WbsItem[] }
  | { type: 'WBS_UPDATE'; id: string; patch: Partial<Omit<WbsItem, 'id' | 'projectId'>> }
  | { type: 'WBS_DELETE'; id: string }
  | { type: 'WBS_DUPLICATE'; id: string; idMap: Record<string, string> }
  | { type: 'WBS_MOVE'; id: string; dir: 'up' | 'down' }
  | { type: 'LOG_WORK'; payload: LogWorkPayload }
  | { type: 'ENTRY_DELETE'; id: string }
  | { type: 'ORDER_ADD'; order: InternalOrder }
  | { type: 'ORDER_UPDATE'; id: string; patch: Partial<Omit<InternalOrder, 'id' | 'projectId'>> }
  | { type: 'ORDER_DELETE'; id: string }
  | { type: 'ORDER_ASSIGN_UNSET'; projectId: string; orderId: string }
  | { type: 'ALLOC_SET'; wbsId: string; weekStart: ISODate; hours: number | null }
  | { type: 'CAPACITY_SET'; capacity: Capacity }
  | { type: 'RISK_ADD'; risk: Risk }
  | { type: 'RISK_UPDATE'; id: string; patch: Partial<Omit<Risk, 'id'>> }
  | { type: 'RISK_DELETE'; id: string }
  | { type: 'COMMENT_ADD'; entityType: EntityType; entityId: string; projectId?: string; text: string; id: string }
  | { type: 'OPP_ADD'; opp: Opportunity }
  | { type: 'OPP_UPDATE'; id: string; patch: Partial<Omit<Opportunity, 'id'>> }
  | { type: 'OPP_MOVE'; id: string; stage: OppStage; lostReason?: string }
  | { type: 'OPP_CONVERT'; oppId: string; project: Project; items: WbsItem[] }
  | { type: 'ASSIGN_ADD'; rows: Assignment[] }
  | { type: 'ASSIGN_STATUS'; batchId: string; status: Assignment['status'] }
  | { type: 'ASSIGN_REMOVE'; batchId: string }
  | { type: 'USER_ADD'; user: User }
  | { type: 'USER_UPDATE'; id: string; patch: Partial<Omit<User, 'id'>> }
  | { type: 'SET_CURRENT_USER'; id: string }
  | { type: 'SKILL_UPSERT'; skill: Skill }
  | { type: 'SKILL_DELETE'; id: string }
  | { type: 'USER_SKILL_SET'; userSkill: UserSkill }
  | { type: 'GROWTH_UPSERT'; focus: GrowthFocus }
  | { type: 'GROWTH_DELETE'; id: string }
  | { type: 'CUSTOMER_UPSERT'; customer: Customer }
  | { type: 'EXPERIENCE_ADD'; experience: Experience }
  | { type: 'EXPERIENCE_CONFIRM'; id: string; levelUp: string[] }
  | { type: 'EXPERIENCE_DELETE'; id: string }
  | { type: 'CLOSE_SAVE'; close: ProjectClose }
  | { type: 'CLOSE_FINALIZE'; projectId: string; idPrefix: string }
  | { type: 'SETTINGS_UPDATE'; patch: Partial<Settings> }
  | { type: 'REVIEW_NOTE_ADD'; id: string; weekStart: ISODate; text: string }

export type Action = (Body & { meta: Meta }) | { type: 'LOAD'; data: AppData } | { type: 'RESET'; data: AppData }

let seq = 0
export const newId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`

/** 更新履歴の上限（localStorage の肥大化を避ける） */
const LOG_LIMIT = 500

function addLog(
  state: AppData,
  meta: Meta,
  e: { entityType: EntityType; entityId: string; projectId?: string; action: string; summary: string; before?: Record<string, unknown>; after?: Record<string, unknown> },
): AppData {
  const entry: ActivityLog = { id: newId('log'), userId: meta.actorId, timestamp: meta.now, ...e }
  return { ...state, activity: [...state.activity, entry].slice(-LOG_LIMIT) }
}


/** プロジェクトの使用中オーダーがちょうど1つなら、それを返す */
function soleActiveOrder(state: AppData, projectId: string): InternalOrder | undefined {
  const list = state.internalOrders.filter((o) => o.projectId === projectId && o.status === 'active')
  return list.length === 1 ? list[0] : undefined
}

/** 作業時間に記録するオーダー。指定が無ければ（そのプロジェクトのオーダーが1つだけなら）それを使う。他プロジェクトのオーダーは無効 */
function orderOf(state: AppData, projectId: string, ...wanted: (string | undefined)[]): string | undefined {
  for (const id of wanted) {
    if (id && state.internalOrders.some((o) => o.id === id && o.projectId === projectId)) return id
  }
  return soleActiveOrder(state, projectId)?.id
}

const orderCodeOf = (state: AppData) => (id: string | null | undefined) => state.internalOrders.find((o) => o.id === id)?.code ?? ''

const wbsTitle = (state: AppData) => (id: string | undefined) => state.wbs.find((w) => w.id === id)?.title ?? '（なし）'

/** 状態・残りの更新日を維持しつつ、WBS の項目を更新する */
function applyWbsPatch(item: WbsItem, patch: Partial<WbsItem>, today: ISODate): WbsItem {
  const next = { ...item, ...patch }
  if (patch.status !== undefined && patch.status !== item.status) next.statusChangedAt = today
  if (patch.etcHours !== undefined && patch.etcHours !== item.etcHours) next.etcUpdatedAt = today
  return next
}

export function reducer(state: AppData, action: Action): AppData {
  if (action.type === 'LOAD' || action.type === 'RESET') return action.data
  const { meta } = action
  const nameOf = (id: string) => state.users.find((u) => u.id === id)?.name ?? id

  switch (action.type) {
    /* ---------------- プロジェクト ---------------- */
    case 'PROJECT_ADD': {
      const orders = action.orders ?? []
      const s = { ...state, projects: [...state.projects, action.project], wbs: [...state.wbs, ...action.items], internalOrders: [...state.internalOrders, ...orders] }
      const note = orders.length > 0 ? `（社内オーダー ${orders.map((o) => o.code).join('・')}）` : ''
      return addLog(s, meta, { entityType: 'project', entityId: action.project.id, projectId: action.project.id, action: 'create', summary: `プロジェクト「${action.project.name}」を追加${note}` })
    }
    case 'PROJECT_UPDATE': {
      const before = state.projects.find((p) => p.id === action.id)
      if (!before) return state
      const after = { ...before, ...action.patch }
      const s = { ...state, projects: state.projects.map((p) => (p.id === action.id ? after : p)) }
      const changed = Object.keys(action.patch).filter((k) => (before as unknown as Record<string, unknown>)[k] !== (action.patch as Record<string, unknown>)[k])
      if (changed.length === 0) return s
      return addLog(s, meta, { entityType: 'project', entityId: action.id, projectId: action.id, action: 'update', summary: `プロジェクト「${after.name}」の設定を更新（${changed.length}項目）` })
    }
    case 'PROJECT_DELETE': {
      const p = state.projects.find((x) => x.id === action.id)
      const gone = new Set(state.wbs.filter((w) => w.projectId === action.id).map((w) => w.id))
      const s: AppData = {
        ...state,
        projects: state.projects.filter((x) => x.id !== action.id),
        wbs: state.wbs.filter((w) => w.projectId !== action.id),
        timeEntries: state.timeEntries.filter((e) => !gone.has(e.wbsId)),
        internalOrders: state.internalOrders.filter((o) => o.projectId !== action.id),
        risks: state.risks.filter((r) => r.projectId !== action.id),
        assignments: state.assignments.filter((a) => !(a.targetType === 'project' && a.targetId === action.id)),
        allocationOverrides: state.allocationOverrides.filter((o) => !gone.has(o.wbsId)),
        experiences: state.experiences.filter((e) => e.projectId !== action.id),
        closes: state.closes.filter((c) => c.projectId !== action.id),
        activity: state.activity.filter((l) => l.projectId !== action.id),
      }
      return addLog(s, meta, { entityType: 'project', entityId: action.id, action: 'delete', summary: `プロジェクト「${p?.name ?? action.id}」を削除` })
    }

    /* ---------------- 作業項目 (WBS) ---------------- */
    case 'WBS_ADD': {
      const s = { ...state, wbs: [...state.wbs, action.item] }
      return addLog(s, meta, { entityType: 'wbs', entityId: action.item.id, projectId: action.item.projectId, action: 'create', summary: `作業項目「${action.item.title}」を追加` })
    }
    case 'WBS_ADD_MANY': {
      if (action.items.length === 0) return state
      // 使用中のオーダーがちょうど1つのプロジェクトなら、追加するタスクをそのオーダーに計上する
      const only = soleActiveOrder(state, action.items[0].projectId)
      const items = only ? action.items.map((i) => (i.type === 'task' && !i.orderId ? { ...i, orderId: only.id } : i)) : action.items
      const s = { ...state, wbs: [...state.wbs, ...items] }
      return addLog(s, meta, { entityType: 'wbs', entityId: action.items[0].id, projectId: action.items[0].projectId, action: 'create', summary: `テンプレートから作業項目を${action.items.length}件追加` })
    }
    case 'WBS_UPDATE': {
      const before = state.wbs.find((w) => w.id === action.id)
      if (!before) return state
      const after = applyWbsPatch(before, action.patch, meta.today)
      const s = { ...state, wbs: state.wbs.map((w) => (w.id === action.id ? after : w)) }
      const d = describeWbsChange(before, after, state.users, wbsTitle(state), orderCodeOf(state))
      if (!d) return s
      return addLog(s, meta, { entityType: 'wbs', entityId: action.id, projectId: before.projectId, action: 'update', ...d })
    }
    case 'WBS_DELETE': {
      const item = state.wbs.find((w) => w.id === action.id)
      if (!item) return state
      const idx = indexWbs(state.wbs)
      const gone = new Set([action.id, ...descendantsOf(idx, action.id).map((d) => d.id)])
      const s: AppData = {
        ...state,
        wbs: state.wbs
          .filter((w) => !gone.has(w.id))
          .map((w) => (w.predecessorId && gone.has(w.predecessorId) ? { ...w, predecessorId: undefined } : w)),
        timeEntries: state.timeEntries.filter((e) => !gone.has(e.wbsId)),
        risks: state.risks.map((r) => (r.wbsId && gone.has(r.wbsId) ? { ...r, wbsId: undefined } : r)),
        allocationOverrides: state.allocationOverrides.filter((o) => !gone.has(o.wbsId)),
      }
      return addLog(s, meta, { entityType: 'wbs', entityId: action.id, projectId: item.projectId, action: 'delete', summary: `作業項目「${item.title}」${gone.size > 1 ? `と配下${gone.size - 1}件` : ''}を削除` })
    }
    case 'WBS_DUPLICATE': {
      const src = state.wbs.find((w) => w.id === action.id)
      if (!src) return state
      const idx = indexWbs(state.wbs)
      const tree = [src, ...descendantsOf(idx, action.id)]
      const clones: WbsItem[] = tree.map((w) => ({
        ...w,
        id: action.idMap[w.id],
        parentId: w.id === src.id ? w.parentId : action.idMap[w.parentId ?? ''] ?? w.parentId,
        title: w.id === src.id ? `${w.title}（コピー）` : w.title,
        progress: 0,
        status: 'not_started',
        // 先行がコピー範囲内ならコピー先を、範囲外なら元の先行を引き継ぐ
        predecessorId: w.predecessorId ? action.idMap[w.predecessorId] ?? w.predecessorId : undefined,
        baselinePlanHours: w.planHours,
        baselineStart: w.startDate,
        baselineEnd: w.endDate,
        etcHours: w.planHours,
        statusChangedAt: meta.today,
        etcUpdatedAt: meta.today,
      }))
      // 元の作業項目（と配下）のすぐ後ろへ挿入する
      const lastId = tree[tree.length - 1].id
      const at = state.wbs.findIndex((w) => w.id === lastId)
      const wbs = [...state.wbs.slice(0, at + 1), ...clones, ...state.wbs.slice(at + 1)]
      return addLog({ ...state, wbs }, meta, { entityType: 'wbs', entityId: action.idMap[src.id], projectId: src.projectId, action: 'create', summary: `作業項目「${src.title}」を複製` })
    }
    case 'WBS_MOVE': {
      const item = state.wbs.find((w) => w.id === action.id)
      if (!item) return state
      const sibs = state.wbs.filter((w) => w.projectId === item.projectId && (w.parentId ?? null) === (item.parentId ?? null))
      const i = sibs.findIndex((w) => w.id === action.id)
      const j = action.dir === 'up' ? i - 1 : i + 1
      if (j < 0 || j >= sibs.length) return state
      const a = state.wbs.findIndex((w) => w.id === sibs[i].id)
      const b = state.wbs.findIndex((w) => w.id === sibs[j].id)
      const wbs = [...state.wbs]
      ;[wbs[a], wbs[b]] = [wbs[b], wbs[a]]
      return { ...state, wbs }
    }

    /* ---------------- 作業時間の記録 ---------------- */
    case 'LOG_WORK': {
      const p = action.payload
      const item = state.wbs.find((w) => w.id === p.wbsId)
      if (!item) return state
      const hours = Math.min(24, Math.max(0, p.hours))
      const next = resolveLogWork(item, { hours, etc: p.etcHours, progress: p.progress })
      const entries: TimeEntry[] =
        hours > 0 || p.comment.trim() !== ''
          ? [
              ...state.timeEntries,
              { id: newId('te'), userId: p.userId, projectId: item.projectId, wbsId: p.wbsId, date: p.date, hours, comment: p.comment.trim(), orderId: orderOf(state, item.projectId, p.orderId, item.orderId) },
            ]
          : state.timeEntries
      const after = applyWbsPatch(item, { etcHours: next.etc, progress: next.progress, status: next.status }, meta.today)
      // 入力した日を「残りの更新日」にする（値が同じでも確認したことを残す）
      after.etcUpdatedAt = meta.today
      const s = { ...state, timeEntries: entries, wbs: state.wbs.map((w) => (w.id === p.wbsId ? after : w)) }
      const code = state.internalOrders.find((o) => o.id === orderOf(state, item.projectId, p.orderId, item.orderId))?.code
      const parts = [`${nameOf(p.userId)}が${item.title}に${fmtNum(hours)}hを記録${code ? `（オーダー ${code}）` : ''}`]
      if (item.etcHours !== next.etc) parts.push(`残り ${fmtNum(item.etcHours)}h→${fmtNum(next.etc)}h`)
      if (item.progress !== next.progress) parts.push(`進捗 ${item.progress}%→${next.progress}%`)
      return addLog(s, meta, { entityType: 'time_entry', entityId: p.wbsId, projectId: item.projectId, action: 'create', summary: parts.join(' / ') })
    }
    case 'ENTRY_DELETE': {
      const e = state.timeEntries.find((x) => x.id === action.id)
      if (!e) return state
      const s = { ...state, timeEntries: state.timeEntries.filter((x) => x.id !== action.id) }
      const title = state.wbs.find((w) => w.id === e.wbsId)?.title ?? ''
      return addLog(s, meta, { entityType: 'time_entry', entityId: e.wbsId, projectId: e.projectId, action: 'delete', summary: `${title}の作業時間 ${fmtNum(e.hours)}h の記録を取り消し` })
    }

    /* ---------------- 社内オーダー ---------------- */
    case 'ORDER_ADD': {
      const o = action.order
      const s = { ...state, internalOrders: [...state.internalOrders, o] }
      return addLog(s, meta, { entityType: 'order', entityId: o.id, projectId: o.projectId, action: 'create', summary: `社内オーダー「${o.code} ${o.name}」を追加` })
    }
    case 'ORDER_UPDATE': {
      const before = state.internalOrders.find((o) => o.id === action.id)
      if (!before) return state
      const after = { ...before, ...action.patch }
      const s = { ...state, internalOrders: state.internalOrders.map((o) => (o.id === action.id ? after : o)) }
      const verb = action.patch.status && action.patch.status !== before.status ? (action.patch.status === 'closed' ? '終了' : '再開') : '更新'
      return addLog(s, meta, { entityType: 'order', entityId: action.id, projectId: before.projectId, action: 'update', summary: `社内オーダー「${after.code} ${after.name}」を${verb}` })
    }
    case 'ORDER_DELETE': {
      const o = state.internalOrders.find((x) => x.id === action.id)
      if (!o) return state
      // 参照している作業・作業時間は「オーダー未設定」に戻す
      const s: AppData = {
        ...state,
        internalOrders: state.internalOrders.filter((x) => x.id !== action.id),
        wbs: state.wbs.map((w) => (w.orderId === action.id ? { ...w, orderId: undefined } : w)),
        timeEntries: state.timeEntries.map((e) => (e.orderId === action.id ? { ...e, orderId: undefined } : e)),
      }
      return addLog(s, meta, { entityType: 'order', entityId: action.id, projectId: o.projectId, action: 'delete', summary: `社内オーダー「${o.code} ${o.name}」を削除` })
    }
    case 'ORDER_ASSIGN_UNSET': {
      const o = state.internalOrders.find((x) => x.id === action.orderId && x.projectId === action.projectId)
      if (!o) return state
      let entries = 0
      let tasks = 0
      const s: AppData = {
        ...state,
        timeEntries: state.timeEntries.map((e) => (e.projectId === action.projectId && !e.orderId ? (entries++, { ...e, orderId: o.id }) : e)),
        wbs: state.wbs.map((w) => (w.projectId === action.projectId && !w.orderId && w.type !== 'milestone' && !state.wbs.some((c) => c.parentId === w.id) ? (tasks++, { ...w, orderId: o.id }) : w)),
      }
      if (entries === 0 && tasks === 0) return state
      return addLog(s, meta, { entityType: 'order', entityId: o.id, projectId: o.projectId, action: 'update', summary: `オーダー未設定の作業時間${entries}件・作業${tasks}件を「${o.code}」に割り当て` })
    }

    /* ---------------- 稼働・週別配分 ---------------- */
    case 'ALLOC_SET': {
      const rest = state.allocationOverrides.filter((o) => !(o.wbsId === action.wbsId && o.weekStart === action.weekStart))
      const allocationOverrides = action.hours === null ? rest : [...rest, { wbsId: action.wbsId, weekStart: action.weekStart, hours: Math.max(0, action.hours) }]
      const item = state.wbs.find((w) => w.id === action.wbsId)
      return addLog({ ...state, allocationOverrides }, meta, {
        entityType: 'wbs', entityId: action.wbsId, projectId: item?.projectId, action: 'update',
        summary: `${item?.title ?? ''}の週別配分（${action.weekStart.slice(5).replace('-', '/')}の週）を${action.hours === null ? '自動配分に戻した' : `${fmtNum(action.hours)}hに手修正`}`,
      })
    }
    case 'CAPACITY_SET': {
      const c = action.capacity
      const rest = state.capacities.filter((x) => !(x.userId === c.userId && x.weekStart === c.weekStart))
      const keep = c.unavailableHours > 0 || c.baseHours !== undefined
      const s = { ...state, capacities: keep ? [...rest, c] : rest }
      return addLog(s, meta, { entityType: 'capacity', entityId: `${c.userId}:${c.weekStart}`, action: 'update', summary: `${nameOf(c.userId)}の${c.weekStart.slice(5).replace('-', '/')}の週: 稼働できない時間を${fmtNum(c.unavailableHours)}hに設定${c.note ? `（${c.note}）` : ''}` })
    }

    /* ---------------- リスク・コメント ---------------- */
    case 'RISK_ADD': {
      const s = { ...state, risks: [...state.risks, action.risk] }
      return addLog(s, meta, { entityType: 'risk', entityId: action.risk.id, projectId: action.risk.projectId, action: 'create', summary: `${action.risk.kind === 'issue' ? '課題' : 'リスク'}を追加: ${action.risk.title}` })
    }
    case 'RISK_UPDATE': {
      const r = state.risks.find((x) => x.id === action.id)
      if (!r) return state
      const s = { ...state, risks: state.risks.map((x) => (x.id === action.id ? { ...x, ...action.patch } : x)) }
      return addLog(s, meta, { entityType: 'risk', entityId: action.id, projectId: r.projectId, action: 'update', summary: `リスク「${r.title}」を更新${action.patch.status ? `（${action.patch.status === 'closed' ? '解決済み' : action.patch.status === 'mitigating' ? '対応中' : '未対応'}）` : ''}` })
    }
    case 'RISK_DELETE': {
      const r = state.risks.find((x) => x.id === action.id)
      if (!r) return state
      return addLog({ ...state, risks: state.risks.filter((x) => x.id !== action.id) }, meta, { entityType: 'risk', entityId: action.id, projectId: r.projectId, action: 'delete', summary: `リスク「${r.title}」を削除` })
    }
    case 'COMMENT_ADD':
      return addLog(state, meta, { entityType: action.entityType, entityId: action.entityId, projectId: action.projectId, action: 'comment', summary: action.text })

    /* ---------------- 受注見込み ---------------- */
    case 'OPP_ADD': {
      const s = { ...state, opportunities: [...state.opportunities, action.opp] }
      return addLog(s, meta, { entityType: 'opportunity', entityId: action.opp.id, action: 'create', summary: `案件「${action.opp.title}」を追加` })
    }
    case 'OPP_UPDATE': {
      const o = state.opportunities.find((x) => x.id === action.id)
      if (!o) return state
      const s = { ...state, opportunities: state.opportunities.map((x) => (x.id === action.id ? { ...x, ...action.patch } : x)) }
      const keys = Object.keys(action.patch)
      // 評価・メモだけの小さな更新は履歴を増やさない
      if (keys.every((k) => k === 'scores' || k === 'evalComment')) return s
      return addLog(s, meta, { entityType: 'opportunity', entityId: action.id, action: 'update', summary: `案件「${o.title}」を更新` })
    }
    case 'OPP_MOVE': {
      const o = state.opportunities.find((x) => x.id === action.id)
      if (!o || o.stage === action.stage) return state
      const s = {
        ...state,
        opportunities: state.opportunities.map((x) =>
          x.id === action.id ? { ...x, stage: action.stage, lostReason: action.lostReason ?? x.lostReason } : x,
        ),
      }
      return addLog(s, meta, { entityType: 'opportunity', entityId: action.id, action: 'move', summary: `${o.title} を「${OPP_STAGE_LABEL[o.stage]}」→「${OPP_STAGE_LABEL[action.stage]}」へ移動` })
    }
    case 'OPP_CONVERT': {
      const o = state.opportunities.find((x) => x.id === action.oppId)
      if (!o) return state
      const s: AppData = {
        ...state,
        projects: [...state.projects, action.project],
        wbs: [...state.wbs, ...action.items],
        opportunities: state.opportunities.map((x) =>
          x.id === action.oppId ? { ...x, stage: 'converted', probability: 100, convertedProjectId: action.project.id, convertedAt: meta.today } : x,
        ),
        // 案件に付けた仮配置は、そのままプロジェクトの配置へ引き継ぐ
        assignments: state.assignments.map((a) =>
          a.targetType === 'opportunity' && a.targetId === action.oppId ? { ...a, targetType: 'project', targetId: action.project.id } : a,
        ),
      }
      return addLog(s, meta, { entityType: 'opportunity', entityId: action.oppId, projectId: action.project.id, action: 'convert', summary: `${o.title} をプロジェクト化` })
    }

    /* ---------------- 配置 ---------------- */
    case 'ASSIGN_ADD': {
      if (action.rows.length === 0) return state
      const r = action.rows[0]
      const s = { ...state, assignments: [...state.assignments, ...action.rows] }
      const hours = action.rows.reduce((t, x) => t + x.plannedHours, 0)
      return addLog(s, meta, { entityType: 'assignment', entityId: r.batchId, projectId: r.targetType === 'project' ? r.targetId : undefined, action: 'create', summary: `${nameOf(r.userId)}を「${r.role}」に仮アサイン（計${fmtNum(hours)}h）` })
    }
    case 'ASSIGN_STATUS': {
      const rows = state.assignments.filter((a) => a.batchId === action.batchId)
      if (rows.length === 0) return state
      const s = { ...state, assignments: state.assignments.map((a) => (a.batchId === action.batchId ? { ...a, status: action.status } : a)) }
      return addLog(s, meta, { entityType: 'assignment', entityId: action.batchId, action: 'update', summary: `${nameOf(rows[0].userId)}の「${rows[0].role}」配置を${action.status === 'confirmed' ? '確定' : '仮に戻した'}` })
    }
    case 'ASSIGN_REMOVE': {
      const rows = state.assignments.filter((a) => a.batchId === action.batchId)
      if (rows.length === 0) return state
      const s = { ...state, assignments: state.assignments.filter((a) => a.batchId !== action.batchId) }
      return addLog(s, meta, { entityType: 'assignment', entityId: action.batchId, action: 'delete', summary: `${nameOf(rows[0].userId)}の「${rows[0].role}」配置を取り消し` })
    }

    /* ---------------- メンバー・スキル・経験 ---------------- */
    case 'USER_ADD':
      return addLog({ ...state, users: [...state.users, action.user] }, meta, { entityType: 'user', entityId: action.user.id, action: 'create', summary: `メンバー「${action.user.name}」を追加` })
    case 'USER_UPDATE': {
      const s = { ...state, users: state.users.map((u) => (u.id === action.id ? { ...u, ...action.patch } : u)) }
      const keys = Object.keys(action.patch)
      if (keys.every((k) => k === 'weeklyCapacity' || k === 'hourlyRate')) return s
      return addLog(s, meta, { entityType: 'user', entityId: action.id, action: 'update', summary: `メンバー「${nameOf(action.id)}」の情報を更新` })
    }
    case 'SET_CURRENT_USER':
      return { ...state, currentUserId: action.id }
    case 'SKILL_UPSERT': {
      const exists = state.skills.some((s) => s.id === action.skill.id)
      const skills = exists ? state.skills.map((s) => (s.id === action.skill.id ? action.skill : s)) : [...state.skills, action.skill]
      return addLog({ ...state, skills }, meta, { entityType: 'setting', entityId: action.skill.id, action: exists ? 'update' : 'create', summary: `スキル「${action.skill.name}」を${exists ? '更新' : '追加'}` })
    }
    case 'SKILL_DELETE': {
      const sk = state.skills.find((s) => s.id === action.id)
      const s: AppData = {
        ...state,
        skills: state.skills.filter((x) => x.id !== action.id),
        userSkills: state.userSkills.filter((u) => u.skillId !== action.id),
        opportunities: state.opportunities.map((o) => ({
          ...o,
          skills: o.skills.filter((x) => x.skillId !== action.id),
          demands: o.demands.map((d) => ({ ...d, skillIds: d.skillIds.filter((x) => x !== action.id) })),
        })),
      }
      return addLog(s, meta, { entityType: 'setting', entityId: action.id, action: 'delete', summary: `スキル「${sk?.name ?? action.id}」を削除` })
    }
    case 'USER_SKILL_SET': {
      const u = action.userSkill
      const prev = state.userSkills.find((x) => x.userId === u.userId && x.skillId === u.skillId)
      const rest = state.userSkills.filter((x) => !(x.userId === u.userId && x.skillId === u.skillId))
      const skillName = state.skills.find((s) => s.id === u.skillId)?.name ?? u.skillId
      const s = { ...state, userSkills: u.level > 0 ? [...rest, u] : rest }
      if (prev && prev.level === u.level && prev.evidence === u.evidence && prev.confirmedBy === u.confirmedBy) return s
      return addLog(s, meta, { entityType: 'user_skill', entityId: `${u.userId}:${u.skillId}`, action: 'update', summary: `${nameOf(u.userId)}の「${skillName}」レベル ${prev?.level ?? 0} → ${u.level}`, before: { level: prev?.level ?? 0 }, after: { level: u.level } })
    }
    case 'GROWTH_UPSERT': {
      const exists = state.growthFocus.some((g) => g.id === action.focus.id)
      const growthFocus = exists ? state.growthFocus.map((g) => (g.id === action.focus.id ? action.focus : g)) : [...state.growthFocus, action.focus]
      return { ...state, growthFocus }
    }
    case 'GROWTH_DELETE':
      return { ...state, growthFocus: state.growthFocus.filter((g) => g.id !== action.id) }
    case 'CUSTOMER_UPSERT': {
      const exists = state.customers.some((c) => c.id === action.customer.id)
      const customers = exists ? state.customers.map((c) => (c.id === action.customer.id ? action.customer : c)) : [...state.customers, action.customer]
      return { ...state, customers }
    }
    case 'EXPERIENCE_ADD':
      return addLog({ ...state, experiences: [...state.experiences, action.experience] }, meta, { entityType: 'experience', entityId: action.experience.id, projectId: action.experience.projectId, action: 'create', summary: `${nameOf(action.experience.userId)}の経験を追加` })
    case 'EXPERIENCE_DELETE':
      return { ...state, experiences: state.experiences.filter((e) => e.id !== action.id) }
    case 'EXPERIENCE_CONFIRM': {
      const e = state.experiences.find((x) => x.id === action.id)
      if (!e) return state
      const prj = state.projects.find((p) => p.id === e.projectId)
      let userSkills = [...state.userSkills]
      for (const sid of e.skillIds) {
        const cur = userSkills.find((u) => u.userId === e.userId && u.skillId === sid)
        const up = action.levelUp.includes(sid)
        const note = `${prj?.name ?? 'プロジェクト'}で経験（${e.role}）`
        const row: UserSkill = {
          userId: e.userId, skillId: sid,
          level: Math.min(5, (cur?.level ?? 0) + (up ? 1 : cur ? 0 : 1)),
          evidence: cur?.evidence ? `${cur.evidence} / ${note}` : note,
          updatedAt: meta.today,
          confirmedBy: meta.actorId,
        }
        userSkills = [...userSkills.filter((u) => !(u.userId === e.userId && u.skillId === sid)), row]
      }
      let s: AppData = { ...state, userSkills, experiences: state.experiences.map((x) => (x.id === action.id ? { ...x, status: 'confirmed' as const } : x)) }
      // スキルのレベルが変わったものは、スキルの変更履歴にも残す
      for (const sid of e.skillIds) {
        const was = state.userSkills.find((u) => u.userId === e.userId && u.skillId === sid)?.level ?? 0
        const now = userSkills.find((u) => u.userId === e.userId && u.skillId === sid)?.level ?? 0
        if (was === now) continue
        const skillName = state.skills.find((k) => k.id === sid)?.name ?? sid
        s = addLog(s, meta, { entityType: 'user_skill', entityId: `${e.userId}:${sid}`, action: 'update', summary: `${nameOf(e.userId)}の「${skillName}」レベル ${was} → ${now}（経験の確定）`, before: { level: was }, after: { level: now } })
      }
      return addLog(s, meta, { entityType: 'experience', entityId: action.id, projectId: e.projectId, action: 'update', summary: `${nameOf(e.userId)}の経験「${prj?.name ?? ''}（${e.role}）」を確定${action.levelUp.length > 0 ? `（スキル${action.levelUp.length}件のレベルを更新）` : ''}` })
    }

    /* ---------------- プロジェクト完了 ---------------- */
    case 'CLOSE_SAVE': {
      const rest = state.closes.filter((c) => c.projectId !== action.close.projectId)
      return { ...state, closes: [...rest, action.close] }
    }
    case 'CLOSE_FINALIZE': {
      const close = state.closes.find((c) => c.projectId === action.projectId)
      const prj = state.projects.find((p) => p.id === action.projectId)
      if (!close || !prj) return state
      const members: CloseMember[] = close.members
      const experiences = [...state.experiences]
      members.forEach((m, i) => {
        if (experiences.some((e) => e.userId === m.userId && e.projectId === prj.id)) return
        experiences.push({
          id: `${action.idPrefix}-${i}`, userId: m.userId, projectId: prj.id, role: m.role, summary: m.summary,
          skillIds: m.skillIds, status: 'candidate', startDate: prj.startDate, endDate: meta.today, createdAt: meta.today,
        })
      })
      const s: AppData = {
        ...state,
        closes: state.closes.map((c) => (c.projectId === prj.id ? { ...c, status: 'closed', closedAt: meta.today } : c)),
        projects: state.projects.map((p) => (p.id === prj.id ? { ...p, status: 'completed' } : p)),
        experiences,
      }
      return addLog(s, meta, { entityType: 'close', entityId: prj.id, projectId: prj.id, action: 'close', summary: `プロジェクト「${prj.name}」を完了し、経験の候補を${members.length}件作成` })
    }

    /* ---------------- 設定・レビュー ---------------- */
    case 'SETTINGS_UPDATE': {
      const s = { ...state, settings: { ...state.settings, ...action.patch } }
      const keys = Object.keys(action.patch)
      if (keys.length === 1 && keys[0] === 'mission') return addLog(s, meta, { entityType: 'setting', entityId: 'mission', action: 'update', summary: '今週の重点テーマを更新' })
      return addLog(s, meta, { entityType: 'setting', entityId: keys.join(','), action: 'update', summary: `設定を更新（${keys.join('・')}）` })
    }
    case 'REVIEW_NOTE_ADD':
      return { ...state, reviewNotes: [...state.reviewNotes, { id: action.id, weekStart: action.weekStart, text: action.text, authorId: meta.actorId, createdAt: meta.now }] }
  }
}
