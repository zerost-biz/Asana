import { Flag, FolderPlus, LayoutGrid, Plus, Table2, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, AvatarStack } from '../components/Avatar'
import { PageHeader } from '../components/PageHeader'
import { useProjectDialog } from '../components/ProjectDialogHost'
import { ProgressBar } from '../components/ProgressBar'
import { HealthBadge } from '../components/StatusBadge'
import { cx } from '../components/cx'
import { addDays, daysBetween, fmtMD, toISO } from '../domain/dates'
import { fmtNum, fmtPct, fmtSignedH } from '../domain/format'
import { PROJECT_STATUS_LABEL, type Health, type ProjectStatus } from '../domain/types'
import { usePref } from '../hooks/usePref'
import type { ProjectSummary } from '../store/derived'
import { useApp } from '../store/AppContext'

type SortKey = 'health' | 'variance' | 'delay' | 'milestone' | 'burn'
const SORT_LABEL: Record<SortKey, string> = {
  health: '状態の悪い順',
  variance: '見込み差異が大きい順',
  delay: '遅延が大きい順',
  milestone: '次のマイルストーンが近い順',
  burn: '工数消化が大きい順',
}
const HEALTH_RANK: Record<Health, number> = { RISK: 0, WATCH: 1, GOOD: 2 }
const SHOW_HEALTH: ProjectStatus[] = ['active', 'planned', 'on_hold']

const maxOverdue = (s: ProjectSummary): number => s.overdue.reduce((m, o) => Math.max(m, o.days), 0)

/** プロジェクト一覧（ポートフォリオ）。複数プロジェクトを並べて、危険・遅延・人手不足を早く見つける */
export function ProjectsPage() {
  const { derived, data, can, today } = useApp()
  const { openCreate } = useProjectDialog()
  const [view, setView] = usePref<'table' | 'card'>('portfolio-view', 'table', ['table', 'card'])
  const [health, setHealth] = useState<'all' | Health>('all')
  const [owner, setOwner] = useState('all')
  const [customer, setCustomer] = useState('all')
  const [period, setPeriod] = useState<'all' | 'now' | 'month' | 'quarter'>('all')
  const [status, setStatus] = useState<'live' | 'all' | ProjectStatus>('live')
  const [sort, setSort] = useState<SortKey>('health')

  const todayISO = derived.todayISO
  const owners = useMemo(() => [...new Set(derived.summaries.map((s) => s.project.ownerId))].map((id) => derived.userById.get(id)).filter((u) => !!u), [derived])
  const customers = useMemo(() => [...new Set(derived.summaries.map((s) => s.project.customerId))].map((id) => derived.customerById.get(id)).filter((c) => !!c), [derived])

  const rows = useMemo(() => {
    const monthStart = toISO(new Date(today.getFullYear(), today.getMonth(), 1))
    const monthEnd = toISO(new Date(today.getFullYear(), today.getMonth() + 1, 0))
    const quarterEnd = toISO(addDays(today, 92))
    let list = derived.summaries.filter((s) => s.project.status !== 'archived' || status === 'archived' || status === 'all')
    list = list.filter((s) => {
      const p = s.project
      if (status === 'live' && !SHOW_HEALTH.includes(p.status)) return false
      if (status !== 'live' && status !== 'all' && p.status !== status) return false
      if (health !== 'all' && s.health.health !== health) return false
      if (owner !== 'all' && p.ownerId !== owner) return false
      if (customer !== 'all' && p.customerId !== customer) return false
      if (period === 'now' && !(p.startDate <= todayISO && p.endDate >= todayISO)) return false
      if (period === 'month' && !(p.startDate <= monthEnd && p.endDate >= monthStart)) return false
      if (period === 'quarter' && !(p.startDate <= quarterEnd && p.endDate >= todayISO)) return false
      return true
    })
    const cmp: Record<SortKey, (a: ProjectSummary, b: ProjectSummary) => number> = {
      health: (a, b) => HEALTH_RANK[a.health.health] - HEALTH_RANK[b.health.health] || b.totals.variance - a.totals.variance,
      variance: (a, b) => b.totals.variance - a.totals.variance,
      delay: (a, b) => maxOverdue(b) - maxOverdue(a) || b.overdue.length - a.overdue.length,
      milestone: (a, b) => (a.nextMilestone?.date ?? '9999-99-99').localeCompare(b.nextMilestone?.date ?? '9999-99-99'),
      burn: (a, b) => (b.totals.burn ?? 0) - (a.totals.burn ?? 0),
    }
    return [...list].sort(cmp[sort])
  }, [derived.summaries, health, owner, customer, period, status, sort, today, todayISO])

  const count = derived.summaries.length

  return (
    <div className="page page--wide">
      <PageHeader
        title="プロジェクト"
        sub={count > 0 ? `${rows.length} / ${count} 件を表示。行をクリックするとプロジェクトの概要を開きます` : 'まだプロジェクトがありません'}
        right={
          can('project.create') ? (
            <button type="button" className="btn btn--primary" onClick={openCreate}>
              <Plus size={16} />
              プロジェクトを追加
            </button>
          ) : undefined
        }
      />

      {count === 0 ? (
        <div className="empty empty--big">
          <FolderPlus size={28} />
          <p>最初のプロジェクトを追加しましょう。標準の作業テンプレートから、すぐに始められます。</p>
          {can('project.create') && (
            <button type="button" className="btn btn--primary" onClick={openCreate}>
              プロジェクトを追加
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="pf-filters" role="group" aria-label="絞り込みと並べ替え">
            <label>
              <span>状態</span>
              <select className="input input--sm" value={health} onChange={(e) => setHealth(e.target.value as 'all' | Health)}>
                <option value="all">すべて</option>
                <option value="RISK">危険</option>
                <option value="WATCH">注意</option>
                <option value="GOOD">順調</option>
              </select>
            </label>
            <label>
              <span>リーダー</span>
              <select className="input input--sm" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="all">すべて</option>
                {owners.map((u) => (
                  <option key={u!.id} value={u!.id}>
                    {u!.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>顧客</span>
              <select className="input input--sm" value={customer} onChange={(e) => setCustomer(e.target.value)}>
                <option value="all">すべて</option>
                {customers.map((c) => (
                  <option key={c!.id} value={c!.id}>
                    {c!.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>期間</span>
              <select className="input input--sm" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
                <option value="all">すべて</option>
                <option value="now">今日が期間内</option>
                <option value="month">今月にかかる</option>
                <option value="quarter">3か月以内にかかる</option>
              </select>
            </label>
            <label>
              <span>ステータス</span>
              <select className="input input--sm" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="live">進行中・計画中・保留</option>
                <option value="all">すべて</option>
                {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>並べ替え</span>
              <select className="input input--sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <div className="unit-toggle pf-filters__view" role="radiogroup" aria-label="表示形式">
              <button type="button" role="radio" aria-checked={view === 'table'} className={cx(view === 'table' && 'is-on')} onClick={() => setView('table')}>
                <Table2 size={14} /> 表
              </button>
              <button type="button" role="radio" aria-checked={view === 'card'} className={cx(view === 'card' && 'is-on')} onClick={() => setView('card')}>
                <LayoutGrid size={14} /> カード
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="empty empty--big">条件に合うプロジェクトはありません</div>
          ) : view === 'table' ? (
            <div className="pf card" role="table" aria-label="プロジェクト一覧">
              <div className="pf__scroll">
                <div className="pf__row pf__row--head" role="row">
                  <div role="columnheader">プロジェクト</div>
                  <div role="columnheader">リーダー</div>
                  <div role="columnheader">状態</div>
                  <div role="columnheader">進捗</div>
                  <div role="columnheader" title="実績 ÷ 計画">工数消化率</div>
                  <div role="columnheader" className="num">計画</div>
                  <div role="columnheader" className="num">実績</div>
                  <div role="columnheader" className="num">残り</div>
                  <div role="columnheader" className="num">見込み</div>
                  <div role="columnheader" className="num">差異</div>
                  <div role="columnheader">次のマイルストーン</div>
                  <div role="columnheader" className="num" title="未解決の重大（高）リスク・課題の数">重大リスク</div>
                  <div role="columnheader">メンバー</div>
                </div>
                {rows.map((s) => (
                  <PortfolioRow key={s.project.id} s={s} />
                ))}
              </div>
            </div>
          ) : (
            <div className="pf-cards">
              {rows.map((s) => (
                <PortfolioCard key={s.project.id} s={s} />
              ))}
            </div>
          )}
          <p className="hint">
            状態は、見込み差異・遅延・停止中・未解決の重大リスクから自動で判定します（プロジェクトの「ダッシュボード」で手動に切り替えられます）。一覧の人数は {data.users.filter((u) => u.status === 'active').length} 名中の関与メンバーです。
          </p>
        </>
      )}
    </div>
  )
}

function StatusCell({ s }: { s: ProjectSummary }) {
  if (SHOW_HEALTH.includes(s.project.status))
    return (
      <span className="pf__status">
        <HealthBadge health={s.health.health} size="sm" title={s.health.reasons.join(' / ') || '問題なし'} />
        {s.project.status !== 'active' && <small>{PROJECT_STATUS_LABEL[s.project.status]}</small>}
      </span>
    )
  return <span className="chip">{PROJECT_STATUS_LABEL[s.project.status]}</span>
}

function PortfolioRow({ s }: { s: ProjectSummary }) {
  const { derived } = useApp()
  const { project, totals } = s
  const owner = derived.userById.get(project.ownerId)
  const members = s.memberIds.map((id) => derived.userById.get(id)).filter((u) => !!u)
  const burn = (totals.burn ?? 0) * 100
  const ms = s.nextMilestone
  return (
    <Link to={`/projects/${project.id}`} className="pf__row" role="row">
      <div role="cell" className="pf__name">
        <strong>{project.name}</strong>
        <span>
          {s.customerName} · {fmtMD(project.startDate)}–{fmtMD(project.endDate)}
        </span>
      </div>
      <div role="cell" className="pf__owner">
        <Avatar user={owner} size="sm" />
        <span>{owner?.name}</span>
      </div>
      <div role="cell">
        <StatusCell s={s} />
      </div>
      <div role="cell" className="pf__bar">
        <b>{Math.round(totals.progress)}%</b>
        <ProgressBar value={totals.progress} size="sm" />
      </div>
      <div role="cell" className="pf__bar">
        <b>{fmtPct(totals.burn)}</b>
        <ProgressBar value={burn} size="sm" tone={burn > totals.progress + 10 ? 'watch' : 'muted'} />
      </div>
      <div role="cell" className="num">{fmtNum(totals.plan)}h</div>
      <div role="cell" className="num">{fmtNum(totals.act)}h</div>
      <div role="cell" className="num">{fmtNum(totals.etc)}h</div>
      <div role="cell" className="num num--strong">{fmtNum(totals.eac)}h</div>
      <div role="cell" className={cx('num', totals.variance > 0.05 && 'pf__over')}>
        {totals.variance > 0.05 && <TriangleAlert size={12} strokeWidth={2.4} />}
        {fmtSignedH(totals.variance)}
      </div>
      <div role="cell" className={cx('pf__ms', ms?.overdue && 'is-late')}>
        {ms ? (
          <>
            <b>{ms.title}</b>
            <span>
              {fmtMD(ms.date)}（{ms.overdue ? `${daysBetween(ms.date, derived.todayISO)}日遅れ` : `あと${daysBetween(derived.todayISO, ms.date)}日`}）
            </span>
          </>
        ) : (
          <span className="pf__dash">—</span>
        )}
      </div>
      <div role="cell" className={cx('num', s.highRiskCount > 0 && 'pf__risk')}>
        {s.highRiskCount > 0 ? (
          <>
            <Flag size={12} /> {s.highRiskCount}
          </>
        ) : (
          <span className="pf__dash">0</span>
        )}
      </div>
      <div role="cell">
        <AvatarStack users={members as NonNullable<(typeof members)[number]>[]} max={4} />
      </div>
    </Link>
  )
}

function PortfolioCard({ s }: { s: ProjectSummary }) {
  const { derived } = useApp()
  const { project, totals } = s
  const owner = derived.userById.get(project.ownerId)
  const members = s.memberIds.map((id) => derived.userById.get(id)).filter((u) => !!u)
  const ms = s.nextMilestone
  return (
    <Link to={`/projects/${project.id}`} className="pfc">
      <div className="pfc__head">
        <div>
          <strong>{project.name}</strong>
          <span>{s.customerName}</span>
        </div>
        <StatusCell s={s} />
      </div>
      <div className="pfc__bars">
        <div>
          <span>進捗</span>
          <b>{Math.round(totals.progress)}%</b>
          <ProgressBar value={totals.progress} size="sm" />
        </div>
        <div>
          <span>工数消化</span>
          <b>{fmtPct(totals.burn)}</b>
          <ProgressBar value={(totals.burn ?? 0) * 100} size="sm" tone="muted" />
        </div>
      </div>
      <dl className="pfc__kv">
        <div>
          <dt>計画</dt>
          <dd>{fmtNum(totals.plan)}h</dd>
        </div>
        <div>
          <dt>見込み</dt>
          <dd>{fmtNum(totals.eac)}h</dd>
        </div>
        <div className={cx(totals.variance > 0.05 && 'pf__over')}>
          <dt>差異</dt>
          <dd>{fmtSignedH(totals.variance)}</dd>
        </div>
        <div className={cx(s.highRiskCount > 0 && 'pf__risk')}>
          <dt>重大リスク</dt>
          <dd>{s.highRiskCount}件</dd>
        </div>
      </dl>
      <div className="pfc__foot">
        <span className={cx('pfc__ms', ms?.overdue && 'is-late')}>{ms ? `${ms.title} ${fmtMD(ms.date)}` : 'マイルストーンなし'}</span>
        <span className="pfc__people">
          <Avatar user={owner} size="sm" />
          <AvatarStack users={members as NonNullable<(typeof members)[number]>[]} max={3} />
        </span>
      </div>
    </Link>
  )
}
