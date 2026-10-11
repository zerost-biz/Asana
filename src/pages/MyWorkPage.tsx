import { CheckCircle2, X } from 'lucide-react'
import { daysBetween } from '../domain/dates'
import { useMemo, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { Card } from '../components/Card'
import { PageHeader } from '../components/PageHeader'
import { ProgressBar } from '../components/ProgressBar'
import { WorkCard, type SaveResult } from '../components/WorkCard'
import { fmtFull } from '../domain/dates'
import { fmtNum } from '../domain/format'
import { useApp } from '../store/AppContext'
import { cx } from '../components/cx'

export function MyWorkPage() {
  const { data, derived, actions, today } = useApp()
  const { todayISO, weeks, userById } = derived
  const me = userById.get(data.currentUserId)!
  const [projectFilter, setProjectFilter] = useState('all')
  // 保存したタスクは、完了になってもこのセッション中は一覧に残して結果を確認できるようにする
  const [pinned, setPinned] = useState<Set<string>>(() => new Set())
  const [results, setResults] = useState<Record<string, SaveResult>>({})

  const mine = useMemo(
    () => derived.leaves.filter((l) => l.ownerId === me.id && l.type !== 'milestone' && (l.status !== 'done' || pinned.has(l.id))),
    [derived.leaves, me.id, pinned],
  )
  const projectsOfMine = useMemo(() => Array.from(new Set(mine.map((l) => l.projectId))), [mine])

  const tasks = useMemo(() => {
    const list = mine.filter((l) => projectFilter === 'all' || l.projectId === projectFilter)
    const rank = (l: (typeof list)[number]) => (l.status === 'done' ? 3 : l.endDate < todayISO ? 0 : l.status === 'blocked' ? 1 : 2)
    return [...list].sort((a, b) => rank(a) - rank(b) || (a.endDate < b.endDate ? -1 : a.endDate > b.endDate ? 1 : 0))
  }, [mine, projectFilter, todayISO])

  /** 今日: 期限超過・停止中・期限が近い・優先度が高く進行中 / 今週: 今週に期間がかかるもの / 今後: それ以外 */
  const sections = useMemo(() => {
    const w0s = weeks[0].startISO
    const w0e = weeks[0].endISO
    const soon = data.settings.deadlineSoonDays
    const today: typeof tasks = []
    const week: typeof tasks = []
    const later: typeof tasks = []
    for (const l of tasks) {
      const open = l.status !== 'done'
      const isToday =
        open && (l.endDate < todayISO || l.status === 'blocked' || (l.endDate >= todayISO && daysBetween(todayISO, l.endDate) <= soon) || (l.priority === 'high' && l.status === 'in_progress'))
      if (isToday || pinned.has(l.id)) today.push(l)
      else if (l.startDate <= w0e && l.endDate >= w0s) week.push(l)
      else later.push(l)
    }
    return { today, week, later }
  }, [tasks, weeks, todayISO, data.settings.deadlineSoonDays, pinned])

  const overdueCount = mine.filter((l) => l.status !== 'done' && l.endDate < todayISO).length
  const blockedCount = mine.filter((l) => l.status === 'blocked').length

  const myEntries = data.timeEntries.filter((e) => e.userId === me.id)
  const todayEntries = myEntries.filter((e) => e.date === todayISO)
  const todayHours = todayEntries.reduce((s, e) => s + e.hours, 0)
  const w0 = weeks[0]
  const weekHours = myEntries.filter((e) => e.date >= w0.startISO && e.date <= w0.endISO).reduce((s, e) => s + e.hours, 0)
  const weekPlanned = derived.workload.cells[data.users.findIndex((u) => u.id === me.id)][0].planned

  const switchUser = (id: string) => {
    actions.setCurrentUser(id)
    setPinned(new Set())
    setResults({})
    setProjectFilter('all')
  }

  return (
    <div className="page page--mywork">
      <PageHeader
        title="自分の作業"
        sub={`${fmtFull(today)}  ·  ${me.name}が担当する未完了タスク ${mine.filter((l) => l.status !== 'done').length}件`}
        right={
          <div className="usersw" role="radiogroup" aria-label="ユーザー切替">
            {data.users.map((u) => (
              <button
                key={u.id}
                type="button"
                role="radio"
                aria-checked={u.id === me.id}
                className={cx('usersw__btn', u.id === me.id && 'is-on')}
                onClick={() => switchUser(u.id)}
              >
                <Avatar user={u} size="sm" />
                {u.name}
              </button>
            ))}
          </div>
        }
      />

      {projectsOfMine.length > 1 && (
        <div className="chips" role="tablist" aria-label="プロジェクトで絞り込み">
          <button type="button" className={cx('chips__btn', projectFilter === 'all' && 'is-on')} onClick={() => setProjectFilter('all')}>
            すべて
          </button>
          {projectsOfMine.map((pid) => (
            <button key={pid} type="button" className={cx('chips__btn', projectFilter === pid && 'is-on')} onClick={() => setProjectFilter(pid)}>
              {derived.projectById.get(pid)?.name}
            </button>
          ))}
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="empty empty--big">
          <CheckCircle2 size={28} />
          <p>{me.name}の未完了タスクはありません</p>
        </div>
      ) : (
        <>
          {(
            [
              ['today', '今日やること', '期限が過ぎたもの・停止中・期限が近いもの・優先度が高いもの', sections.today],
              ['week', '今週の作業', '今週に予定がかかっている作業', sections.week],
              ['later', '今後の作業', 'まだ先の予定の作業', sections.later],
            ] as const
          ).map(([key, title, sub, list]) =>
            list.length === 0 ? null : (
              <section key={key} className="mw-sec" aria-label={title}>
                <h2 className="mw-sec__title">
                  {title}
                  <span className="count-pill">{list.length}</span>
                  <small>{sub}</small>
                </h2>
                <div className="wc-grid">
                  {list.map((item) => (
                    <WorkCard
                      key={`${item.id}:${item.etcHours}:${item.progress}:${item.status}`}
                      item={item}
                      result={results[item.id]}
                      onSaved={(id, r) => {
                        setPinned((p) => new Set(p).add(id))
                        setResults((prev) => ({ ...prev, [id]: r }))
                      }}
                    />
                  ))}
                </div>
              </section>
            ),
          )}
        </>
      )}

      {todayEntries.length > 0 && (
        <Card title="今日の入力履歴" subtitle="誤入力は × で取り消せます（実績も元に戻ります）" className="mywork__log">
          <ul className="log">
            {todayEntries.map((e) => (
              <li key={e.id}>
                <b>{fmtNum(e.hours)}h</b>
                <span className="log__task">
                  {derived.projectById.get(derived.idx.byId.get(e.wbsId)?.projectId ?? '')?.name} / {derived.idx.byId.get(e.wbsId)?.title ?? '（削除済み）'}
                </span>
                <span className="log__comment">{e.comment}</span>
                <button type="button" className="icon-btn icon-btn--sm" onClick={() => actions.deleteEntry(e.id)} aria-label="この入力を取り消す">
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mywork__summary" role="status" aria-label="入力サマリー">
        <div className="sum">
          <span>今日入力した合計工数</span>
          <b>{fmtNum(todayHours)}<i>h</i></b>
          <small>{todayEntries.length}件</small>
        </div>
        <div className="sum">
          <span>今週の累計工数</span>
          <b>{fmtNum(weekHours)}<i>h</i></b>
          <small>
            稼働 {me.weeklyCapacity}h 中 {Math.round((weekHours / me.weeklyCapacity) * 100)}%
          </small>
          <ProgressBar value={(weekHours / me.weeklyCapacity) * 100} size="sm" />
        </div>
        <div className="sum">
          <span>今週の予定（残り時間の配分）</span>
          <b>{fmtNum(weekPlanned)}<i>h</i></b>
          <small>負荷 {Math.round((weekPlanned / me.weeklyCapacity) * 100)}%</small>
        </div>
        <div className={cx('sum', overdueCount > 0 && 'sum--warn')}>
          <span>期限を過ぎた作業</span>
          <b>{overdueCount}<i>件</i></b>
          <small>{overdueCount > 0 ? '終了日や残りの見直しを' : 'ありません'}</small>
        </div>
        <div className={cx('sum', blockedCount > 0 && 'sum--warn')}>
          <span>停止中の作業</span>
          <b>{blockedCount}<i>件</i></b>
          <small>{blockedCount > 0 ? 'リーダーへ相談しましょう' : 'ありません'}</small>
        </div>
      </div>
    </div>
  )
}
