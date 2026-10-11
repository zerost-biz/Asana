import { Flag, Settings2 } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { fmtMD } from '../domain/dates'
import { PROJECT_STATUS_LABEL } from '../domain/types'
import { useApp } from '../store/AppContext'
import { fmtNum, fmtPct, fmtSignedH, fmtYenShort } from '../domain/format'
import type { ProjectSummary } from '../store/derived'
import { useProjectDialog } from './ProjectDialogHost'
import { HealthBadge } from './StatusBadge'
import { cx } from './cx'

const TABS = [
  { to: '', label: '概要', end: true },
  { to: 'wbs', label: '一覧', end: false },
  { to: 'timeline', label: 'タイムライン', end: false },
  { to: 'dashboard', label: 'ダッシュボード', end: false },
  { to: 'workload', label: '稼働状況', end: false },
  { to: 'risks', label: 'リスク', end: false },
  { to: 'orders', label: '社内オーダー', end: false },
]

export function ProjectHeader({ summary }: { summary: ProjectSummary }) {
  const { project, totals, health, cost } = summary
  const { openEdit } = useProjectDialog()
  const { can } = useApp()
  const base = `/projects/${project.id}`
  const over = totals.variance > 0

  return (
    <div className="phead">
      <div className="phead__top">
        <div className="phead__title">
          <h1>{project.name}</h1>
          <HealthBadge health={health.health} title={health.reasons.join(' / ') || '問題なし'} />
          <span className="phead__period">
            {PROJECT_STATUS_LABEL[project.status]} · {fmtMD(project.startDate)} – {fmtMD(project.endDate)}
          </span>
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => openEdit(project.id)} title="プロジェクト設定（名称・期間・受注額・削除）" aria-label="プロジェクト設定">
            <Settings2 size={16} />
          </button>
        </div>

        <dl className="phead__stats" aria-label="プロジェクト工数サマリー">
          <div>
            <dt>進捗</dt>
            <dd>{fmtPct(totals.progress / 100)}</dd>
          </div>
          <div>
            <dt>計画</dt>
            <dd>{fmtNum(totals.plan)}h</dd>
          </div>
          <div>
            <dt>実績</dt>
            <dd>{fmtNum(totals.act)}h</dd>
          </div>
          <div>
            <dt>残り</dt>
            <dd>{fmtNum(totals.etc)}h</dd>
          </div>
          <div>
            <dt>見込み</dt>
            <dd>{fmtNum(totals.eac)}h</dd>
          </div>
          <div className={cx(over && 'is-over')}>
            <dt>差異</dt>
            <dd>{fmtSignedH(totals.variance)}</dd>
          </div>
          <div className="phead__stats-sep" aria-hidden="true" />
          <div title="見込みの人件費 = 実績の人件費 + 残り時間 × 担当者の単価">
            <dt>見込み人件費</dt>
            <dd>{fmtYenShort(totals.eacCost)}</dd>
          </div>
          {cost.marginRate !== null && (
            <div className={cx(cost.marginRate < 0.1 && 'is-over')} title="見込み粗利率 =（受注額 − 見込みの人件費）÷ 受注額">
              <dt>粗利率</dt>
              <dd>{Math.round(cost.marginRate * 100)}%</dd>
            </div>
          )}
        </dl>
        {can('close.edit', { project }) && project.status !== 'archived' && (
          <NavLink to={`${base}/close`} className="btn btn--ghost btn--sm" title="プロジェクトの完了処理（学び・経験の記録）">
            <Flag size={14} />
            完了処理
          </NavLink>
        )}
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <NavLink
            key={t.label}
            to={t.to ? `${base}/${t.to}` : base}
            end={t.end}
            role="tab"
            className={({ isActive }) => cx('tabs__tab', isActive && 'is-active')}
          >
            {t.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
