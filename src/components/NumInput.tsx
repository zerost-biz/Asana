import { useState } from 'react'

interface Props {
  value: number
  onCommit: (n: number) => void
  min?: number
  step?: number
  className?: string
  ariaLabel?: string
  id?: string
}

/** 入力途中（空欄・先頭の0など）を許容しつつ、有効な数値になったら親へ反映する数値入力 */
export function NumInput({ value, onCommit, min = 0, step = 1, className, ariaLabel, id }: Props) {
  const [text, setText] = useState<string | null>(null)
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      className={className}
      min={min}
      step={step}
      aria-label={ariaLabel}
      value={text ?? String(value)}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= min) onCommit(n)
      }}
      onBlur={() => setText(null)}
    />
  )
}
