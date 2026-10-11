import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react'
import { createSeed } from '../data/seed'
import { getToday, toISO } from '../domain/dates'
import type { AppData, Project, Risk, User, WbsItem } from '../domain/types'
import { buildDerived, type Derived } from './derived'
import { clearData, loadData, saveData, STORAGE_KEY } from './persistence'
import { newId, reducer, type LogWorkPayload } from './reducer'

export interface AppActions {
  addWbs: (item: Omit<WbsItem, 'id'>) => string
  updateWbs: (id: string, patch: Partial<Omit<WbsItem, 'id' | 'projectId'>>) => void
  deleteWbs: (id: string) => void
  /** TimeEntry を追加し、WBS の ETC / 進捗 / 状態を更新する */
  logWork: (payload: LogWorkPayload) => void
  deleteEntry: (id: string) => void
  setCurrentUser: (id: string) => void
  updateUser: (id: string, patch: Partial<Omit<User, 'id'>>) => void
  updateProject: (id: string, patch: Partial<Omit<Project, 'id'>>) => void
  updateRisk: (id: string, patch: Partial<Omit<Risk, 'id'>>) => void
  /** デモデータを初期化（localStorage も seed に戻す） */
  resetDemo: () => void
}

interface AppContextValue {
  data: AppData
  today: Date
  derived: Derived
  actions: AppActions
}

const AppContext = createContext<AppContextValue | null>(null)

function init(): AppData {
  return loadData() ?? createSeed(getToday())
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, init)
  const [today, setToday] = useState<Date>(() => getToday())

  // 変更のたびに localStorage へ保存
  useEffect(() => {
    saveData(data)
  }, [data])

  // 別タブでの変更を反映
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      const next = loadData()
      if (next) dispatch({ type: 'LOAD', data: next })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // 日付をまたいだら「今日」を更新
  useEffect(() => {
    const t = window.setInterval(() => {
      const n = getToday()
      setToday((prev) => (toISO(prev) === toISO(n) ? prev : n))
    }, 60_000)
    return () => window.clearInterval(t)
  }, [])

  const derived = useMemo(() => buildDerived(data, today), [data, today])

  const addWbs = useCallback((item: Omit<WbsItem, 'id'>) => {
    const id = newId('w')
    dispatch({ type: 'WBS_ADD', item: { ...item, id } })
    return id
  }, [])

  const actions = useMemo<AppActions>(
    () => ({
      addWbs,
      updateWbs: (id, patch) => dispatch({ type: 'WBS_UPDATE', id, patch }),
      deleteWbs: (id) => dispatch({ type: 'WBS_DELETE', id }),
      logWork: (payload) => dispatch({ type: 'LOG_WORK', payload }),
      deleteEntry: (id) => dispatch({ type: 'ENTRY_DELETE', id }),
      setCurrentUser: (id) => dispatch({ type: 'SET_CURRENT_USER', id }),
      updateUser: (id, patch) => dispatch({ type: 'USER_UPDATE', id, patch }),
      updateProject: (id, patch) => dispatch({ type: 'PROJECT_UPDATE', id, patch }),
      updateRisk: (id, patch) => dispatch({ type: 'RISK_UPDATE', id, patch }),
      resetDemo: () => {
        clearData()
        dispatch({ type: 'RESET', data: createSeed(getToday()) })
        setToday(getToday())
      },
    }),
    [addWbs],
  )

  const value = useMemo(() => ({ data, today, derived, actions }), [data, today, derived, actions])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
