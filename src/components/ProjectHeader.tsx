import { NavLink } from 'react-router-dom'
import { fmtMD } from '../domain/dates'
import { fmtNum, fmtPct, fmtSignedH } from '../domain/format'
import type { ProjectSummary } from '../store/derived'
import { HealthBadge } from './StatusBadge'
import { cx } from './cx'

const TABS = [
  { to: '', label: 'List', end: true },
  { to: 'timeline', label: 'Timeline', end: false },
  { to: 'dashboard', label: 'Dashboard', end: false },
  { to: 'workload', label: 'Workload', end: false },
]

export function ProjectHeader({ summary }: { summary: ProjectSummary }) {
  const { project, totals, health } = summary
  const base = `/projects/${project.id}`
  const over = totals.variance > 0

  return (
    <div className="phead">
      <div className="phead__top">
        <div className="phead__title">
          <h1>{project.name}</h1>
          <HealthBadge health={health.health} title={health.reasons.join(' / ') || '問題なし'} />
          <span className="phead__period">
            {fmtMD(project.startDate)} – {fmtMD(project.endDate)}
          </span>
        </div>

        <dl className="phead__stats" aria-label="プロジェクト工数サマリー">
          <div>
            <dt>進捗</dt>
            <dd>{fmtPct(totals.progress / 100)}</dd>
          </div>
          <div>
            <dt>PLAN</dt>
            <dd>{fmtNum(totals.plan)}h</dd>
          </div>
          <div>
            <dt>ACT</dt>
            <dd>{fmtNum(totals.act)}h</dd>
          </div>
          <div>
            <dt>ETC</dt>
            <dd>{fmtNum(totals.etc)}h</dd>
          </div>
          <div>
            <dt>EAC</dt>
            <dd>{fmtNum(totals.eac)}h</dd>
          </div>
          <div className={cx(over && 'is-over')}>
            <dt>差異</dt>
            <dd>{fmtSignedH(totals.variance)}</dd>
          </div>
        </dl>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <NavLink
            key={t.label}
            to={t.to ? `${base}/${t.to}` : base}
            end={t.end}
            role="tab"
            className={({ isActive }) => cx('tabs__tab', isActive && 'is-active')}
          >
            {t.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
