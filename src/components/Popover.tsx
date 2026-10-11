import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  className?: string
}

/** クリックで開閉するシンプルなポップオーバー（外側クリック/Escで閉じる） */
export function Popover({ trigger, children, align = 'right', className }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`popover ${className ?? ''}`} ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && <div className={`popover__panel popover__panel--${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  )
}
