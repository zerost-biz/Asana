import { useState, type InputHTMLAttributes } from 'react'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string | number
  onCommit: (v: string) => void
  type?: 'text' | 'date' | 'number'
}

/** 入力中はローカルで保持し、フォーカスが外れた（または Enter）ときにだけ確定する入力欄（更新履歴を増やしすぎないため） */
export function CommitField({ value, onCommit, type = 'text', className = 'input', ...rest }: Props) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text !== null && text !== String(value)) onCommit(text)
    setText(null)
  }
  return (
    <input
      {...rest}
      type={type}
      className={className}
      value={text ?? String(value)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        rest.onKeyDown?.(e)
      }}
    />
  )
}
