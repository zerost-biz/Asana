import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeed } from '../data/seed'
import { MONDAY } from '../test/factories'
import { GasRepository } from './GasRepository'
import { isStorageAvailable } from './index'

/** google.script.run の代用品（サーバー側の関数を、メモリ上のスプレッドシートとして動かす） */
function stubGas(opts: { failSave?: boolean } = {}) {
  const server = { stored: null as string | null, calls: [] as string[], inflight: 0, maxInflight: 0 }
  const handlers: Record<string, (...a: unknown[]) => unknown> = {
    loadData: () => server.stored,
    saveData: (json) => {
      if (opts.failSave) throw new Error('サーバーエラー')
      server.stored = json as string
      return true
    },
    clearData: () => {
      server.stored = null
      return true
    },
  }
  const make = (ok?: (v: unknown) => void, ng?: (e: unknown) => void) =>
    new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === 'withSuccessHandler') return (fn: (v: unknown) => void) => make(fn, ng)
        if (prop === 'withFailureHandler') return (fn: (e: unknown) => void) => make(ok, fn)
        return (...args: unknown[]) => {
          server.calls.push(prop)
          server.inflight++
          server.maxInflight = Math.max(server.maxInflight, server.inflight)
          setTimeout(() => {
            server.inflight--
            try {
              ok?.(handlers[prop](...args))
            } catch (e) {
              ng?.(e)
            }
          }, 5)
        }
      },
    })
  vi.stubGlobal('google', { script: { run: make() } })
  return server
}

describe('GasRepository（Googleスプレッドシート保存）', () => {
  beforeEach(() => vi.stubGlobal('window', undefined))
  afterEach(() => vi.unstubAllGlobals())

  it('保存したデータを読み戻せる', async () => {
    stubGas()
    const repo = new GasRepository()
    expect(await repo.load()).toBeNull()
    const seed = createSeed(MONDAY)
    await repo.save(seed)
    expect(await repo.load()).toEqual(seed)
  })

  it('保存中に溜まった変更は最新の1回にまとめ、同時に2件は送らない', async () => {
    const server = stubGas()
    const repo = new GasRepository()
    const a = createSeed(MONDAY)
    const b = { ...a, currentUserId: 'b' }
    const c = { ...a, currentUserId: 'c' }
    await Promise.all([repo.save(a), repo.save(b), repo.save(c)])
    // 1件目は即送信、残り（b, c）は最新の c だけ
    expect(server.calls.filter((x) => x === 'saveData')).toHaveLength(2)
    expect(server.maxInflight).toBe(1)
    expect(JSON.parse(server.stored!).currentUserId).toBe('c')
  })

  it('保存に失敗しても例外にしない（画面は動き続ける）', async () => {
    stubGas({ failSave: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(new GasRepository().save(createSeed(MONDAY))).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('壊れたデータや形の違うデータは読み込まず、初期データから始める', async () => {
    const server = stubGas()
    server.stored = '{"hello":1}'
    expect(await new GasRepository().load()).toBeNull()
    server.stored = 'not json'
    expect(await new GasRepository().load()).toBeNull()
  })

  it('初期化するとデータが消える', async () => {
    const server = stubGas()
    const repo = new GasRepository()
    await repo.save(createSeed(MONDAY))
    await repo.clear()
    expect(server.stored).toBeNull()
  })

  it('Apps Script 上では「保存される環境」として扱う', () => {
    stubGas()
    expect(isStorageAvailable()).toBe(true)
  })
})
