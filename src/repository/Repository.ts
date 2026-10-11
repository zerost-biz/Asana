import type { AppData } from '../domain/types'

/**
 * データの保存先を抽象化する境界（仕様書 23）。
 * UI や reducer は保存先を直接触らず、必ずこの Repository を経由する。
 *  - ローカル試作 : LocalStorageRepository（ブラウザ内）
 *  - 本番(GAS)    : GasRepository（google.script.run 経由で Sheets を読み書き）に差し替える
 */
export interface Repository {
  /** 保存済みのデータを読む。無ければ null（初回） */
  load(): Promise<AppData | null>
  /** 全体を保存する（本番では差分保存・楽観ロックに置き換える想定） */
  save(data: AppData): Promise<void>
  /** 保存データを消す（デモデータの初期化） */
  clear(): Promise<void>
  /** 他タブ・他ユーザーによる更新の通知を購読する（任意）。戻り値は購読解除 */
  subscribe?(onChange: (data: AppData) => void): () => void
}
