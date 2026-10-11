import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

interface Props {
  title: ReactNode
  eyebrow?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  ariaLabel?: string
}

/** 右側の詳細ドロワー（Task編集 / Workload内訳で共用）。呼び出し側が開閉を制御する */
export function Drawer({ title, eyebrow, onClose, children, footer, ariaLabel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <aside className="drawer" role="dialog" aria-label={ariaLabel ?? '詳細'}>
      <header className="drawer__head">
        <div className="drawer__titles">
          {eyebrow && <div className="drawer__eyebrow">{eyebrow}</div>}
          <h2 className="drawer__title">{title}</h2>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="閉じる">
          <X size={18} />
        </button>
      </header>
      <div className="drawer__body">{children}</div>
      {footer && <footer className="drawer__foot">{footer}</footer>}
    </aside>
  )
}
