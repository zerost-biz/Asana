import { TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { fmtNum, fmtSignedH } from '../domain/format'
import { cellLevel, cellRatio, type LoadLevel, type WorkloadCell, type WorkloadMatrix } from '../domain/workload'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { cx } from './cx'

interface Props {
  matrix: WorkloadMatrix
  /** true: 受注見込み・仮配置（確度加重）を含めた「見込み込み」の負荷率で色分けする */
  forecast: boolean
  /** "userId:weekIndex" */
  selectedKey: string | null
  onSelect: (userId: string, weekIndex: number) => void
  /** 指定すると、そのプロジェクトに担当タスクを持つ人だけを表示し、本PJ分の工数を併記する */
  projectId?: string
  editableCapacity?: boolean
}

export const LEVEL_LABEL: Record<LoadLevel, string> = {
  normal: '通常',
  caution: '注意',
  warn: '過負荷',
}

export function LoadLegend() {
  return (
    <div className="load-legend" aria-label="負荷率の凡例">
      <span><i className="swatch swatch--normal" />85%未満 通常</span>
      <span><i className="swatch swatch--caution" />85〜100% 注意</span>
      <span><i className="swatch swatch--warn" />100%超 過負荷</span>
    </div>
  )
}

export function WorkloadGrid({ matrix, forecast, selectedKey, onSelect, projectId, editableCapacity }: Props) {
  const { actions, derived, can } = useApp()
  const n = matrix.weeks.length
  const dense = n > 4

  const rows = useMemo(() => {
    return matrix.users
      .map((u, ui) => ({ user: u, cells: matrix.cells[ui] }))
      .filter(({ user }) => {
        if (!projectId) return true
        return derived.leaves.some((l) => l.projectId === projectId && l.ownerId === user.id)
      })
  }, [matrix, projectId, derived.leaves])

  const totals = matrix.weeks.map((w) => {
    const planned = rows.reduce((s, r) => s + r.cells[w.index].planned, 0)
    const expected = rows.reduce((s, r) => s + r.cells[w.index].expected, 0)
    const capacity = rows.reduce((s, r) => s + r.cells[w.index].capacity, 0)
    const util = capacity > 0 ? (planned + (forecast ? expected : 0)) / capacity : 0
    return { planned, expected, capacity, util }
  })

  return (
    <div className="wl__scroll">
      <div
        className={cx('wl', dense && 'wl--dense')}
        role="table"
        aria-label="稼働状況（人×週）"
        style={{ ['--wl-n' as string]: n }}
      >
        <div className="wl__row wl__row--head" role="row">
          <div role="columnheader" />
          {matrix.weeks.map((w) => (
            <div key={w.index} role="columnheader" className="wl__colhead">
              <strong>{w.label}</strong>
              <span>{w.range}</span>
            </div>
          ))}
        </div>

        {rows.map(({ user, cells }) => (
          <div key={user.id} className="wl__row" role="row">
            <div role="rowheader" className="wl__person">
              <Avatar user={user} size={dense ? 'md' : 'lg'} />
              <div>
                <div className="wl__name">{user.name}</div>
                {editableCapacity && can('capacity.edit', { targetUserId: user.id }) ? (
                  <label className="wl__cap">
                    <span className="wl__cap-label">標準</span>
                    <input
                      type="number"
                      min={0}
                      max={80}
                      step={1}
                      value={user.weeklyCapacity}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        if (Number.isFinite(v) && v >= 0) actions.updateUser(user.id, { weeklyCapacity: v })
                      }}
                      aria-label={`${user.name}の週あたり標準稼働時間`}
                    />
                    h/週
                  </label>
                ) : (
                  <div className="wl__cap wl__cap--ro">標準 {user.weeklyCapacity}h/週</div>
                )}
              </div>
            </div>
            {cells.map((c) => (
              <LoadCell
                key={c.weekIndex}
                cell={c}
                forecast={forecast}
                dense={dense}
                selected={selectedKey === `${user.id}:${c.weekIndex}`}
                projectHours={projectId ? c.allocations.filter((a) => a.projectId === projectId).reduce((s, a) => s + a.hours, 0) : undefined}
                onClick={() => onSelect(user.id, c.weekIndex)}
                weekLabel={matrix.weeks[c.weekIndex].label}
                userName={user.name}
              />
            ))}
          </div>
        ))}

        {rows.length === 0 && <div className="wbs__empty">担当者が設定されたタスクがありません</div>}

        <div className="wl__row wl__row--total" role="row">
          <div role="rowheader" className="wl__person wl__person--total">
            チーム合計
            <small>{forecast ? '確定 ＋ 見込み' : '確定のみ'}</small>
          </div>
          {totals.map((t, i) => (
            <div key={i} role="cell" className="wl__total">
              <b>{Math.round(t.util * 100)}%</b>
              <span>
                {fmtNum(t.planned + (forecast ? t.expected : 0))}h / {fmtNum(t.capacity)}h
              </span>
            </div>
          ))}
        </div>

        {!projectId && (
          <div className="wl__row wl__row--unassigned" role="row">
            <div role="rowheader" className="wl__person wl__person--total">
              未配置の需要
              <small>誰にも割り当てていない人手（確度加重）</small>
            </div>
            {matrix.unassigned.map((u) => (
              <div key={u.weekIndex} role="cell" className="wl__total">
                {u.weighted > 0.5 ? (
                  <Link
                    to="/assignments"
                    className={cx('wl__un', u.weighted >= 20 && 'is-big')}
                    title={u.items.map((i) => `${i.role} ${fmtNum(i.hours)}h × 確度${Math.round(i.weight * 100)}%`).join('\n')}
                  >
                    {fmtNum(u.weighted)}h
                  </Link>
                ) : (
                  <span className="wl__un-none">—</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function LoadCell({
  cell,
  forecast,
  dense,
  selected,
  onClick,
  projectHours,
  weekLabel,
  userName,
}: {
  cell: WorkloadCell
  forecast: boolean
  dense: boolean
  selected: boolean
  onClick: () => void
  projectHours?: number
  weekLabel: string
  userName: string
}) {
  const ratio = cellRatio(cell, forecast)
  const level = cellLevel(cell, forecast)
  const pct = Math.round(ratio * 100)
  const committedPct = cell.utilization * 100
  const expectedPct = forecast ? Math.max(0, (cell.forecastUtilization - cell.utilization) * 100) : 0
  const total = cell.planned + (forecast ? cell.expected : 0)
  const over = total - cell.capacity
  return (
    <button
      type="button"
      role="cell"
      className={cx('wl__cell', `wl__cell--${level}`, selected && 'is-selected')}
      onClick={onClick}
      aria-label={`${userName} ${weekLabel} 負荷${pct}% ${LEVEL_LABEL[level]}`}
      title={`${userName} ${weekLabel}\n確定 ${fmtNum(cell.planned)}h${cell.expected > 0 ? ` / 見込み ${fmtNum(cell.expected)}h（確度加重）` : ''}\n稼働可能 ${fmtNum(cell.capacity)}h（標準 ${fmtNum(cell.base)}h − 休暇等 ${fmtNum(cell.unavailable)}h）`}
    >
      <span className="wl__pct">
        {pct}%
        {level === 'warn' && <TriangleAlert size={dense ? 13 : 15} strokeWidth={2.4} className="wl__warn-icon" />}
      </span>
      <span className="wl__bar">
        <span className="wl__bar-fill" style={{ width: `${Math.min(100, committedPct)}%` }} />
        {expectedPct > 0 && (
          <span
            className="wl__bar-exp"
            style={{ left: `${Math.min(100, committedPct)}%`, width: `${Math.max(0, Math.min(100 - Math.min(100, committedPct), expectedPct))}%` }}
          />
        )}
        {level === 'warn' && <span className="wl__bar-over" style={{ width: `${Math.min(30, (ratio - 1) * 100)}%` }} />}
      </span>
      <span className="wl__hours">
        {fmtNum(cell.planned)}h
        {forecast && cell.expected > 0.05 && <span className="wl__exp">＋{fmtNum(cell.expected)}h</span>}
        <em>/ {fmtNum(cell.capacity)}h</em>
        {level === 'warn' && !dense && <b className="wl__over">{fmtSignedH(over)}</b>}
      </span>
      {cell.unavailable > 0 && <span className="wl__off">休み等 {fmtNum(cell.unavailable)}h</span>}
      {projectHours !== undefined && <span className="wl__proj">本PJ {fmtNum(projectHours)}h</span>}
    </button>
  )
}
