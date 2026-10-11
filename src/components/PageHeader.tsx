import type { ReactNode } from 'react'

export function PageHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="pagehead">
      <div>
        <h1 className="pagehead__title">{title}</h1>
        {sub && <p className="pagehead__sub">{sub}</p>}
      </div>
      {right && <div className="pagehead__right">{right}</div>}
    </div>
  )
}
