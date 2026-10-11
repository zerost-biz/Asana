/**
 * ファイルの保存・コピー（ブラウザ依存の処理をここに集める）。
 *  - Artifact（プレビュー）では、ページからの直接ダウンロードが許されないため、`downloads` 機能で保存する
 *  - 通常のブラウザ（npm run dev・単一HTMLを開いた場合）は、ふつうのダウンロードを使う
 */
interface DownloadsApi {
  save: (req: { filename: string; data: string }) => Promise<{ status: string }>
}
interface ClaudeRuntime {
  use?: (name: string) => Promise<unknown>
}

export type SaveOutcome = 'saved' | 'declined' | 'failed'

export async function saveTextFile(filename: string, text: string, mime = 'text/csv;charset=utf-8'): Promise<SaveOutcome> {
  const rt = (globalThis as unknown as { claude?: ClaudeRuntime }).claude
  if (rt?.use) {
    try {
      const d = (await rt.use('downloads')) as DownloadsApi | null
      if (d) {
        await d.save({ filename, data: text })
        return 'saved'
      }
    } catch (e) {
      if ((e as { code?: string } | null)?.code === 'declined') return 'declined'
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
    return 'saved'
  } catch {
    return 'failed'
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
