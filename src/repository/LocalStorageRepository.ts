import type { AppData } from '../domain/types'
import type { Repository } from './Repository'

/** データ構造を変えたら v を上げる（古い保存データは破棄して seed から再開） */
export const STORAGE_KEY = 'project-delivery-os:v3'

const isArr = (v: unknown): v is unknown[] => Array.isArray(v)

const COLLECTIONS = [
  'users', 'skills', 'userSkills', 'growthFocus', 'customers', 'opportunities', 'projects', 'wbs',
  'timeEntries', 'internalOrders', 'assignments', 'allocationOverrides', 'capacities', 'risks', 'experiences', 'closes',
  'activity', 'reviewNotes',
] as const

/**
 * 古い形式の保存データを、いまの形に直す（捨てずに引き継ぐ）。
 *  - 社内オーダー導入前のデータには internalOrders が無いので、空で補う
 */
export function migrate(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray((raw as Record<string, unknown>).internalOrders)) {
    return { ...(raw as Record<string, unknown>), internalOrders: [] }
  }
  return raw
}

function isValid(d: unknown): d is AppData {
  if (!d || typeof d !== 'object') return false
  const o = d as Record<string, unknown>
  if (!COLLECTIONS.every((k) => isArr(o[k]))) return false
  if (typeof o.currentUserId !== 'string' || typeof o.settings !== 'object' || o.settings === null) return false
  const users = o.users as unknown[]
  return users.length > 0 && users.every((u) => typeof (u as { hourlyRate?: unknown }).hourlyRate === 'number')
}

let warned = false

export class LocalStorageRepository implements Repository {
  async load(): Promise<AppData | null> {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const parsed = migrate(JSON.parse(raw))
      return isValid(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  async save(data: AppData): Promise<void> {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      // 容量超過・サンドボックス化された iframe・プライベートモード等。
      // プロトタイプなので握りつぶし、メモリ上の状態だけで動作を続ける（警告は1回だけ）
      if (!warned) {
        warned = true
        console.warn('[Project Delivery OS] ブラウザへの保存ができません。変更はこのページを閉じるまでの一時的なものになります', e)
      }
    }
  }

  async clear(): Promise<void> {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  subscribe(onChange: (data: AppData) => void): () => void {
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      try {
        const parsed = migrate(JSON.parse(e.newValue))
        if (isValid(parsed)) onChange(parsed)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
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
