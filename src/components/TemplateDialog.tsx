import { useEffect, useState } from 'react'
import { templateTaskCount, templateTotalHours } from '../data/templates'
import { useApp } from '../store/AppContext'
import { useToast } from './Toast'

/** 標準の作業テンプレート（フェーズ ＞ 作業パッケージ ＞ タスク ＋ マイルストーン）をWBSへ追加する */
export function TemplateDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { derived, actions, data } = useApp()
  const { toast } = useToast()
  const project = derived.projectById.get(projectId)
  const [owner, setOwner] = useState<string>('__all__')
  const [start, setStart] = useState(project?.startDate ?? '')
  const [end, setEnd] = useState(project?.endDate ?? '')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!project) return null
  const hasItems = data.wbs.some((w) => w.projectId === projectId)
  const invalid = !start || !end || end < start

  const apply = () => {
    if (invalid) return
    const ids = owner === '__all__' ? derived.activeUsers.map((u) => u.id) : owner ? [owner] : []
    actions.addTemplateWbs(projectId, start, end, ids)
    toast(`標準の作業テンプレート（${templateTaskCount()}タスク・${templateTotalHours()}h）を追加しました`)
    onClose()
  }

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label="テンプレートから作成" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal__title">標準の作業テンプレートから作成</h3>
        <div className="modal__body">
          <p className="modal__lead">
            フェーズ ＞ 作業パッケージ ＞ タスクの3階層（{templateTaskCount()}タスク・計画 {templateTotalHours()}h・マイルストーン3件）を、期間に合わせて日程を割り振って追加します。
            {hasItems && ' 既にある作業項目は消えません（その後ろに追加されます）。'}
          </p>
          <div className="form">
            <div className="form__row">
              <label className="field">
                <span className="field__label">開始日</span>
                <input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="field">
                <span className="field__label">終了日</span>
                <input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            </div>
            <label className="field">
              <span className="field__label">担当者</span>
              <select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="__all__">全員で順番に分担する</option>
                <option value="">担当は後で決める</option>
                {derived.activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} がすべて担当
                  </option>
                ))}
              </select>
            </label>
            {invalid && <p className="form__warn">終了日は開始日以降にしてください</p>}
          </div>
        </div>
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn btn--primary" onClick={apply} disabled={invalid}>
            追加する
          </button>
        </div>
      </div>
    </div>
  )
}
