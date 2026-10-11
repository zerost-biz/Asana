import { useCallback, useState } from 'react'

/** 表示設定（工数/コスト切替など）を localStorage に覚える小さなフック。使えない環境では記憶しない */
export function usePref<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (v: T) => void] {
  const storageKey = `project-delivery-os:pref:${key}`
  const [value, setValue] = useState<T>(() => {
    try {
      const v = window.localStorage.getItem(storageKey) as T | null
      return v && allowed.includes(v) ? v : initial
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (v: T) => {
      setValue(v)
      try {
        window.localStorage.setItem(storageKey, v)
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  )
  return [value, set]
}
