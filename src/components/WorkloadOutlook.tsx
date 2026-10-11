import { TriangleAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fmtNum } from '../domain/format'
import { cellLevel, cellRatio } from '../domain/workload'
import { usePref } from '../hooks/usePref'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { LoadLegend } from './WorkloadGrid'
import { cx } from './cx'

/** ホーム用の小さな稼働状況（人×今週〜+3週）。セルクリックで稼働状況のドロワーへ */
export function WorkloadOutlook() {
  const { derived } = useApp()
  const navigate = useNavigate()
  const { workload } = derived
  const [mode, setMode] = usePref<'committed' | 'forecast'>('wl-mode', 'forecast', ['committed', 'forecast'])
  const forecast = mode === 'forecast'
  return (
    <div className="wo">
      <div className="wo__tools">
        <div className="unit-toggle" role="radiogroup" aria-label="負荷の見方">
          <button type="button" role="radio" aria-checked={!forecast} className={cx(!forecast && 'is-on')} onClick={() => setMode('committed')}>
            確定のみ
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={forecast}
            className={cx(forecast && 'is-on')}
            onClick={() => setMode('forecast')}
            title="受注見込みの案件・仮配置（確度で重み付け）も含めます"
          >
            見込み込み
          </button>
        </div>
      </div>
      <div className="wo__row wo__row--head">
        <div />
        {workload.weeks.map((w) => (
          <div key={w.index} className="wo__colhead">
            <strong>{w.label}</strong>
            <span>{w.range}</span>
          </div>
        ))}
      </div>
      {workload.users.map((u, ui) => (
        <div key={u.id} className="wo__row">
          <div className="wo__user">
            <Avatar user={u} size="sm" />
            {u.name}
          </div>
          {workload.cells[ui].map((c) => {
            const level = cellLevel(c, forecast)
            return (
              <button
                key={c.weekIndex}
                type="button"
                className={cx('wo__pill', `wo__pill--${level}`)}
                onClick={() => navigate(`/workload?cell=${u.id}:${c.weekIndex}`)}
                title={`${u.name} ${workload.weeks[c.weekIndex].label}: 確定 ${fmtNum(c.planned)}h${forecast ? ` + 見込み ${fmtNum(c.expected)}h` : ''} / 稼働可能 ${fmtNum(c.capacity)}h`}
              >
                {level === 'warn' && <TriangleAlert size={13} strokeWidth={2.6} />}
                {Math.round(cellRatio(c, forecast) * 100)}%
              </button>
            )
          })}
        </div>
      ))}
      <LoadLegend />
    </div>
  )
}
