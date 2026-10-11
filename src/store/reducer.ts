import type { AppData, Project, Risk, TimeEntry, User, WbsItem } from '../domain/types'
import { indexWbs, descendantsOf, resolveLogWork } from '../domain/calculations'

export interface LogWorkPayload {
  wbsId: string
  userId: string
  date: string
  hours: number
  comment: string
  etcHours: number
  progress: number
}

export type Action =
  | { type: 'LOAD'; data: AppData }
  | { type: 'RESET'; data: AppData }
  | { type: 'WBS_ADD'; item: WbsItem }
  | { type: 'WBS_UPDATE'; id: string; patch: Partial<Omit<WbsItem, 'id' | 'projectId'>> }
  | { type: 'WBS_DELETE'; id: string }
  | { type: 'LOG_WORK'; payload: LogWorkPayload }
  | { type: 'ENTRY_DELETE'; id: string }
  | { type: 'SET_CURRENT_USER'; id: string }
  | { type: 'USER_UPDATE'; id: string; patch: Partial<Omit<User, 'id'>> }
  | { type: 'PROJECT_UPDATE'; id: string; patch: Partial<Omit<Project, 'id'>> }
  | { type: 'RISK_UPDATE'; id: string; patch: Partial<Omit<Risk, 'id'>> }

let seq = 0
export const newId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'LOAD':
    case 'RESET':
      return action.data

    case 'WBS_ADD':
      return { ...state, wbs: [...state.wbs, action.item] }

    case 'WBS_UPDATE':
      return {
        ...state,
        wbs: state.wbs.map((w) => (w.id === action.id ? { ...w, ...action.patch } : w)),
      }

    case 'WBS_DELETE': {
      const idx = indexWbs(state.wbs)
      const gone = new Set([action.id, ...descendantsOf(idx, action.id).map((d) => d.id)])
      return {
        ...state,
        wbs: state.wbs.filter((w) => !gone.has(w.id)),
        timeEntries: state.timeEntries.filter((e) => !gone.has(e.wbsId)),
        risks: state.risks.map((r) => (r.wbsId && gone.has(r.wbsId) ? { ...r, wbsId: undefined } : r)),
      }
    }

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
              { id: newId('te'), wbsId: p.wbsId, userId: p.userId, date: p.date, hours, comment: p.comment.trim() },
            ]
          : state.timeEntries
      return {
        ...state,
        timeEntries: entries,
        wbs: state.wbs.map((w) =>
          w.id === p.wbsId ? { ...w, etcHours: next.etc, progress: next.progress, status: next.status } : w,
        ),
      }
    }

    case 'ENTRY_DELETE':
      return { ...state, timeEntries: state.timeEntries.filter((e) => e.id !== action.id) }

    case 'SET_CURRENT_USER':
      return { ...state, currentUserId: action.id }

    case 'USER_UPDATE':
      return { ...state, users: state.users.map((u) => (u.id === action.id ? { ...u, ...action.patch } : u)) }

    case 'PROJECT_UPDATE':
      return {
        ...state,
        projects: state.projects.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)),
      }

    case 'RISK_UPDATE':
      return { ...state, risks: state.risks.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)) }
  }
}
