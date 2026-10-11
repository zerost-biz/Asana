import { TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { fmtNum, fmtSignedH } from '../domain/format'
import type { LoadLevel, WorkloadCell, WorkloadMatrix } from '../domain/workload'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { cx } from './cx'

interface Props {
  matrix: WorkloadMatrix
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
  warn: '警告',
}

export function LoadLegend() {
  return (
    <div className="load-legend" aria-label="負荷率の凡例">
      <span><i className="swatch swatch--normal" />85%未満 通常</span>
      <span><i className="swatch swatch--caution" />85〜100% 注意</span>
      <span><i className="swatch swatch--warn" />100%超 警告</span>
    </div>
  )
}

export function WorkloadGrid({ matrix, selectedKey, onSelect, projectId, editableCapacity }: Props) {
  const { actions, derived } = useApp()

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
    const capacity = rows.reduce((s, r) => s + r.cells[w.index].capacity, 0)
    return { planned, capacity, util: capacity > 0 ? planned / capacity : 0 }
  })

  return (
    <div className="wl" role="table" aria-label="Workload（人×週）">
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
            <Avatar user={user} size="lg" />
            <div>
              <div className="wl__name">{user.name}</div>
              {editableCapacity ? (
                <label className="wl__cap">
                  <span className="wl__cap-label">稼働</span>
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
                    aria-label={`${user.name}の週あたり稼働可能時間`}
                  />
                  h/週
                </label>
              ) : (
                <div className="wl__cap wl__cap--ro">{user.weeklyCapacity}h/週</div>
              )}
            </div>
          </div>
          {cells.map((c) => (
            <LoadCell
              key={c.weekIndex}
              cell={c}
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
        <div role="rowheader" className="wl__person wl__person--total">チーム合計</div>
        {totals.map((t, i) => (
          <div key={i} role="cell" className="wl__total">
            <b>{Math.round(t.util * 100)}%</b>
            <span>{fmtNum(t.planned)}h / {fmtNum(t.capacity)}h</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LoadCell({
  cell,
  selected,
  onClick,
  projectHours,
  weekLabel,
  userName,
}: {
  cell: WorkloadCell
  selected: boolean
  onClick: () => void
  projectHours?: number
  weekLabel: string
  userName: string
}) {
  const pct = Math.round(cell.utilization * 100)
  const over = cell.planned - cell.capacity
  return (
    <button
      type="button"
      role="cell"
      className={cx('wl__cell', `wl__cell--${cell.level}`, selected && 'is-selected')}
      onClick={onClick}
      aria-label={`${userName} ${weekLabel} 負荷${pct}% ${LEVEL_LABEL[cell.level]}`}
    >
      <span className="wl__pct">
        {pct}%
        {cell.level === 'warn' && <TriangleAlert size={15} strokeWidth={2.4} className="wl__warn-icon" />}
      </span>
      <span className="wl__bar">
        <span className="wl__bar-fill" style={{ width: `${Math.min(100, cell.utilization * 100)}%` }} />
        {cell.level === 'warn' && <span className="wl__bar-over" style={{ width: `${Math.min(30, (cell.utilization - 1) * 100)}%` }} />}
      </span>
      <span className="wl__hours">
        {fmtNum(cell.planned)}h <em>/ {fmtNum(cell.capacity)}h</em>
        {cell.level === 'warn' && <b className="wl__over">{fmtSignedH(over)}</b>}
      </span>
      {projectHours !== undefined && <span className="wl__proj">本PJ {fmtNum(projectHours)}h</span>}
    </button>
  )
}
