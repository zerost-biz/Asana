import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmtNum, fmtSignedH } from '../domain/format'
import { cellOf, type WorkloadMatrix } from '../domain/workload'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { Drawer } from './Drawer'
import { LEVEL_LABEL } from './WorkloadGrid'
import { ProgressBar } from './ProgressBar'
import { cx } from './cx'

interface Props {
  matrix: WorkloadMatrix
  userId: string
  weekIndex: number
  onClose: () => void
}

/** Workload セルの内訳: その週に どのPJ・Task で何時間予定されているか */
export function WorkloadDrawer({ matrix, userId, weekIndex, onClose }: Props) {
  const { derived } = useApp()
  const navigate = useNavigate()
  const user = derived.userById.get(userId)
  const week = matrix.weeks[weekIndex]
  const cell = cellOf(matrix, userId, weekIndex)

  const groups = useMemo(() => {
    if (!cell) return []
    const byProject = new Map<string, { projectId: string; hours: number; tasks: { id: string; hours: number }[] }>()
    for (const a of cell.allocations) {
      const g = byProject.get(a.projectId) ?? { projectId: a.projectId, hours: 0, tasks: [] }
      g.hours += a.hours
      g.tasks.push({ id: a.wbsId, hours: a.hours })
      byProject.set(a.projectId, g)
    }
    return [...byProject.values()]
      .map((g) => ({ ...g, tasks: g.tasks.sort((a, b) => b.hours - a.hours) }))
      .sort((a, b) => b.hours - a.hours)
  }, [cell])

  // 同じ週に余力のあるメンバー（再配分の候補）
  const spare = useMemo(() => {
    return matrix.users
      .filter((u) => u.id !== userId)
      .map((u) => {
        const c = cellOf(matrix, u.id, weekIndex)!
        return { user: u, free: c.capacity - c.planned, util: c.utilization }
      })
      .filter((s) => s.free > 0)
      .sort((a, b) => b.free - a.free)
  }, [matrix, userId, weekIndex])

  if (!user || !week || !cell) return null
  const pct = Math.round(cell.utilization * 100)
  const over = cell.planned - cell.capacity

  return (
    <Drawer
      onClose={onClose}
      ariaLabel="Workload内訳"
      eyebrow={`${week.label}  ·  ${week.range}`}
      title={
        <span className="wd-title">
          <Avatar user={user} size="md" />
          {user.name}
        </span>
      }
    >
      <section className={cx('wd-summary', `wd-summary--${cell.level}`)}>
        <div className="wd-summary__main">
          <span className="wd-summary__pct">{pct}%</span>
          <span className={cx('wd-summary__level', `wd-summary__level--${cell.level}`)}>{LEVEL_LABEL[cell.level]}</span>
        </div>
        <div className="wd-summary__hours">
          Planned <b>{fmtNum(cell.planned)}h</b> / Available <b>{fmtNum(cell.capacity)}h</b>
          {cell.level === 'warn' && <em>（{fmtSignedH(over)} 超過）</em>}
        </div>
        <ProgressBar value={cell.utilization * 100} max={100} tone={cell.level === 'warn' ? 'risk' : cell.level === 'caution' ? 'watch' : 'accent'} size="lg" />
      </section>

      <section>
        <h3 className="section-title">内訳 <span>{groups.reduce((s, g) => s + g.tasks.length, 0)}タスク</span></h3>
        {groups.length === 0 && <p className="hint">この週に予定されている作業はありません。</p>}
        {groups.map((g) => {
          const p = derived.projectById.get(g.projectId)
          return (
            <div key={g.projectId} className="wd-group">
              <button type="button" className="wd-group__head" onClick={() => navigate(`/projects/${g.projectId}`)}>
                <span>{p?.name}</span>
                <b>{fmtNum(g.hours)}h</b>
              </button>
              <ul>
                {g.tasks.map((t) => {
                  const item = derived.idx.byId.get(t.id)
                  return (
                    <li key={t.id}>
                      <button type="button" className="wd-task" onClick={() => navigate(`/projects/${g.projectId}?task=${t.id}`)}>
                        <span className="wbs__code">{derived.numbers.get(t.id)}</span>
                        <span className="wd-task__title">{item?.title}</span>
                        <span className="wd-task__bar">
                          <i style={{ width: `${Math.min(100, (t.hours / Math.max(cell.planned, 1)) * 100)}%` }} />
                        </span>
                        <b>{fmtNum(t.hours)}h</b>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
        <p className="hint">
          算出ルール: 未完了タスクの ETC を、max(開始日, 今週月曜)〜終了日の稼働日へ均等配分。終了日を過ぎたタスクの ETC は今週に計上されます。
        </p>
      </section>

      {cell.level !== 'normal' && spare.length > 0 && (
        <section>
          <h3 className="section-title">同じ週の空き（再配分の候補）</h3>
          <ul className="wd-spare">
            {spare.map((s) => (
              <li key={s.user.id}>
                <Avatar user={s.user} size="sm" />
                <span>{s.user.name}</span>
                <span className="wd-spare__util">{Math.round(s.util * 100)}%</span>
                <b>空き {fmtNum(s.free)}h</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Drawer>
  )
}
