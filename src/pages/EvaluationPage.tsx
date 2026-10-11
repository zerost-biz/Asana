import { ArrowLeft, Gavel, Lightbulb } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card } from '../components/Card'
import { ConvertDialog } from '../components/ConvertDialog'
import { PageHeader } from '../components/PageHeader'
import { ProgressBar } from '../components/ProgressBar'
import { ReasonDialog } from '../components/ReasonDialog'
import { useToast } from '../components/Toast'
import { cx } from '../components/cx'
import { fmtNum } from '../domain/format'
import { evaluateOpp, fmtManMonths, oppHours, roleGapsForOpp, suggestFeasibility } from '../domain/pipeline'
import { EVAL_AXES, OPP_STAGE_LABEL, type EvalAxis } from '../domain/types'
import { spreadHours } from '../domain/workload'
import { useApp } from '../store/AppContext'
import { NotFoundPage } from './NotFoundPage'

/** PJ化の評価・判断。スコアは推奨の判断材料で、可否は人が決める */
export function EvaluationPage() {
  const { oppId = '' } = useParams()
  const { data, derived, actions, can } = useApp()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [converting, setConverting] = useState(false)
  const [losing, setLosing] = useState(false)
  const [comment, setComment] = useState<string | null>(null)
  const o = data.opportunities.find((x) => x.id === oppId)
  if (!o) return <NotFoundPage message="この案件は見つかりません" />

  const decided = o.stage === 'converted' || o.stage === 'lost'
  const canEval = can('pipeline.edit') && !decided
  const canDecide = can('pipeline.decide') && !decided
  const ev = evaluateOpp(o.scores)
  const customer = derived.customerById.get(o.customerId)
  const gaps = roleGapsForOpp(o, data.assignments, data.settings.baseCapacity)

  // 人員確保の実現性の目安: 期間内の空き時間（確定分だけを差し引いた、全メンバー合計）と必要工数の比
  const feas = (() => {
    const weeks = derived.weeksAll
    const demand = new Map<number, number>()
    for (const d of o.demands) for (const [wi, h] of spreadHours(o.startDate, o.endDate, d.hours, weeks)) demand.set(wi, (demand.get(wi) ?? 0) + h)
    if (demand.size === 0) return null
    let need = 0
    let free = 0
    for (const [wi, h] of demand) {
      need += h
      for (const c of derived.workloadAll.cells) free += Math.max(0, c[wi].capacity - c[wi].planned)
    }
    return { need, free, score: suggestFeasibility(need, free) }
  })()

  const setScore = (axis: EvalAxis, v: number | undefined) => {
    const next = { ...o.scores }
    if (v === undefined) delete next[axis]
    else next[axis] = v
    actions.updateOpportunity(o.id, { scores: next })
  }

  const toneClass = ev.recommendation === 'go' ? 'evalresult--go' : ev.recommendation === 'hold' ? 'evalresult--hold' : ''

  return (
    <div className="page">
      <Link to={`/pipeline/${o.id}`} className="opp__back">
        <ArrowLeft size={15} /> 案件の詳細へ戻る
      </Link>
      <PageHeader
        title={<span className="opp__title">PJ化の評価・判断：{o.title}<span className="chip">{OPP_STAGE_LABEL[o.stage]}</span></span>}
        sub={`${customer?.name ?? ''} · 確度 ${o.probability}% · 概算 ${fmtManMonths(oppHours(o))} · ${o.startDate}〜${o.endDate}`}
      />

      <div className="opp">
        <div className="opp__main">
          <Card title="評価（1〜5点）" subtitle="売上だけでなく、顧客価値・将来性・戦略性・波及・勝ち筋・組織の力・実現性・リスクの面から見ます。5がよい状態です">
            {EVAL_AXES.map((a) => {
              const v = o.scores[a.key]
              return (
                <div key={a.key} className="evalrow">
                  <div>
                    <strong>{a.label}</strong>
                    <small>{a.hint}</small>
                  </div>
                  <div className="scorebtns" role="radiogroup" aria-label={a.label}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={v === n}
                        className={cx(v === n && 'is-on')}
                        disabled={!canEval}
                        onClick={() => setScore(a.key, v === n ? undefined : n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  {a.key === 'feasibility' && (
                    <div className="evalrow__hint">
                      <Lightbulb size={14} />
                      {feas ? (
                        <>
                          目安 <b>{feas.score}点</b>：期間内の必要 {fmtNum(feas.need)}h に対し、確定分を引いた空きは全員で {fmtNum(feas.free)}h
                          {canEval && v !== feas.score && (
                            <button type="button" className="link-btn" onClick={() => setScore('feasibility', feas.score)}>
                              この点を入れる
                            </button>
                          )}
                        </>
                      ) : (
                        '必要な役割の工数を入力すると、空き時間から目安を出します'
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            <label className="field" style={{ marginTop: 14 }}>
              <span className="field__label">評価メモ・懸念点</span>
              <textarea
                className="input input--area"
                rows={3}
                value={comment ?? o.evalComment}
                disabled={!canEval}
                onChange={(e) => setComment(e.target.value)}
                onBlur={() => {
                  if (comment !== null && comment !== o.evalComment) actions.updateOpportunity(o.id, { evalComment: comment })
                  setComment(null)
                }}
                placeholder="評価の根拠、懸念、PJ化の条件など"
              />
            </label>
            {!canEval && !decided && <p className="hint">評価の入力は、課長以上の権限が必要です。</p>}
          </Card>
        </div>

        <div className="opp__side">
          <section className={cx('evalresult', toneClass)} aria-label="評価の結果">
            <div className="evalresult__score">
              {ev.score ?? '—'}
              <small>{ev.score !== null ? '点 / 100' : ''}</small>
            </div>
            <strong>{ev.label}</strong>
            <small>
              入力済み {ev.answered}/{ev.total} 軸。スコアは推奨の判断材料です。自動でPJ化の可否は決まりません。
            </small>
            <div className="radar" aria-label="軸ごとの点数">
              {EVAL_AXES.map((a) => (
                <div key={a.key} className="radar__row">
                  <span>{a.label}</span>
                  <ProgressBar value={((o.scores[a.key] ?? 0) / 5) * 100} size="sm" tone={(o.scores[a.key] ?? 0) >= 4 ? 'good' : (o.scores[a.key] ?? 0) >= 3 ? 'accent' : 'muted'} />
                  <b>{o.scores[a.key] ?? '–'}</b>
                </div>
              ))}
            </div>
          </section>

          <Card title="判断の材料">
            <ul className="facts">
              <li>
                <span>必要な工数</span>
                <b>{fmtNum(oppHours(o))}h（{fmtManMonths(oppHours(o))}）</b>
              </li>
              {gaps.map((g) => (
                <li key={g.role} className={cx(g.gap > 1 && 'is-gap')}>
                  <span>{g.role}</span>
                  <b>{g.gap > 1 ? `未配置 ${fmtNum(g.gap)}h` : '配置済み'}</b>
                </li>
              ))}
              {gaps.length === 0 && (
                <li>
                  <span>必要な役割</span>
                  <b>未入力</b>
                </li>
              )}
            </ul>
            <Link className="link-btn" to={`/assignments?target=opp:${o.id}`}>
              配置を検討する
            </Link>
          </Card>

          <Card title="判断" action={<Gavel size={16} />}>
            {decided ? (
              <p className="hint">
                この案件は「{OPP_STAGE_LABEL[o.stage]}」です。
                {o.stage === 'converted' && o.convertedProjectId && (
                  <>
                    {' '}
                    <Link className="link-btn" to={`/projects/${o.convertedProjectId}`}>
                      プロジェクトを開く
                    </Link>
                  </>
                )}
              </p>
            ) : canDecide ? (
              <div className="decide">
                <button type="button" className="btn btn--primary" onClick={() => setConverting(true)}>
                  PJ化する
                </button>
                {o.stage !== 'approval_wait' && (
                  <button type="button" className="btn btn--ghost" onClick={() => (actions.moveOpportunity(o.id, 'approval_wait'), toast('「PJ化待ち」へ移動しました'))}>
                    PJ化待ちにする
                  </button>
                )}
                {o.stage !== 'evaluation' && (
                  <button type="button" className="btn btn--ghost" onClick={() => (actions.moveOpportunity(o.id, 'evaluation'), toast('「評価中」へ戻しました'))}>
                    評価中に戻す
                  </button>
                )}
                <button type="button" className="btn btn--quiet" onClick={() => setLosing(true)}>
                  見送る
                </button>
              </div>
            ) : (
              <p className="hint">PJ化の判断は、課長（マネージャー）以上が行います。</p>
            )}
          </Card>
        </div>
      </div>

      {converting && <ConvertDialog opp={o} onClose={() => setConverting(false)} />}
      {losing && (
        <ReasonDialog
          title={`「${o.title}」を見送りますか？`}
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
