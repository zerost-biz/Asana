/**
 * ファイルの保存・コピー（ブラウザ依存の処理をここに集める）。
 *  - Artifact（プレビュー）では、ページからの直接ダウンロードが許されないため、`downloads` 機能で保存する
 *  - Google Apps Script 上では、ダウンロードが使えないので、Googleドライブにファイルを作る
 *  - 通常のブラウザ（npm run dev・単一HTMLを開いた場合）は、ふつうのダウンロードを使う
 */
import { callGas, isGas } from './gas'

interface DownloadsApi {
  save: (req: { filename: string; data: string }) => Promise<{ status: string }>
}
interface ClaudeRuntime {
  use?: (name: string) => Promise<unknown>
}

export type SaveOutcome = 'saved' | 'declined' | 'failed'
/** drive: Googleドライブに作ったファイルのURL（Apps Script 上のときだけ） */
export interface SaveResult {
  outcome: SaveOutcome
  drive?: string
}

export async function saveTextFile(filename: string, text: string, mime = 'text/csv;charset=utf-8'): Promise<SaveResult> {
  if (isGas()) {
    try {
      return { outcome: 'saved', drive: await callGas<string>('saveToDrive', filename, text, mime) }
    } catch {
      return { outcome: 'failed' }
    }
  }
  const rt = (globalThis as unknown as { claude?: ClaudeRuntime }).claude
  if (rt?.use) {
    try {
      const d = (await rt.use('downloads')) as DownloadsApi | null
      if (d) {
        await d.save({ filename, data: text })
        return { outcome: 'saved' }
      }
    } catch (e) {
      if ((e as { code?: string } | null)?.code === 'declined') return { outcome: 'declined' }
      // 保存機能が使えない場合は、ふつうのダウンロードを試す
    }
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return { outcome: 'saved' }
  } catch {
    return { outcome: 'failed' }
  }
}

/** クリップボードへコピー（表計算ソフトへの貼り付け用）。先頭の BOM は外す */
export async function copyText(text: string): Promise<boolean> {
  const t = text.replace(/^\uFEFF/, '')
  try {
    await navigator.clipboard.writeText(t)
    return true
  } catch {
    return false
  }
}
