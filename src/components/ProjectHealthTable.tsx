import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fmtNum, fmtSignedH, fmtYenShort } from '../domain/format'
import { useApp } from '../store/AppContext'
import { ProgressBar } from './ProgressBar'
import { HealthBadge } from './StatusBadge'
import { cx } from './cx'

/** Project Health 一覧（Dashboard / Projects で共用）。行クリックでプロジェクトへ遷移 */
export function ProjectHealthTable() {
  const { derived } = useApp()
  return (
    <div className="ph" role="table" aria-label="プロジェクトの状態">
      <div className="ph__row ph__row--head" role="row">
        <div role="columnheader">プロジェクト</div>
        <div role="columnheader">進捗率</div>
        <div role="columnheader">工数消化率</div>
        <div role="columnheader">見込み差異</div>
        <div role="columnheader">状態</div>
        <div />
      </div>
      {derived.summaries.filter((s) => s.project.status !== 'completed' && s.project.status !== 'archived').map((s) => {
        const { totals } = s
        const burnPct = (totals.burn ?? 0) * 100
        const over = totals.variance > 0
        return (
          <Link key={s.project.id} to={`/projects/${s.project.id}`} className="ph__row" role="row">
            <div role="cell" className="ph__name">
              <strong>{s.project.name}</strong>
              <span>
                {s.health.reasons.length > 0 ? s.health.reasons.join(' · ') : '大きな懸念なし'}
              </span>
            </div>
            <div role="cell" className="ph__metric">
              <b>{Math.round(totals.progress)}%</b>
              <ProgressBar value={totals.progress} size="sm" tone="accent" />
            </div>
            <div role="cell" className="ph__metric">
              <b>{Math.round(burnPct)}%</b>
              <ProgressBar value={burnPct} size="sm" tone={burnPct > totals.progress + 10 ? 'watch' : 'muted'} />
              <span className="ph__small">
                {fmtNum(totals.act)} / {fmtNum(totals.plan)}h
              </span>
            </div>
            <div role="cell" className={cx('ph__var', over && 'is-over')}>
              <b>{fmtSignedH(totals.variance)}</b>
              <span className="ph__small">見込み {fmtNum(totals.eac)}h</span>
              <span className={cx('ph__small', s.cost.marginRate !== null && s.cost.marginRate < 0.1 && 'ph__small--warn')}>
                {s.cost.marginRate !== null ? `粗利 ${Math.round(s.cost.marginRate * 100)}%` : `人件費 ${fmtYenShort(totals.eacCost)}`}
              </span>
            </div>
            <div role="cell">
              <HealthBadge health={s.health.health} />
            </div>
            <div role="cell" className="ph__go">
              <ChevronRight size={18} />
            </div>
          </Link>
        )
      })}
    </div>
  )
}
