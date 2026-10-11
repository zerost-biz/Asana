import { cx } from './cx'

interface Props {
  /** 0〜100 */
  value: number
  tone?: 'accent' | 'good' | 'watch' | 'risk' | 'muted'
  size?: 'sm' | 'md' | 'lg'
  /** 100% を超える値を許容して、はみ出しを強調する（負荷率など） */
  max?: number
  className?: string
}

export function ProgressBar({ value, tone = 'accent', size = 'md', max = 100, className }: Props) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <span className={cx('pbar', `pbar--${size}`, className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}>
      <span className={cx('pbar__fill', `pbar__fill--${tone}`)} style={{ width: `${pct}%` }} />
    </span>
  )
}
