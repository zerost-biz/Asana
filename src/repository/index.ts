import { isGas } from '../platform/gas'
import { GasRepository } from './GasRepository'
import { LocalStorageRepository, isStorageAvailable as localStorageAvailable } from './LocalStorageRepository'
import type { Repository } from './Repository'

/**
 * アプリが使う Repository。
 *  - Google Apps Script 上で開いたとき : GasRepository（スプレッドシートに保存）
 *  - それ以外                          : LocalStorageRepository（ブラウザ内に保存）
 */
export const repository: Repository = isGas() ? new GasRepository() : new LocalStorageRepository()

/** 入力内容が保存される環境か（false なら、閉じると消える旨を画面に出す） */
export function isStorageAvailable(): boolean {
  return isGas() || localStorageAvailable()
}

export type { Repository }
export { STORAGE_KEY } from './LocalStorageRepository'
