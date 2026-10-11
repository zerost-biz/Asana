import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeed } from '../data/seed'
import { MONDAY } from '../test/factories'
import { LocalStorageRepository, STORAGE_KEY, isStorageAvailable } from './LocalStorageRepository'

/** window.localStorage の最小の代用品（Node 環境でも保存・復元の挙動を確かめる） */
function stubStorage(opts: { throwOnSet?: boolean } = {}) {
  const store = new Map<string, string>()
  const listeners: ((e: { key: string; newValue: string | null }) => void)[] = []
  const win = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (opts.throwOnSet) throw new Error('QuotaExceededError')
        store.set(k, v)
      },
      removeItem: (k: string) => void store.delete(k),
    },
    addEventListener: (_t: string, fn: (e: { key: string; newValue: string | null }) => void) => listeners.push(fn),
    removeEventListener: (_t: string, fn: (e: { key: string; newValue: string | null }) => void) => listeners.splice(listeners.indexOf(fn), 1),
  }
  vi.stubGlobal('window', win)
  return { store, listeners }
}

describe('LocalStorageRepository（保存・復元・初期化）', () => {
  beforeEach(() => vi.stubGlobal('window', undefined))
  afterEach(() => vi.unstubAllGlobals())

  it('保存したデータを読み戻せる（リロード後の復元）', async () => {
    stubStorage()
    const repo = new LocalStorageRepository()
    expect(await repo.load()).toBeNull() // 初回
    const data = createSeed(MONDAY)
    await repo.save({ ...data, settings: { ...data.settings, mission: '復元テスト' } })
    const loaded = await new LocalStorageRepository().load()
    expect(loaded?.settings.mission).toBe('復元テスト')
    expect(loaded?.projects).toHaveLength(data.projects.length)
  })

  it('Reset（clear）で保存データが消え、次回は null（= seed から再開）', async () => {
    const { store } = stubStorage()
    const repo = new LocalStorageRepository()
    await repo.save(createSeed(MONDAY))
    expect(store.has(STORAGE_KEY)).toBe(true)
    await repo.clear()
    expect(await repo.load()).toBeNull()
  })

  it('壊れたデータ・古い形式のデータは破棄して null を返す', async () => {
    const { store } = stubStorage()
    const repo = new LocalStorageRepository()
    store.set(STORAGE_KEY, '{ broken json')
    expect(await repo.load()).toBeNull()
    store.set(STORAGE_KEY, JSON.stringify({ projects: [], wbs: [] }))
    expect(await repo.load()).toBeNull()
    const old = createSeed(MONDAY) as unknown as Record<string, unknown>
    delete old.opportunities
    store.set(STORAGE_KEY, JSON.stringify(old))
    expect(await repo.load()).toBeNull()
  })

  it('保存できない環境（容量超過・サンドボックス）でも例外にならず、利用可否を判定できる', async () => {
    stubStorage({ throwOnSet: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(new LocalStorageRepository().save(createSeed(MONDAY))).resolves.toBeUndefined()
    expect(isStorageAvailable()).toBe(false)
    warn.mockRestore()
  })

  it('他タブの変更（storage イベント）を購読できる', async () => {
    const { listeners } = stubStorage()
    const repo = new LocalStorageRepository()
    const seen: string[] = []
    const off = repo.subscribe!((d) => seen.push(d.currentUserId))
    const data = createSeed(MONDAY)
    listeners[0]({ key: STORAGE_KEY, newValue: JSON.stringify({ ...data, currentUserId: 'u-s' }) })
    listeners[0]({ key: 'other', newValue: '{}' })
    expect(seen).toEqual(['u-s'])
    off()
    expect(listeners).toHaveLength(0)
  })
})
