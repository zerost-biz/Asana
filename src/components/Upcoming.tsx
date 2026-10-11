import { CalendarClock, Diamond, Flag, FolderCheck } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { daysBetween, fmtMDW } from '../domain/dates'
import { useApp } from '../store/AppContext'

/** 次の重要な期限（マイルストーン・PJ化判断の期限・プロジェクト終了日）。向こう30日 */
export function Upcoming() {
  const { data, derived } = useApp()
  const { todayISO } = derived
  const items = useMemo(() => {
    const out: { id: string; date: string; kind: 'ms' | 'decision' | 'end'; title: string; sub: string; to: string }[] = []
    for (const l of derived.leaves) {
      if (l.type !== 'milestone' || l.status === 'done') continue
      const p = derived.projectById.get(l.projectId)
      if (!p || (p.status !== 'active' && p.status !== 'planned')) continue
      out.push({ id: `ms:${l.id}`, date: l.endDate, kind: 'ms', title: l.title, sub: p.name, to: `/projects/${p.id}/wbs?task=${l.id}` })
    }
    for (const o of data.opportunities) {
      if (!o.decisionDue || o.stage === 'converted' || o.stage === 'lost') continue
      out.push({
        id: `dec:${o.id}`,
        date: o.decisionDue,
        kind: 'decision',
        title: `${derived.customerById.get(o.customerId)?.name ?? ''} PJ化の判断`,
        sub: o.title,
        to: `/pipeline/${o.id}/evaluation`,
      })
    }
    for (const p of data.projects) {
      if (p.status !== 'active') continue
      out.push({ id: `end:${p.id}`, date: p.endDate, kind: 'end', title: `${p.name} の終了予定`, sub: '期間の最終日', to: `/projects/${p.id}` })
    }
    return out
      .filter((i) => i.date >= todayISO && daysBetween(todayISO, i.date) <= 30)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, 7)
  }, [data.opportunities, data.projects, derived, todayISO])

  if (items.length === 0) return <div className="empty">向こう30日に、重要な期限はありません</div>
  const ICON = { ms: Diamond, decision: Flag, end: FolderCheck } as const
  return (
    <ul className="upc">
      {items.map((i) => {
        const Icon = ICON[i.kind] ?? CalendarClock
        const d = daysBetween(todayISO, i.date)
        return (
          <li key={i.id}>
            <Link to={i.to} className="upc__link">
              <span className="upc__date">
                <b>{fmtMDW(i.date)}</b>
                <small>{d === 0 ? '今日' : `あと${d}日`}</small>
              </span>
              <span className="upc__text">
                <strong>
                  <Icon size={13} /> {i.title}
                </strong>
                <span>{i.sub}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
