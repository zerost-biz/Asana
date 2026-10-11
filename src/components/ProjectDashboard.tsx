import { Check, Flag } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { isOverdue, type Metrics } from '../domain/calculations'
import { daysBetween, fmtMD } from '../domain/dates'
import { fmtDays, fmtNum, fmtPct, fmtSignedH, fmtSignedYen, fmtYen, fmtYenShort } from '../domain/format'
import type { Health, WbsItem } from '../domain/types'
import { useApp } from '../store/AppContext'
import { Card } from './Card'
import { useProjectDialog } from './ProjectDialogHost'
import { KpiCard } from './KpiCard'
import { ProgressBar } from './ProgressBar'
import { HealthBadge, WbsStatusBadge } from './StatusBadge'
import { Avatar } from './Avatar'
import { cx } from './cx'

/** プロジェクト単位の Dashboard タブ */
export function ProjectDashboard({ projectId }: { projectId: string }) {
  const { data, derived, actions } = useApp()
  const navigate = useNavigate()
  const { openEdit } = useProjectDialog()
  const summary = derived.summaryById.get(projectId)
  if (!summary) return null
  const { project, totals, health, cost } = summary
  const { idx, metrics, todayISO } = derived

  const phases = (idx.topOf.get(projectId) ?? []).map((t) => ({ item: t, m: metrics.get(t.id) as Metrics }))
  const scaleMax = Math.max(1, ...phases.map((p) => Math.max(p.m.plan, p.m.eac))) * 1.08

  const leaves = derived.leaves.filter((l) => l.projectId === projectId)
  const watchList: { item: WbsItem; m: Metrics; why: string[] }[] = leaves
    .map((item) => {
      const m = metrics.get(item.id) as Metrics
      const why: string[] = []
      if (item.status === 'blocked') why.push('停止中')
      if (isOverdue(item.status, item.endDate, todayISO)) why.push(`遅延 ${daysBetween(item.endDate, todayISO)}日`)
      if (item.status !== 'done' && m.variance >= 4) why.push(`見込み ${fmtSignedH(m.variance)}`)
      return { item, m, why }
    })
    .filter((x) => x.why.length > 0)
    .sort((a, b) => b.why.length - a.why.length || b.m.variance - a.m.variance)
    .slice(0, 6)

  const risks = data.risks.filter((r) => r.projectId === projectId)

  // メンバー別の人件費（ACT は入力者、PLAN/ETC は担当者の単価）
  const memberRows = (() => {
    type Row = { id: string | null; actH: number; actCost: number; etcH: number; etcCost: number }
    const rows = new Map<string, Row>()
    const get = (id: string | null) => {
      const k = id ?? '_none'
      const r = rows.get(k) ?? { id, actH: 0, actCost: 0, etcH: 0, etcCost: 0 }
      rows.set(k, r)
      return r
    }
    const ids = new Set(leaves.map((l) => l.id))
    for (const e of data.timeEntries) {
      if (!ids.has(e.wbsId)) continue
      const r = get(e.userId)
      r.actH += e.hours
      r.actCost += e.hours * derived.rateOf(e.userId)
    }
    for (const l of leaves) {
      if (l.status === 'done' && l.etcHours === 0) continue
      const r = get(l.ownerId)
      r.etcH += l.etcHours
      r.etcCost += l.etcHours * derived.rateOf(l.ownerId)
    }
    return [...rows.values()].sort((a, b) => b.actCost + b.etcCost - (a.actCost + a.etcCost))
  })()
  const costScale = Math.max(1, totals.eacCost, cost.budget ?? 0) * 1.05
  const gap = totals.progress - (totals.burn ?? 0) * 100
  const burnPct = (totals.burn ?? 0) * 100

  return (
    <div className="pdash">
      <div className="kpi-grid kpi-grid--5">
        <KpiCard label="計画" value={fmtNum(totals.plan)} unit="h" sub="最初に見積もった時間の合計" />
        <KpiCard label="実績" value={fmtNum(totals.act)} unit="h" sub={`消化率 ${fmtPct(totals.burn)}`} />
        <KpiCard label="残り" value={fmtNum(totals.etc)} unit="h" sub="完了まで、あと何時間かかるか" />
        <KpiCard label="見込み（完了時）" value={fmtNum(totals.eac)} unit="h" sub="実績 + 残り" />
        <KpiCard
          label="差異（見込み − 計画）"
          value={fmtSignedH(totals.variance).replace('h', '')}
          unit="h"
          tone={totals.variance > 0 ? 'attention' : totals.variance < 0 ? 'good' : 'default'}
          sub={totals.plan > 0 ? `計画の ${totals.variance >= 0 ? '+' : ''}${Math.round((totals.variance / totals.plan) * 100)}%` : undefined}
        />
      </div>

      <Card
        title="人件費（原価）と粗利"
        subtitle="作業時間 × 時間単価。実績は入力した人の単価、残りと計画は担当者の単価で計算（単価は 設定 → メンバーと単価）"
        action={
          <button type="button" className="link-btn" onClick={() => openEdit(projectId)}>
            {cost.budget === null ? '受注額を設定' : '受注額を変更'}
          </button>
        }
        className="pdash__cost"
      >
        <div className="ctiles">
          <div className="ctile">
            <span>受注額・予算</span>
            <b>{cost.budget === null ? '未設定' : fmtYen(cost.budget)}</b>
            <small>{cost.budget === null ? '設定すると粗利を計算します' : '契約・予算'}</small>
          </div>
          <div className="ctile">
            <span>計画の人件費</span>
            <b>{fmtYen(totals.planCost)}</b>
            <small>{fmtNum(totals.plan)}h ＝ {fmtDays(totals.plan)}</small>
          </div>
          <div className="ctile">
            <span>実績の人件費</span>
            <b>{fmtYen(totals.actCost)}</b>
            <small>{fmtNum(totals.act)}h ＝ {fmtDays(totals.act)}</small>
          </div>
          <div className="ctile ctile--strong">
            <span>見込みの人件費</span>
            <b>{fmtYen(totals.eacCost)}</b>
            <small>{fmtNum(totals.eac)}h ＝ {fmtDays(totals.eac)}</small>
          </div>
          <div className={cx('ctile', totals.varianceCost > 0 && 'ctile--warn')}>
            <span>人件費の差異（見込み − 計画）</span>
            <b>{fmtSignedYen(totals.varianceCost)}</b>
            <small>{totals.planCost > 0 ? `計画の人件費の ${totals.varianceCost >= 0 ? '+' : ''}${Math.round((totals.varianceCost / totals.planCost) * 100)}%` : ' '}</small>
          </div>
          <div className={cx('ctile', cost.marginRate !== null && cost.marginRate < 0.1 && 'ctile--warn')}>
            <span>見込み粗利</span>
            <b>{cost.margin === null ? '—' : fmtSignedYen(cost.margin)}</b>
            <small>
              {cost.marginRate === null
                ? '受注額が未設定'
                : `粗利率 ${Math.round(cost.marginRate * 100)}%（計画では ${Math.round(((cost.planMargin ?? 0) / (cost.budget ?? 1)) * 100)}%）`}
            </small>
          </div>
        </div>

        <div className="margin" aria-label="受注額とコストの内訳">
          <div className="margin__bar">
            <span className="margin__act" style={{ width: `${(totals.actCost / costScale) * 100}%` }} />
            <span
              className="margin__etc"
              style={{ left: `${(totals.actCost / costScale) * 100}%`, width: `${(totals.etcCost / costScale) * 100}%` }}
            />
            {cost.margin !== null && cost.margin > 0 && (
              <span
                className="margin__profit"
                style={{ left: `${(totals.eacCost / costScale) * 100}%`, width: `${(cost.margin / costScale) * 100}%` }}
              />
            )}
            {cost.budget !== null && (
              <span className="margin__budget" style={{ left: `${(cost.budget / costScale) * 100}%` }} title={`受注額 ${fmtYen(cost.budget)}`} />
            )}
            <span className="margin__plan" style={{ left: `${(totals.planCost / costScale) * 100}%` }} title={`計画の人件費 ${fmtYen(totals.planCost)}`} />
          </div>
          <div className="margin__legend">
            <span><i className="lg lg--act" />実績の人件費 {fmtYenShort(totals.actCost)}</span>
            <span><i className="lg lg--etc" />残りの人件費 {fmtYenShort(totals.etcCost)}</span>
            {cost.margin !== null && cost.margin > 0 && <span><i className="lg lg--profit" />粗利 {fmtYenShort(cost.margin)}</span>}
            <span><i className="lg lg--plan" />計画の人件費の位置</span>
            {cost.budget !== null && <span><i className="lg lg--budget" />受注額の位置</span>}
          </div>
        </div>

        <div className="members members--cost" role="table" aria-label="メンバー別の人件費">
          <div className="members__row members__row--head" role="row">
            <span>メンバー</span>
            <span className="num">時間単価（円）</span>
            <span className="num">実績（h）</span>
            <span className="num">実績の人件費</span>
            <span className="num">残り（h）</span>
            <span className="num">残りの人件費</span>
            <span className="num">見込みの人件費</span>
          </div>
          {memberRows.map((r) => {
            const u = r.id ? derived.userById.get(r.id) : undefined
            return (
              <div key={r.id ?? 'none'} className="members__row" role="row">
                <span className="members__name">
                  <Avatar user={u} size="sm" />
                  {u?.name ?? '担当未設定'}
                </span>
                <span className="num">{Math.round(derived.rateOf(r.id)).toLocaleString('ja-JP')}</span>
                <span className="num">{fmtNum(r.actH)}</span>
                <span className="num">{fmtYen(r.actCost)}</span>
                <span className="num">{fmtNum(r.etcH)}</span>
                <span className="num">{fmtYen(r.etcCost)}</span>
                <span className="num num--strong">{fmtYen(r.actCost + r.etcCost)}</span>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="pdash__grid">
        <Card title="進捗 と 工数消化" subtitle="進捗が工数消化を下回ると、手戻り・見積り不足のサイン">
          <div className="gap">
            <div className="gap__row">
              <span>進捗（計画時間で加重）</span>
              <ProgressBar value={totals.progress} size="lg" tone="good" />
              <b>{Math.round(totals.progress)}%</b>
            </div>
            <div className="gap__row">
              <span>工数消化（実績 ÷ 計画）</span>
              <ProgressBar value={burnPct} size="lg" tone={gap < -5 ? 'watch' : 'accent'} />
              <b>{Math.round(burnPct)}%</b>
            </div>
            <p className={cx('gap__note', gap < -5 && 'is-warn')}>
              {gap >= 5
                ? `進捗が工数消化を ${Math.round(gap)}pt 上回っています（順調）`
                : gap > -5
                  ? '進捗と工数消化はほぼ一致しています'
                  : `工数消化が進捗を ${Math.round(-gap)}pt 上回っています。「残り」の見直しをおすすめします`}
            </p>
          </div>
        </Card>

        <Card
          title="状態の判定"
          subtitle="時間の超過・遅延・停止中・未解決のリスクから自動で判定します（手動で変更も可）"
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
              <option value="GOOD">手動: 順調</option>
              <option value="WATCH">手動: 注意</option>
              <option value="RISK">手動: 危険</option>
            </select>
          </label>
        </Card>

        <Card title="フェーズ別の工数" subtitle="■ 実績　■ 残り　┃ 計画の位置" className="pdash__wide">
          <div className="bullets">
            {phases.map(({ item, m }) => (
              <div key={item.id} className="bullets__row">
                <div className="bullets__name">
                  <strong>
                    {derived.numbers.get(item.id)} {item.title}
                  </strong>
                  <span>
                    計画 {fmtNum(m.plan)}h → 見込み {fmtNum(m.eac)}h
                  </span>
                </div>
                <div className="bullets__bar">
                  <span className="bullets__act" style={{ width: `${(m.act / scaleMax) * 100}%` }} />
                  <span className="bullets__etc" style={{ left: `${(m.act / scaleMax) * 100}%`, width: `${(m.etc / scaleMax) * 100}%` }} />
                  <span className="bullets__plan" style={{ left: `${(m.plan / scaleMax) * 100}%` }} title={`計画 ${fmtNum(m.plan)}h`} />
                </div>
                <b className={cx('bullets__var', m.variance > 0 && 'is-over')}>{fmtSignedH(m.variance)}</b>
                <span className="bullets__pct">{Math.round(m.progress)}%</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="要注意タスク" subtitle="停止中・遅延・時間超過のタスク">
          {watchList.length === 0 ? (
            <div className="empty">要注意タスクはありません</div>
          ) : (
            <ul className="watch">
              {watchList.map(({ item, m, why }) => (
                <li key={item.id}>
                  <button type="button" onClick={() => navigate(`/projects/${projectId}/wbs?task=${item.id}`)}>
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

        <Card title="リスク" subtitle="解決済みにすると、状態の判定と「要判断」から外れます">
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
