import { useEffect, useState } from 'react'

/** 理由の入力を求める確認ダイアログ（見送りなど） */
export function ReasonDialog({
  title,
  lead,
  label,
  confirmLabel,
  placeholder,
  onConfirm,
  onCancel,
}: {
  title: string
  lead?: string
  label: string
  confirmLabel: string
  placeholder?: string
  onConfirm: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <div className="modal-scrim" onMouseDown={onCancel}>
      <div className="modal" role="dialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal__title">{title}</h3>
        <div className="modal__body">
          {lead && <p className="modal__lead">{lead}</p>}
          <label className="field">
            <span className="field__label">{label}</span>
            <textarea className="input input--area" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} autoFocus />
          </label>
        </div>
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            キャンセル
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onConfirm(reason.trim())} disabled={!reason.trim()}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
