import { Flag, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RISK_STATUS_LABEL, SEVERITY_LABEL, type Risk, type RiskSeverity, type RiskStatus } from '../domain/types'
import { fmtMD } from '../domain/dates'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { Card } from './Card'
import { useToast } from './Toast'
import { cx } from './cx'

const SEVERITIES: RiskSeverity[] = ['high', 'medium', 'low']
const STATUSES: RiskStatus[] = ['open', 'mitigating', 'closed']

/** プロジェクトの「リスク」タブ。リスク（まだ起きていない）と課題（すでに起きている）を管理する */
export function RisksView({ projectId }: { projectId: string }) {
  const { data, derived, actions, can } = useApp()
  const { toast } = useToast()
  const project = derived.projectById.get(projectId)
  const editable = can('risk.edit', { project })
  const [showClosed, setShowClosed] = useState(false)
  const [draft, setDraft] = useState<{ kind: Risk['kind']; title: string; severity: RiskSeverity; probability: RiskSeverity; ownerId: string; wbsId: string }>({
    kind: 'risk',
    title: '',
    severity: 'medium',
    probability: 'medium',
    ownerId: project?.ownerId ?? '',
    wbsId: '',
  })

  if (!project) return null
  const all = data.risks.filter((r) => r.projectId === projectId)
  const open = all.filter((r) => r.status !== 'closed')
  const closed = all.filter((r) => r.status === 'closed')
  const shown = showClosed ? all : open
  const leaves = derived.leaves.filter((l) => l.projectId === projectId && l.type !== 'milestone')

  const add = () => {
    if (!draft.title.trim()) return
    actions.addRisk({
      projectId,
      kind: draft.kind,
      title: draft.title.trim(),
      severity: draft.severity,
      probability: draft.probability,
      ownerId: draft.ownerId || undefined,
      wbsId: draft.wbsId || undefined,
      status: 'open',
    })
    toast(`${draft.kind === 'risk' ? 'リスク' : '課題'}を追加しました`)
    setDraft((d) => ({ ...d, title: '', wbsId: '' }))
  }

  return (
    <div className="risksview">
      <Card
        title="リスク・課題"
        subtitle="リスク = まだ起きていない心配ごと / 課題 = すでに起きている問題。重大（高）で未解決のものは「要判断」に出ます"
        action={
          <label className="check">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            解決済み（{closed.length}件）も表示
          </label>
        }
        flush
      >
        {shown.length === 0 ? (
          <div className="empty">未解決のリスク・課題はありません</div>
        ) : (
          <div className="rtable" role="table">
            <div className="rtable__row rtable__row--head" role="row">
              <span>種別</span>
              <span>内容</span>
              <span>重大度</span>
              <span>起きやすさ</span>
              <span>担当</span>
              <span>関連する作業</span>
              <span>状態</span>
              <span />
            </div>
            {shown.map((r) => {
              const owner = r.ownerId ? derived.userById.get(r.ownerId) : undefined
              const wbs = r.wbsId ? derived.idx.byId.get(r.wbsId) : undefined
              return (
                <div key={r.id} className={cx('rtable__row', r.status === 'closed' && 'is-closed')} role="row">
                  <span className={cx('chip', r.kind === 'issue' && 'chip--warn')}>{r.kind === 'risk' ? 'リスク' : '課題'}</span>
                  <span className="rtable__title">
                    <Flag size={13} className={`sev-ic sev-ic--${r.severity}`} />
                    {editable ? (
                      <input
                        className="input input--bare"
                        value={r.title}
                        onChange={(e) => actions.updateRisk(r.id, { title: e.target.value })}
                        aria-label="内容"
                      />
                    ) : (
                      r.title
                    )}
                  </span>
                  <span>
                    <select
                      className="input input--sm"
                      value={r.severity}
                      disabled={!editable}
                      onChange={(e) => actions.updateRisk(r.id, { severity: e.target.value as RiskSeverity })}
                      aria-label="重大度"
                    >
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>
                      ))}
                    </select>
                  </span>
                  <span>
                    <select
                      className="input input--sm"
                      value={r.probability}
                      disabled={!editable}
                      onChange={(e) => actions.updateRisk(r.id, { probability: e.target.value as RiskSeverity })}
                      aria-label="起きやすさ"
                    >
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>
                      ))}
                    </select>
                  </span>
                  <span className="rtable__owner">
                    <Avatar user={owner} size="sm" />
                    <select
                      className="input input--sm"
                      value={r.ownerId ?? ''}
                      disabled={!editable}
                      onChange={(e) => actions.updateRisk(r.id, { ownerId: e.target.value || undefined })}
                      aria-label="担当"
                    >
                      <option value="">未設定</option>
                      {derived.activeUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </span>
                  <span className="rtable__wbs">
                    {wbs ? (
                      <Link className="link-btn" to={`/projects/${projectId}/wbs?task=${wbs.id}`}>
                        {derived.numbers.get(wbs.id)} {wbs.title}
                      </Link>
                    ) : (
                      <small>—</small>
                    )}
                  </span>
                  <span>
                    <select
                      className="input input--sm"
                      value={r.status}
                      disabled={!editable}
                      onChange={(e) => actions.updateRisk(r.id, { status: e.target.value as RiskStatus })}
                      aria-label="状態"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{RISK_STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                    <small className="rtable__date">{fmtMD(r.createdAt)} 登録</small>
                  </span>
                  <span>
                    {editable && (
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        aria-label="削除"
                        title="削除"
                        onClick={() => {
                          actions.deleteRisk(r.id)
                          toast('削除しました', 'info')
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {editable ? (
        <Card title="リスク・課題を追加">
          <form
            className="risksview__form"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <label className="field">
              <span className="field__label">種別</span>
              <select className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Risk['kind'] })}>
                <option value="risk">リスク（まだ起きていない）</option>
                <option value="issue">課題（すでに起きている）</option>
              </select>
            </label>
            <label className="field risksview__title">
              <span className="field__label">内容</span>
              <input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="例: 顧客側のデータ提供が遅れる可能性" />
            </label>
            <label className="field">
              <span className="field__label">重大度</span>
              <select className="input" value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value as RiskSeverity })}>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">起きやすさ</span>
              <select className="input" value={draft.probability} onChange={(e) => setDraft({ ...draft, probability: e.target.value as RiskSeverity })}>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">担当</span>
              <select className="input" value={draft.ownerId} onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}>
                <option value="">未設定</option>
                {derived.activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">関連する作業（任意）</span>
              <select className="input" value={draft.wbsId} onChange={(e) => setDraft({ ...draft, wbsId: e.target.value })}>
                <option value="">なし</option>
                {leaves.map((l) => (
                  <option key={l.id} value={l.id}>{derived.numbers.get(l.id)} {l.title}</option>
                ))}
              </select>
            </label>
            <div className="risksview__go">
              <button type="submit" className="btn btn--primary" disabled={!draft.title.trim()}>
                <Plus size={16} />
                追加
              </button>
            </div>
          </form>
        </Card>
      ) : (
        <p className="hint">リスクの編集は、このプロジェクトのリーダー、または課長以上の権限が必要です。</p>
      )}
    </div>
  )
}
