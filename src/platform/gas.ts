/**
 * Google Apps Script（HTML Service）上で動いているときだけ使える `google.script.run` の薄い包み。
 * 通常のブラウザ（npm run dev・単一HTMLを開いた場合）では存在しないので、isGas() が false になる。
 */
interface GasRunner {
  withSuccessHandler: (fn: (v: unknown) => void) => GasRunner
  withFailureHandler: (fn: (e: unknown) => void) => GasRunner
  [fn: string]: unknown
}

function runner(): GasRunner | null {
  const g = (globalThis as unknown as { google?: { script?: { run?: GasRunner } } }).google
  return g?.script?.run ?? null
}

export function isGas(): boolean {
  return runner() !== null
}

/** サーバー側（gas/Code.gs）の関数を呼び、結果を Promise で返す */
export function callGas<T>(fn: string, ...args: unknown[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const r = runner()
    if (!r) return reject(new Error('Google Apps Script 上ではありません'))
    const bound = r.withSuccessHandler((v) => resolve(v as T)).withFailureHandler((e) => reject(e instanceof Error ? e : new Error(String((e as { message?: string })?.message ?? e))))
    const f = bound[fn]
    if (typeof f !== 'function') return reject(new Error(`サーバー関数 ${fn} がありません`))
    ;(f as (...a: unknown[]) => void).apply(bound, args)
  })
}
