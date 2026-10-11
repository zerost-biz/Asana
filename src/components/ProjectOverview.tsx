import { CalendarClock, ChevronRight, Diamond, Flag, History, Pencil } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { roleGapsForProject } from '../domain/pipeline'
import { daysBetween, fmtDateTime, fmtMD } from '../domain/dates'
import { fmtNum, fmtYen } from '../domain/format'
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL, ROLE_LABEL, SEVERITY_LABEL, WBS_STATUS_LABEL } from '../domain/types'
import { cellOf, cellRatio } from '../domain/workload'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { Card } from './Card'
import { useProjectDialog } from './ProjectDialogHost'
import { cx } from './cx'

/** プロジェクトの「概要」タブ。基本情報・マイルストーン・メンバーの負荷・要判断・最近の更新 */
export function ProjectOverview({ projectId }: { projectId: string }) {
  const { data, derived, can } = useApp()
  const navigate = useNavigate()
  const { openEdit } = useProjectDialog()
  const summary = derived.summaryById.get(projectId)
  if (!summary) return null
  const { project, totals, cost, nextMilestone } = summary
  const { todayISO, userById, customerById } = derived
  const owner = userById.get(project.ownerId)
  const customer = customerById.get(project.customerId)
  const opp = project.opportunityId ? data.opportunities.find((o) => o.id === project.opportunityId) : undefined

  const projectOrders = data.internalOrders.filter((o) => o.projectId === projectId)
  const milestones = summary.leaves
    .filter((l) => l.type === 'milestone')
    .sort((a, b) => (a.endDate < b.endDate ? -1 : 1))
  const alerts = derived.alerts.filter((a) => a.to.startsWith(`/projects/${projectId}`) || a.id.endsWith(`:${projectId}`))
  const logs = data.activity.filter((l) => l.projectId === projectId).slice(-8).reverse()
  const gaps = project.status === 'planned' && project.roleNeeds.length > 0 ? roleGapsForProject(project, data.assignments, data.settings.baseCapacity) : []
  const shortage = gaps.filter((g) => g.gap > 1)

  return (
    <div className="ov">
      <div className="ov__main">
        <Card
          title="プロジェクト情報"
          action={
            can('project.edit', { project }) ? (
              <button type="button" className="link-btn" onClick={() => openEdit(projectId)}>
                <Pencil size={13} /> 編集
              </button>
            ) : undefined
          }
        >
          {project.description && <p className="ov__desc">{project.description}</p>}
          <dl className="ov__dl">
            <div>
              <dt>顧客</dt>
              <dd>{customer?.name ?? '—'}{customer?.industry ? <small>（{customer.industry}）</small> : null}</dd>
            </div>
            <div>
              <dt>リーダー</dt>
              <dd>
                <Avatar user={owner} size="sm" /> {owner?.name ?? '—'}
              </dd>
            </div>
            <div>
              <dt>期間</dt>
              <dd>{project.startDate} 〜 {project.endDate}</dd>
            </div>
            <div>
              <dt>状態</dt>
              <dd>{PROJECT_STATUS_LABEL[project.status]}（優先度 {PRIORITY_LABEL[project.priority]}）</dd>
            </div>
            <div>
              <dt>受注額</dt>
              <dd>
                {cost.budget === null ? '未設定' : fmtYen(cost.budget)}
                {cost.marginRate !== null && <small>（見込み粗利率 {Math.round(cost.marginRate * 100)}%）</small>}
              </dd>
            </div>
            <div>
              <dt>工数</dt>
              <dd>
                計画 {fmtNum(totals.plan)}h / 実績 {fmtNum(totals.act)}h / 見込み {fmtNum(totals.eac)}h
              </dd>
            </div>
            <div>
              <dt>社内オーダー</dt>
              <dd>
                {projectOrders.length > 0 ? (
                  projectOrders.map((o) => (
                    <span key={o.id} className={cx('chip', o.status === 'closed' && 'chip--warn')} title={`${o.name}${o.status === 'closed' ? '（終了）' : ''}`}>
                      {o.code}
                    </span>
                  ))
                ) : (
                  <Link className="link-btn" to={`/projects/${projectId}/orders`}>
                    登録する
                  </Link>
                )}
              </dd>
            </div>
            {opp && (
              <div>
                <dt>元の案件</dt>
                <dd>
                  <Link className="link-btn" to={`/pipeline/${opp.id}`}>{opp.title}</Link>
                </dd>
              </div>
            )}
          </dl>
        </Card>

        <Card
          title="マイルストーン"
          subtitle="節目の日付。完了にすると「最近の成果」に載ります"
          action={
            <Link className="link-btn" to={`/projects/${projectId}/timeline`}>
              <CalendarClock size={13} /> タイムラインで見る
            </Link>
          }
        >
          {milestones.length === 0 ? (
            <div className="empty">マイルストーンがありません。「一覧」の「マイルストーンを追加」から登録できます。</div>
          ) : (
            <ul className="ms">
              {milestones.map((m) => {
                const late = m.status !== 'done' && m.endDate < todayISO
                const d = daysBetween(todayISO, m.endDate)
                return (
                  <li key={m.id} className={cx(m.status === 'done' && 'is-done', late && 'is-late')}>
                    <button type="button" onClick={() => navigate(`/projects/${projectId}/wbs?task=${m.id}`)}>
                      <Diamond size={14} className="ms__icon" />
                      <span className="ms__title">{m.title}</span>
                      <span className="ms__date">{fmtMD(m.endDate)}</span>
                      <span className="ms__rel">
                        {m.status === 'done' ? WBS_STATUS_LABEL.done : late ? `${-d}日遅れ` : d === 0 ? '今日' : `あと${d}日`}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {nextMilestone && (
            <p className="hint">
              次のマイルストーン: <b>{nextMilestone.title}</b>（{fmtMD(nextMilestone.date)}）
            </p>
          )}
        </Card>

        <Card title="最近の更新" subtitle="このプロジェクトの変更履歴（最新8件）">
          {logs.length === 0 ? (
            <div className="empty">更新履歴はまだありません</div>
          ) : (
            <ul className="log">
              {logs.map((l) => (
                <li key={l.id}>
                  <History size={13} />
                  <span className="log__time">{fmtDateTime(l.timestamp)}</span>
                  <span className="log__who">{userById.get(l.userId)?.name ?? l.userId}</span>
                  <span className="log__text">{l.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="ov__side">
        <Card title="要判断・注意" subtitle="このプロジェクトに関わる通知">
          {alerts.length === 0 ? (
            <div className="empty">現在、注意が必要な項目はありません</div>
          ) : (
            <ul className="dl">
              {alerts.map((a) => (
                <li key={a.id}>
                  <button type="button" className={cx('dl__item', `dl__item--${a.tone}`)} onClick={() => navigate(a.to)}>
                    <span className="dl__text">
                      <strong>{a.title}</strong>
                      <span>{a.detail}</span>
                    </span>
                    <ChevronRight size={16} className="dl__go" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="メンバーと今後の負荷"
          subtitle="全プロジェクト合算の負荷率（確定分）"
          action={
            <Link className="link-btn" to={`/projects/${projectId}/workload`}>
              詳しく見る
            </Link>
          }
        >
          <div className="ovm">
            <div className="ovm__row ovm__row--head">
              <span />
              {derived.workload.weeks.map((w) => (
                <span key={w.index}>{w.label}</span>
              ))}
            </div>
            {summary.memberIds.map((id) => {
              const u = userById.get(id)
              if (!u) return null
              return (
                <div key={id} className="ovm__row">
                  <span className="ovm__user">
                    <Avatar user={u} size="sm" />
                    <span>
                      {u.name}
                      <small>{id === project.ownerId ? 'リーダー' : ROLE_LABEL[u.role]}</small>
                    </span>
                  </span>
                  {derived.workload.weeks.map((w) => {
                    const c = cellOf(derived.workload, id, w.index)
                    return (
                      <span key={w.index} className={cx('wo__pill', `wo__pill--${c?.level ?? 'normal'}`)}>
                        {c ? Math.round(cellRatio(c, false) * 100) : 0}%
                      </span>
                    )
                  })}
                </div>
              )
            })}
          </div>
          {shortage.length > 0 && (
            <div className="notice-inline">
              必要人員に不足があります：{shortage.map((g) => g.role).join('・')}{' '}
              <Link className="link-btn" to={`/assignments?target=prj:${projectId}`}>
                配置を検討する
              </Link>
            </div>
          )}
        </Card>

        <Card
          title="リスク・課題"
          action={
            <Link className="link-btn" to={`/projects/${projectId}/risks`}>
              すべて見る
            </Link>
          }
        >
          {summary.openRisks.length === 0 ? (
            <div className="empty">未解決のリスク・課題はありません</div>
          ) : (
            <ul className="risks">
              {summary.openRisks.slice(0, 4).map((r) => (
                <li key={r.id}>
                  <span className={cx('sev', `sev--${r.severity}`)}>
                    <Flag size={12} />
                    {SEVERITY_LABEL[r.severity]}
                  </span>
                  <span className="risks__title">{r.title}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
