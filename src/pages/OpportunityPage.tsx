import { ArrowLeft, ClipboardCheck, History, Network, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Card } from '../components/Card'
import { CommitField } from '../components/CommitField'
import { PageHeader } from '../components/PageHeader'
import { ReasonDialog } from '../components/ReasonDialog'
import { useToast } from '../components/Toast'
import { cx } from '../components/cx'
import { fmtDateTime, fmtMD } from '../domain/dates'
import { fmtNum } from '../domain/format'
import { evaluateOpp, fmtManMonths, oppHours, roleGapsForOpp, STAGE_DEFAULT_PROB, weightedHours } from '../domain/pipeline'
import { OPP_STAGES, OPP_STAGE_LABEL, SKILL_LEVEL_LABEL, type Opportunity, type OppStage, type RoleDemand } from '../domain/types'
import { useApp } from '../store/AppContext'
import { NotFoundPage } from './NotFoundPage'

/** 案件の詳細: 基本情報・必要な役割と工数・必要スキル・配置状況 */
export function OpportunityPage() {
  const { oppId = '' } = useParams()
  const { data, derived, actions, can } = useApp()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [losing, setLosing] = useState(false)
  const o = data.opportunities.find((x) => x.id === oppId)
  if (!o) return <NotFoundPage message="この案件は見つかりません" />

  const editable = can('pipeline.edit') && o.stage !== 'converted' && o.stage !== 'lost'
  const customer = derived.customerById.get(o.customerId)
  const gaps = roleGapsForOpp(o, data.assignments, data.settings.baseCapacity)
  const ev = evaluateOpp(o.scores)
  const hours = oppHours(o)
  const weeks = Math.max(1, (new Date(o.endDate).getTime() - new Date(o.startDate).getTime()) / (7 * 86400000))
  const assignments = data.assignments.filter((a) => a.targetType === 'opportunity' && a.targetId === o.id)
  const byBatch = new Map<string, typeof assignments>()
  for (const a of assignments) byBatch.set(a.batchId, [...(byBatch.get(a.batchId) ?? []), a])
  const logs = data.activity.filter((l) => l.entityType === 'opportunity' && l.entityId === o.id).slice().reverse()
  const patch = (p: Partial<Opportunity>) => actions.updateOpportunity(o.id, p)

  const setDemand = (i: number, p: Partial<RoleDemand>) => patch({ demands: o.demands.map((d, k) => (k === i ? { ...d, ...p } : d)) })
  const addDemand = () => {
    const used = new Set(o.demands.map((d) => d.role))
    const role = data.settings.roles.find((r) => !used.has(r)) ?? data.settings.roles[0]
    patch({ demands: [...o.demands, { role, hours: 80, skillIds: [] }] })
  }
  const move = (stage: OppStage) => {
    if (stage === o.stage) return
    const wasDefault = o.probability === STAGE_DEFAULT_PROB[o.stage]
    actions.moveOpportunity(o.id, stage)
    if (wasDefault) actions.updateOpportunity(o.id, { probability: STAGE_DEFAULT_PROB[stage] })
  }

  return (
    <div className="page">
      <Link to="/pipeline" className="opp__back">
        <ArrowLeft size={15} /> 受注見込みへ戻る
      </Link>
      <PageHeader
        title={
          <span className="opp__title">
            {o.title}
            <span className={cx('chip', o.stage === 'converted' && 'chip--soft')}>{OPP_STAGE_LABEL[o.stage]}</span>
            <span className="ocard__prob">{o.probability}%</span>
          </span>
        }
        sub={`${customer?.name ?? ''} · ${o.startDate} 〜 ${o.endDate} · 概算 ${fmtManMonths(hours)}`}
        right={
          <div className="opp__actions">
            {o.stage !== 'converted' && o.stage !== 'lost' && (
              <>
                <Link to={`/assignments?target=opp:${o.id}`} className="btn btn--ghost">
                  <Network size={15} /> 配置を検討
                </Link>
                <Link to={`/pipeline/${o.id}/evaluation`} className="btn btn--primary">
                  <ClipboardCheck size={15} /> PJ化の評価・判断
                </Link>
              </>
            )}
            {o.stage === 'converted' && o.convertedProjectId && (
              <Link to={`/projects/${o.convertedProjectId}`} className="btn btn--primary">
                プロジェクトを開く
              </Link>
            )}
          </div>
        }
      />

      {o.stage === 'lost' && <p className="notice-inline">見送り済み{o.lostReason ? `：${o.lostReason}` : ''}</p>}

      <div className="opp">
        <div className="opp__main">
          <Card title="基本情報">
            <div className="form">
              <div className="form__row">
                <label className="field">
                  <span className="field__label">案件名・テーマ</span>
                  <CommitField value={o.title} disabled={!editable} onCommit={(v) => v.trim() && patch({ title: v.trim() })} />
                </label>
                <label className="field">
                  <span className="field__label">顧客</span>
                  <select className="input" value={o.customerId} disabled={!editable} onChange={(e) => patch({ customerId: e.target.value })}>
                    {data.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form__row form__row--3">
                <label className="field">
                  <span className="field__label">案件オーナー</span>
                  <select className="input" value={o.ownerId} disabled={!editable} onChange={(e) => patch({ ownerId: e.target.value })}>
                    {derived.activeUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">段階</span>
                  <select className="input" value={o.stage} disabled={!editable} onChange={(e) => move(e.target.value as OppStage)}>
                    {OPP_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {OPP_STAGE_LABEL[s]}
                      </option>
                    ))}
                    {!OPP_STAGES.includes(o.stage) && <option value={o.stage}>{OPP_STAGE_LABEL[o.stage]}</option>}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">確度（{o.probability}%）</span>
                  <input type="range" min={0} max={100} step={5} value={o.probability} disabled={!editable} onChange={(e) => patch({ probability: Number(e.target.value) })} />
                </label>
              </div>
              <div className="form__row form__row--3">
                <label className="field">
                  <span className="field__label">想定開始日</span>
                  <CommitField type="date" value={o.startDate} disabled={!editable} onCommit={(v) => v && patch({ startDate: v })} />
                </label>
                <label className="field">
                  <span className="field__label">想定終了日</span>
                  <CommitField type="date" value={o.endDate} disabled={!editable} onCommit={(v) => v && v >= o.startDate && patch({ endDate: v })} />
                </label>
                <label className="field">
                  <span className="field__label">PJ化判断の期限</span>
                  <CommitField type="date" value={o.decisionDue ?? ''} disabled={!editable} onCommit={(v) => patch({ decisionDue: v || undefined })} />
                </label>
              </div>
              <label className="field">
                <span className="field__label">次のアクション</span>
                <CommitField value={o.nextAction} disabled={!editable} onCommit={(v) => patch({ nextAction: v })} placeholder="例: 来週、現場責任者へヒアリング" />
              </label>
            </div>
            {!editable && o.stage !== 'converted' && o.stage !== 'lost' && <p className="hint">案件の編集は、課長以上の権限が必要です。</p>}
          </Card>

          <Card
            title="必要な役割と工数"
            subtitle="期間全体で必要な工数（時間）を役割ごとに入力します。稼働状況へは、期間内の週へ均等に配分して × 確度で反映されます"
            action={
              editable ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={addDemand}>
                  <Plus size={14} /> 役割を追加
                </button>
              ) : undefined
            }
          >
            {o.demands.length === 0 ? (
              <div className="empty">必要な役割がまだありません。{editable && '「役割を追加」から入力してください。'}</div>
            ) : (
              <div className="dtable">
                <div className="dtable__row dtable__row--head">
                  <span>役割</span>
                  <span>工数 (h)</span>
                  <span>この役割に必要なスキル</span>
                  <span>配置済み / 不足</span>
                  <span />
                </div>
                {o.demands.map((d, i) => {
                  const g = gaps.find((x) => x.role === d.role)
                  return (
                    <div key={`${d.role}-${i}`} className="dtable__row">
                      <select className="input input--sm" value={d.role} disabled={!editable} onChange={(e) => setDemand(i, { role: e.target.value })} aria-label="役割">
                        {data.settings.roles.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                        {!data.settings.roles.includes(d.role) && <option value={d.role}>{d.role}</option>}
                      </select>
                      <CommitField
                        type="number"
                        className="input input--sm input--num"
                        value={d.hours}
                        min={0}
                        step={10}
                        disabled={!editable}
                        aria-label={`${d.role}の工数`}
                        onCommit={(v) => Number.isFinite(Number(v)) && Number(v) >= 0 && setDemand(i, { hours: Number(v) })}
                      />
                      <div className="chipset">
                        {o.skills.length === 0 && <small className="hint">先に下で「必要スキル」を登録すると選べます</small>}
                        {o.skills.map((s) => {
                          const on = d.skillIds.includes(s.skillId)
                          return (
                            <button
                              key={s.skillId}
                              type="button"
                              className={cx(on && 'is-on')}
                              disabled={!editable}
                              aria-pressed={on}
                              onClick={() => setDemand(i, { skillIds: on ? d.skillIds.filter((x) => x !== s.skillId) : [...d.skillIds, s.skillId] })}
                            >
                              {data.skills.find((k) => k.id === s.skillId)?.name}
                            </button>
                          )
                        })}
                      </div>
                      <span className={cx('dtable__gap', (g?.gap ?? 0) > 1 && 'is-gap')}>
                        {fmtNum(g?.assigned ?? 0)}h / {(g?.gap ?? 0) > 1 ? `不足 ${fmtNum(g!.gap)}h` : '充足'}
                      </span>
                      {editable ? (
                        <button type="button" className="icon-btn icon-btn--sm" aria-label="この役割を削除" onClick={() => patch({ demands: o.demands.filter((_, k) => k !== i) })}>
                          <Trash2 size={15} />
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <Card title="必要なスキル" subtitle="この案件で求められるスキルと、必要なレベル。配置の適合度（スキル適合）の計算に使います">
            {o.skills.map((s, i) => (
              <div key={s.skillId} className="skillreq">
                <span>{data.skills.find((k) => k.id === s.skillId)?.name}</span>
                <select
                  className="input input--sm"
                  value={s.requiredLevel}
                  disabled={!editable}
                  onChange={(e) => patch({ skills: o.skills.map((x, k) => (k === i ? { ...x, requiredLevel: Number(e.target.value) } : x)) })}
                  aria-label="必要なレベル"
                >
                  {[1, 2, 3, 4, 5].map((l) => (
                    <option key={l} value={l}>
                      Lv{l} {SKILL_LEVEL_LABEL[l]}
                    </option>
                  ))}
                </select>
                {editable ? (
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    aria-label="このスキルを外す"
                    onClick={() =>
                      patch({
                        skills: o.skills.filter((_, k) => k !== i),
                        demands: o.demands.map((d) => ({ ...d, skillIds: d.skillIds.filter((x) => x !== s.skillId) })),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
            {o.skills.length === 0 && <div className="empty">必要スキルがまだありません</div>}
            {editable && (
              <label className="field skillreq__add">
                <span className="field__label">スキルを追加</span>
                <select
                  className="input"
                  value=""
                  onChange={(e) => e.target.value && patch({ skills: [...o.skills, { skillId: e.target.value, requiredLevel: 3 }] })}
                  aria-label="スキルを追加"
                >
                  <option value="">選択してください</option>
                  {data.skills
                    .filter((k) => !o.skills.some((s) => s.skillId === k.id))
                    .map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </Card>
        </div>

        <div className="opp__side">
          <Card title="概算">
            <dl className="ov__dl">
              <div>
                <dt>総工数</dt>
                <dd>{fmtNum(hours)}h（{fmtManMonths(hours)}）</dd>
              </div>
              <div>
                <dt>確度を掛けた量</dt>
                <dd>{fmtManMonths(weightedHours(o))}</dd>
              </div>
              <div>
                <dt>期間</dt>
                <dd>約{Math.round(weeks)}週</dd>
              </div>
              <div>
                <dt>週あたり</dt>
                <dd>{fmtNum(hours / weeks)}h（{(hours / weeks / data.settings.baseCapacity).toFixed(1)}人分）</dd>
              </div>
            </dl>
          </Card>

          <Card title="PJ化の評価" action={<Link className="link-btn" to={`/pipeline/${o.id}/evaluation`}>評価・判断へ</Link>}>
            {ev.score === null ? (
              <div className="empty">{ev.label}</div>
            ) : (
              <div className="evalmini">
                <b>{ev.score}<small>点</small></b>
                <span>{ev.label}</span>
              </div>
            )}
          </Card>

          <Card title="配置の状況" action={<Link className="link-btn" to={`/assignments?target=opp:${o.id}`}>配置を検討</Link>}>
            {byBatch.size === 0 ? (
              <div className="empty">まだ誰も配置されていません（仮配置もなし）</div>
            ) : (
              <ul className="asg">
                {[...byBatch.values()].map((rows) => {
                  const a = rows[0]
                  const u = derived.userById.get(a.userId)
                  return (
                    <li key={a.batchId}>
                      <Avatar user={u} size="sm" />
                      <span className="asg__who">
                        <strong>{u?.name}</strong>
                        <small>
                          {a.role} · 週{fmtNum(a.plannedHours)}h × {rows.length}週（{fmtMD(rows[0].weekStart)}〜）
                        </small>
                      </span>
                      <span className={cx('chip', a.status === 'tentative' && 'chip--warn')}>{a.status === 'tentative' ? '仮' : '確定'}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card title="更新履歴">
            {logs.length === 0 ? (
              <div className="empty">履歴はまだありません</div>
            ) : (
              <ul className="log">
                {logs.slice(0, 8).map((l) => (
                  <li key={l.id}>
                    <History size={13} />
                    <span className="log__time">{fmtDateTime(l.timestamp)}</span>
                    <span className="log__who">{derived.userById.get(l.userId)?.name}</span>
                    <span className="log__text">{l.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {editable && (
            <button type="button" className="btn btn--ghost" onClick={() => setLosing(true)}>
              この案件を見送る
            </button>
          )}
        </div>
      </div>

      {losing && (
        <ReasonDialog
          title={`「${o.title}」を見送りますか？`}
          lead="見送ると、将来の見込み（稼働状況）から外れます。"
          label="見送りの理由"
          confirmLabel="見送る"
          onCancel={() => setLosing(false)}
          onConfirm={(reason) => {
            actions.moveOpportunity(o.id, 'lost', reason)
            toast(<><strong>{o.title}</strong> を見送りにしました</>, 'info')
            setLosing(false)
            navigate('/pipeline')
          }}
        />
      )}
    </div>
  )
}
