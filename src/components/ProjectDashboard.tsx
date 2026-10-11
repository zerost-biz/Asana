import { Check, Flag } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { isOverdue, type Metrics } from '../domain/calculations'
import { daysBetween, fmtMD } from '../domain/dates'
import { fmtNum, fmtPct, fmtSignedH } from '../domain/format'
import type { Health, WbsItem } from '../domain/types'
import { useApp } from '../store/AppContext'
import { Card } from './Card'
import { KpiCard } from './KpiCard'
import { ProgressBar } from './ProgressBar'
import { HealthBadge, WbsStatusBadge } from './StatusBadge'
import { Avatar } from './Avatar'
import { cx } from './cx'

/** プロジェクト単位の Dashboard タブ */
export function ProjectDashboard({ projectId }: { projectId: string }) {
  const { data, derived, actions } = useApp()
  const navigate = useNavigate()
  const summary = derived.summaryById.get(projectId)
  if (!summary) return null
  const { project, totals, health } = summary
  const { idx, metrics, todayISO } = derived

  const phases = (idx.topOf.get(projectId) ?? []).map((t) => ({ item: t, m: metrics.get(t.id) as Metrics }))
  const scaleMax = Math.max(1, ...phases.map((p) => Math.max(p.m.plan, p.m.eac))) * 1.08

  const leaves = derived.leaves.filter((l) => l.projectId === projectId)
  const watchList: { item: WbsItem; m: Metrics; why: string[] }[] = leaves
    .map((item) => {
      const m = metrics.get(item.id) as Metrics
      const why: string[] = []
      if (item.status === 'Blocked') why.push('Blocked')
      if (isOverdue(item.status, item.endDate, todayISO)) why.push(`遅延 ${daysBetween(item.endDate, todayISO)}日`)
      if (item.status !== 'Done' && m.variance >= 4) why.push(`EAC ${fmtSignedH(m.variance)}`)
      return { item, m, why }
    })
    .filter((x) => x.why.length > 0)
    .sort((a, b) => b.why.length - a.why.length || b.m.variance - a.m.variance)
    .slice(0, 6)

  const risks = data.risks.filter((r) => r.projectId === projectId)
  const gap = totals.progress - (totals.burn ?? 0) * 100
  const burnPct = (totals.burn ?? 0) * 100

  return (
    <div className="pdash">
      <div className="kpi-grid kpi-grid--5">
        <KpiCard label="PLAN（計画）" value={fmtNum(totals.plan)} unit="h" sub="計画工数の合計" />
        <KpiCard label="ACT（実績）" value={fmtNum(totals.act)} unit="h" sub={`消化率 ${fmtPct(totals.burn)}`} />
        <KpiCard label="ETC（残工数）" value={fmtNum(totals.etc)} unit="h" sub="入力された残り見込み" />
        <KpiCard label="EAC（完了時見込み）" value={fmtNum(totals.eac)} unit="h" sub="ACT + ETC" />
        <KpiCard
          label="差異（EAC − PLAN）"
          value={fmtSignedH(totals.variance).replace('h', '')}
          unit="h"
          tone={totals.variance > 0 ? 'attention' : totals.variance < 0 ? 'good' : 'default'}
          sub={totals.plan > 0 ? `PLANの ${totals.variance >= 0 ? '+' : ''}${Math.round((totals.variance / totals.plan) * 100)}%` : undefined}
        />
      </div>

      <div className="pdash__grid">
        <Card title="進捗 と 工数消化" subtitle="進捗が工数消化を下回ると、手戻り・見積り不足のサイン">
          <div className="gap">
            <div className="gap__row">
              <span>進捗（PLAN加重）</span>
              <ProgressBar value={totals.progress} size="lg" tone="good" />
              <b>{Math.round(totals.progress)}%</b>
            </div>
            <div className="gap__row">
              <span>工数消化（ACT / PLAN）</span>
              <ProgressBar value={burnPct} size="lg" tone={gap < -5 ? 'watch' : 'accent'} />
              <b>{Math.round(burnPct)}%</b>
            </div>
            <p className={cx('gap__note', gap < -5 && 'is-warn')}>
              {gap >= 5
                ? `進捗が工数消化を ${Math.round(gap)}pt 上回っています（順調）`
                : gap > -5
                  ? '進捗と工数消化はほぼ一致しています'
                  : `工数消化が進捗を ${Math.round(-gap)}pt 上回っています。ETCの再見積りを推奨`}
            </p>
          </div>
        </Card>

        <Card
          title="Health 判定"
          subtitle="EAC差異・遅延・Blocked・未解決リスクから自動判定（手動で上書きも可）"
          action={<HealthBadge health={health.health} />}
        >
          <ul className="reasons">
            {health.reasons.length === 0 && <li>大きな懸念はありません</li>}
            {health.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <label className="health-set">
            <span>判定方法</span>
            <select
              className="input"
              value={project.health ?? 'AUTO'}
              onChange={(e) => {
                const v = e.target.value
                actions.updateProject(project.id, { health: v === 'AUTO' ? null : (v as Health) })
              }}
            >
              <option value="AUTO">自動（現在: {health.auto}）</option>
              <option value="GOOD">手動: GOOD</option>
              <option value="WATCH">手動: WATCH</option>
              <option value="RISK">手動: RISK</option>
            </select>
          </label>
        </Card>

        <Card title="フェーズ別の工数" subtitle="■ ACT（実績） ■ ETC（残） ┃ PLAN（計画線）" className="pdash__wide">
          <div className="bullets">
            {phases.map(({ item, m }) => (
              <div key={item.id} className="bullets__row">
                <div className="bullets__name">
                  <strong>
                    {derived.numbers.get(item.id)} {item.title}
                  </strong>
                  <span>
                    PLAN {fmtNum(m.plan)}h → EAC {fmtNum(m.eac)}h
                  </span>
                </div>
                <div className="bullets__bar">
                  <span className="bullets__act" style={{ width: `${(m.act / scaleMax) * 100}%` }} />
                  <span className="bullets__etc" style={{ left: `${(m.act / scaleMax) * 100}%`, width: `${(m.etc / scaleMax) * 100}%` }} />
                  <span className="bullets__plan" style={{ left: `${(m.plan / scaleMax) * 100}%` }} title={`PLAN ${fmtNum(m.plan)}h`} />
                </div>
                <b className={cx('bullets__var', m.variance > 0 && 'is-over')}>{fmtSignedH(m.variance)}</b>
                <span className="bullets__pct">{Math.round(m.progress)}%</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="要注意タスク" subtitle="Blocked・遅延・EAC超過のタスク">
          {watchList.length === 0 ? (
            <div className="empty">要注意タスクはありません</div>
          ) : (
            <ul className="watch">
              {watchList.map(({ item, m, why }) => (
                <li key={item.id}>
                  <button type="button" onClick={() => navigate(`/projects/${projectId}?task=${item.id}`)}>
                    <Avatar user={item.ownerId ? derived.userById.get(item.ownerId) : null} size="sm" />
                    <span className="watch__title">
                      <strong>
                        {derived.numbers.get(item.id)} {item.title}
                      </strong>
                      <span>{why.join(' · ')} ／ 期限 {fmtMD(m.endDate)}</span>
                    </span>
                    <WbsStatusBadge status={item.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="リスク" subtitle="解決済みにすると Health・要判断から外れます">
          {risks.length === 0 ? (
            <div className="empty">登録されたリスクはありません</div>
          ) : (
            <ul className="risks">
              {risks.map((r) => (
                <li key={r.id} className={cx(r.status === 'closed' && 'is-closed')}>
                  <span className={cx('sev', `sev--${r.severity}`)}>
                    <Flag size={12} />
                    {r.severity === 'high' ? '高' : r.severity === 'medium' ? '中' : '低'}
                  </span>
                  <span className="risks__title">{r.title}</span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => actions.updateRisk(r.id, { status: r.status === 'closed' ? 'open' : 'closed' })}
                  >
                    {r.status === 'closed' ? (
                      '再オープン'
                    ) : (
                      <>
                        <Check size={14} />
                        解決済み
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
