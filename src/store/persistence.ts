import type { AppData } from '../domain/types'

/** データ構造を変えたら v を上げる（古い保存データは破棄して seed から再開） */
export const STORAGE_KEY = 'project-delivery-os:v1'

const isArr = (v: unknown): v is unknown[] => Array.isArray(v)

function isValid(d: unknown): d is AppData {
  if (!d || typeof d !== 'object') return false
  const o = d as Record<string, unknown>
  return (
    isArr(o.users) &&
    isArr(o.projects) &&
    isArr(o.wbs) &&
    isArr(o.timeEntries) &&
    isArr(o.risks) &&
    typeof o.currentUserId === 'string' &&
    o.users.length > 0
  )
}

export function loadData(): AppData | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isValid(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveData(data: AppData): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    // 容量超過・プライベートモード等。プロトタイプなので握りつぶして警告のみ
    console.warn('[Project Delivery OS] localStorage への保存に失敗しました', e)
  }
}

export function clearData(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
