import type { AppData } from '../domain/types'

/** データ構造を変えたら v を上げる（古い保存データは破棄して seed から再開） */
export const STORAGE_KEY = 'project-delivery-os:v2'

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
    o.users.length > 0 &&
    // v2: ユーザーに原価単価が入っていること（古い形式のデータは破棄して seed から再開）
    o.users.every((u) => typeof (u as { hourlyRate?: unknown }).hourlyRate === 'number')
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

let warned = false

export function saveData(data: AppData): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    // 容量超過・サンドボックス化された iframe・プライベートモード等。
    // プロトタイプなので握りつぶし、メモリ上の状態だけで動作を続ける（警告は1回だけ）
    if (!warned) {
      warned = true
      console.warn('[Project Delivery OS] localStorage に保存できません。変更はこのページを閉じるまでの一時的なものになります', e)
    }
  }
}

/** localStorage が実際に読み書きできるか */
export function isStorageAvailable(): boolean {
  try {
    const k = `${STORAGE_KEY}:probe`
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

export function clearData(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
