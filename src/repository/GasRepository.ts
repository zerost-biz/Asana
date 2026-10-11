import type { AppData } from '../domain/types'
import { callGas } from '../platform/gas'
import { isValid, migrate } from './LocalStorageRepository'
import type { Repository } from './Repository'

/**
 * Google スプレッドシートに保存する Repository（トライアル用）。
 * データ全体を JSON にして、サーバー側（gas/Code.gs）が「Data」シートに分割して書き込む。
 *  - 保存は 1 件ずつ順番に実行し、待っている間に溜まった変更は最新の 1 回にまとめる（GAS の呼び出しは約 1 秒かかるため）
 *  - 複数人の同時編集には対応しない（後から保存した内容が勝つ）
 */
export class GasRepository implements Repository {
  private pending: AppData | null = null
  private running = false
  private warned = false

  async load(): Promise<AppData | null> {
    try {
      const raw = await callGas<string | null>('loadData')
      if (!raw) return null
      const parsed = migrate(JSON.parse(raw))
      return isValid(parsed) ? parsed : null
    } catch (e) {
      console.warn('[Project Delivery OS] スプレッドシートから読み込めませんでした', e)
      return null
    }
  }

  async save(data: AppData): Promise<void> {
    this.pending = data
    if (this.running) return
    this.running = true
    try {
      while (this.pending) {
        const next = this.pending
        this.pending = null
        try {
          await callGas('saveData', JSON.stringify(next))
        } catch (e) {
          if (!this.warned) {
            this.warned = true
            console.warn('[Project Delivery OS] スプレッドシートへ保存できませんでした', e)
          }
        }
      }
    } finally {
      this.running = false
    }
  }

  async clear(): Promise<void> {
    this.pending = null
    try {
      await callGas('clearData')
    } catch (e) {
      console.warn('[Project Delivery OS] スプレッドシートのデータを消せませんでした', e)
    }
  }
}
