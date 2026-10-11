import { CheckCircle2, X } from 'lucide-react'
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
    () => derived.leaves.filter((l) => l.ownerId === me.id && (l.status !== 'Done' || pinned.has(l.id))),
    [derived.leaves, me.id, pinned],
  )
  const projectsOfMine = useMemo(() => Array.from(new Set(mine.map((l) => l.projectId))), [mine])

  const tasks = useMemo(() => {
    const list = mine.filter((l) => projectFilter === 'all' || l.projectId === projectFilter)
    const rank = (l: (typeof list)[number]) => (l.status === 'Done' ? 3 : l.endDate < todayISO ? 0 : l.status === 'Blocked' ? 1 : 2)
    return [...list].sort((a, b) => rank(a) - rank(b) || (a.endDate < b.endDate ? -1 : a.endDate > b.endDate ? 1 : 0))
  }, [mine, projectFilter, todayISO])

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
        title="My Work"
        sub={`${fmtFull(today)}  ·  ${me.name}が担当する未完了タスク ${mine.filter((l) => l.status !== 'Done').length}件`}
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
        <div className="wc-grid">
          {tasks.map((item) => (
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
      )}

      {todayEntries.length > 0 && (
        <Card title="今日の入力履歴" subtitle="誤入力は × で取り消せます（ACT も戻ります）" className="mywork__log">
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
          <span>今週の予定（ETC配分）</span>
          <b>{fmtNum(weekPlanned)}<i>h</i></b>
          <small>負荷 {Math.round((weekPlanned / me.weeklyCapacity) * 100)}%</small>
        </div>
      </div>
    </div>
  )
}
