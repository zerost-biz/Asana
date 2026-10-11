import { LocalStorageRepository } from './LocalStorageRepository'
import type { Repository } from './Repository'

/** アプリが使う Repository。本番では GasRepository に差し替える */
export const repository: Repository = new LocalStorageRepository()

export type { Repository }
export { isStorageAvailable, STORAGE_KEY } from './LocalStorageRepository'
