import type { ReactNode } from 'react'
import { cx } from './cx'

interface Props {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children: ReactNode
  id?: string
  className?: string
  flush?: boolean
}

export function Card({ title, subtitle, action, children, id, className, flush }: Props) {
  return (
    <section className={cx('card', className)} id={id}>
      <header className="card__head">
        <div>
          <h2 className="card__title">{title}</h2>
          {subtitle && <p className="card__sub">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className={cx('card__body', flush && 'card__body--flush')}>{children}</div>
    </section>
  )
}
