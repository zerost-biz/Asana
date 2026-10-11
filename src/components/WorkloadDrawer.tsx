import { RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fmtNum, fmtSignedH } from '../domain/format'
import { autoHoursByWeek, cellLevel, cellOf, cellRatio, type WorkloadMatrix } from '../domain/workload'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { Drawer } from './Drawer'
import { NumInput } from './NumInput'
import { LEVEL_LABEL } from './WorkloadGrid'
import { ProgressBar } from './ProgressBar'
import { cx } from './cx'

interface Props {
  matrix: WorkloadMatrix
  forecast: boolean
  userId: string
  weekIndex: number
  onClose: () => void
}

/** 稼働セルの内訳: その週に どのPJ・作業で何時間予定されているか、見込み、稼働の調整、週別の手修正 */
export function WorkloadDrawer({ matrix, forecast, userId, weekIndex, onClose }: Props) {
  const { data, derived, actions, can } = useApp()
  const navigate = useNavigate()
  const user = derived.userById.get(userId)
  const week = matrix.weeks[weekIndex]
  const cell = cellOf(matrix, userId, weekIndex)
  const cap = data.capacities.find((c) => c.userId === userId && c.weekStart === week?.startISO)
  const [note, setNote] = useState<string | null>(null)

  const groups = useMemo(() => {
    if (!cell) return []
    const byProject = new Map<string, { projectId: string; hours: number; tasks: { id: string; hours: number; manual: boolean }[] }>()
    for (const a of cell.allocations) {
      const g = byProject.get(a.projectId) ?? { projectId: a.projectId, hours: 0, tasks: [] }
      g.hours += a.hours
      g.tasks.push({ id: a.wbsId, hours: a.hours, manual: !!a.manual })
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
        return { user: u, free: c.capacity - c.planned - (forecast ? c.expected : 0), util: cellRatio(c, forecast) }
      })
      .filter((s) => s.free > 0)
      .sort((a, b) => b.free - a.free)
  }, [matrix, userId, weekIndex, forecast])

  if (!user || !week || !cell) return null
  const level = cellLevel(cell, forecast)
  const pct = Math.round(cellRatio(cell, forecast) * 100)
  const total = cell.planned + (forecast ? cell.expected : 0)
  const over = total - cell.capacity
  const canCap = can('capacity.edit', { targetUserId: userId })

  const setCapacity = (patch: { unavailableHours?: number; note?: string }) =>
    actions.setCapacity({
      userId,
      weekStart: week.startISO,
      baseHours: cap?.baseHours,
      unavailableHours: patch.unavailableHours ?? cap?.unavailableHours ?? 0,
      note: patch.note ?? cap?.note,
    })

  // 見込み（受注見込み・仮配置）の内訳
  const loads = cell.assignLoads
  const targetName = (l: (typeof loads)[number]): string => {
    if (l.targetType === 'opportunity') return data.opportunities.find((o) => o.id === l.targetId)?.title ?? '案件'
    return derived.projectById.get(l.targetId)?.name ?? 'プロジェクト'
  }

  return (
    <Drawer
      onClose={onClose}
      ariaLabel="稼働の内訳"
      eyebrow={`${week.label}  ·  ${week.range}`}
      title={
        <span className="wd-title">
          <Avatar user={user} size="md" />
          {user.name}
        </span>
      }
    >
      <section className={cx('wd-summary', `wd-summary--${level}`)}>
        <div className="wd-summary__main">
          <span className="wd-summary__pct">{pct}%</span>
          <span className={cx('wd-summary__level', `wd-summary__level--${level}`)}>{LEVEL_LABEL[level]}</span>
          <small className="wd-summary__mode">{forecast ? '見込み込み' : '確定のみ'}</small>
        </div>
        <dl className="wd-kv">
          <div>
            <dt>確定</dt>
            <dd>{fmtNum(cell.planned)}h <small>{Math.round(cell.utilization * 100)}%</small></dd>
          </div>
          <div>
            <dt>見込み（確度加重）</dt>
            <dd>{fmtNum(cell.expected)}h <small>見込み込み {Math.round(cell.forecastUtilization * 100)}%</small></dd>
          </div>
          <div>
            <dt>稼働可能</dt>
            <dd>
              {fmtNum(cell.capacity)}h <small>標準 {fmtNum(cell.base)}h − 休み等 {fmtNum(cell.unavailable)}h</small>
            </dd>
          </div>
        </dl>
        {level === 'warn' && <div className="wd-summary__over">{fmtSignedH(over)} 超過しています</div>}
        <ProgressBar value={cellRatio(cell, forecast) * 100} max={100} tone={level === 'warn' ? 'risk' : level === 'caution' ? 'watch' : 'accent'} size="lg" />
      </section>

      <section>
        <h3 className="section-title">
          確定の内訳 <span>{groups.reduce((s, g) => s + g.tasks.length, 0)}件</span>
        </h3>
        {groups.length === 0 && <p className="hint">この週に、確定している作業の予定はありません。</p>}
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
                  const editable = !!item && can('wbs.progress', { project: p, wbs: item })
                  const auto = item ? autoHoursByWeek(item, derived.weeksAll).get(weekIndex) ?? 0 : 0
                  return (
                    <li key={t.id} className="wd-item">
                      <button type="button" className="wd-task" onClick={() => navigate(`/projects/${g.projectId}/wbs?task=${t.id}`)}>
                        <span className="wbs__code">{derived.numbers.get(t.id)}</span>
                        <span className="wd-task__title">{item?.title}</span>
                        <span className="wd-task__bar">
                          <i style={{ width: `${Math.min(100, (t.hours / Math.max(cell.planned, 1)) * 100)}%` }} />
                        </span>
                        {!editable && <b>{fmtNum(t.hours)}h</b>}
                      </button>
                      {editable && (
                        <span className="wd-edit" title="この週の時間を手で調整できます（自動配分より優先されます）">
                          <NumInput
                            className="input input--sm input--num wd-edit__num"
                            value={Math.round(t.hours * 10) / 10}
                            step={0.5}
                            ariaLabel={`${item?.title}のこの週の時間`}
                            onCommit={(n) => actions.setAllocation(t.id, week.startISO, n)}
                          />
                          h
                          {t.manual ? (
                            <button
                              type="button"
                              className="wd-edit__reset"
                              title={`自動配分（${fmtNum(auto)}h）に戻す`}
                              onClick={() => actions.setAllocation(t.id, week.startISO, null)}
                            >
                              <RotateCcw size={12} />
                              手修正
                            </button>
                          ) : null}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
        <p className="hint">
          計算のしかた: 未完了の作業の「残り時間」を、開始日（開始が過去なら今週の月曜）から終了日までの平日に均等に割り振っています。終了日を過ぎた作業の残り時間は、すべて今週に入ります。右の数字を直すと、その週だけ手で調整できます。
        </p>
      </section>

      {loads.length > 0 && (
        <section>
          <h3 className="section-title">
            配置・見込みの内訳 <span>{loads.length}件</span>
          </h3>
          <ul className="wd-loads">
            {loads.map((l, i) => (
              <li key={i}>
                <span className={cx('chip', l.kind === 'expected' && 'chip--soft')}>{l.kind === 'committed' ? '確定' : '見込み'}</span>
                <span className="wd-loads__name">
                  {targetName(l)}
                  <small>{l.role}</small>
                </span>
                <b>
                  {fmtNum(l.hours)}h{l.weight < 1 && <small> × {Math.round(l.weight * 100)}%</small>}
                </b>
              </li>
            ))}
          </ul>
          <Link className="link-btn" to="/assignments">
            配置を見直す
          </Link>
        </section>
      )}

      <section>
        <h3 className="section-title">稼働の調整</h3>
        {canCap ? (
          <div className="wd-cap">
            <label className="field">
              <span className="field__label">休暇・研修・固定業務などで使えない時間（h）</span>
              <NumInput
                className="input input--num"
                value={cap?.unavailableHours ?? 0}
                step={1}
                ariaLabel="使えない時間"
                onCommit={(n) => setCapacity({ unavailableHours: n })}
              />
            </label>
            <label className="field">
              <span className="field__label">メモ（例: 有給 / 研修）</span>
              <input
                className="input"
                value={note ?? cap?.note ?? ''}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => {
                  if (note !== null && note !== (cap?.note ?? '')) setCapacity({ note })
                  setNote(null)
                }}
                placeholder="任意"
              />
            </label>
            <p className="hint">稼働可能 = 標準 {fmtNum(cell.base)}h − 使えない時間。減らすと負荷率が上がります。</p>
          </div>
        ) : (
          <p className="hint">稼働の調整は、本人または課長以上が行えます。{cap?.note ? `（メモ: ${cap.note}）` : ''}</p>
        )}
      </section>

      {level !== 'normal' && spare.length > 0 && (
        <section>
          <h3 className="section-title">同じ週の空き（担当を移す候補）</h3>
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
