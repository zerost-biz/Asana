import { TriangleAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fmtNum } from '../domain/format'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { LoadLegend } from './WorkloadGrid'
import { cx } from './cx'

/** Dashboard 用の小さな Workload（人×今週〜+3週）。セルクリックで Workload のドロワーへ */
export function WorkloadOutlook() {
  const { derived, data } = useApp()
  const navigate = useNavigate()
  const { workload } = derived
  return (
    <div className="wo">
      <div className="wo__row wo__row--head">
        <div />
        {workload.weeks.map((w) => (
          <div key={w.index} className="wo__colhead">
            <strong>{w.label}</strong>
            <span>{w.range}</span>
          </div>
        ))}
      </div>
      {data.users.map((u, ui) => (
        <div key={u.id} className="wo__row">
          <div className="wo__user">
            <Avatar user={u} size="sm" />
            {u.name}
          </div>
          {workload.cells[ui].map((c) => (
            <button
              key={c.weekIndex}
              type="button"
              className={cx('wo__pill', `wo__pill--${c.level}`)}
              onClick={() => navigate(`/workload?cell=${u.id}:${c.weekIndex}`)}
              title={`${u.name} ${workload.weeks[c.weekIndex].label}: ${fmtNum(c.planned)}h / ${fmtNum(c.capacity)}h`}
            >
              {c.level === 'warn' && <TriangleAlert size={13} strokeWidth={2.6} />}
              {Math.round(c.utilization * 100)}%
            </button>
          ))}
        </div>
      ))}
      <LoadLegend />
    </div>
  )
}
