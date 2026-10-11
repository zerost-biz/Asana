import { CalendarClock, Filter, GripVertical, Plus, UserRoundX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { KpiCard } from '../components/KpiCard'
import { OpportunityDialog } from '../components/OpportunityDialog'
import { PageHeader } from '../components/PageHeader'
import { ReasonDialog } from '../components/ReasonDialog'
import { useToast } from '../components/Toast'
import { cx } from '../components/cx'
import { daysBetween, fmtMD } from '../domain/dates'
import { evaluateOpp, fmtManMonths, oppHours, roleGapsForOpp, STAGE_DEFAULT_PROB, weightedHours } from '../domain/pipeline'
import { OPP_STAGES, OPP_STAGE_LABEL, type Opportunity, type OppStage } from '../domain/types'
import { useApp } from '../store/AppContext'

/** 受注見込み（PJ化前の案件）。相談 → 探索 → PJ候補 → 評価中 → PJ化待ち */
export function PipelinePage() {
  const { data, derived, actions, can } = useApp()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<OppStage | null>(null)
  const [losing, setLosing] = useState<Opportunity | null>(null)
  const editable = can('pipeline.edit')

  const open = data.opportunities.filter((o) => o.stage !== 'converted' && o.stage !== 'lost')
  const closed = data.opportunities.filter((o) => o.stage === 'converted' || o.stage === 'lost')
  const totalHours = open.reduce((s, o) => s + oppHours(o), 0)
  const weighted = open.reduce((s, o) => s + weightedHours(o), 0)
  const soon = open.filter((o) => o.decisionDue && daysBetween(derived.todayISO, o.decisionDue) <= 7)

  const byStage = useMemo(() => {
    const m = new Map<OppStage, Opportunity[]>()
    for (const st of OPP_STAGES) m.set(st, [])
    for (const o of open) m.get(o.stage)?.push(o)
    return m
  }, [open])

  const move = (o: Opportunity, stage: OppStage) => {
    if (o.stage === stage) return
    const wasDefault = o.probability === STAGE_DEFAULT_PROB[o.stage]
    actions.moveOpportunity(o.id, stage)
    if (wasDefault && stage in STAGE_DEFAULT_PROB) actions.updateOpportunity(o.id, { probability: STAGE_DEFAULT_PROB[stage] })
    toast(<><strong>{o.title}</strong> を「{OPP_STAGE_LABEL[stage]}」へ移動しました</>)
  }

  return (
    <div className="page page--wide">
      <PageHeader
        title="受注見込み"
        sub="相談・シーズの段階から捕捉し、受注前の将来の人手（工数）を見える化します。カードをドラッグ、または段階の選択で動かせます"
        right={
          editable ? (
            <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
              <Plus size={16} />
              案件を追加
            </button>
          ) : undefined
        }
      />

      <div className="kpi-grid">
        <KpiCard label="検討中の案件" icon={Filter} value={open.length} unit="件" sub={`PJ化済み ${closed.filter((o) => o.stage === 'converted').length}件 · 見送り ${closed.filter((o) => o.stage === 'lost').length}件`} />
        <KpiCard label="概算の合計" value={fmtManMonths(totalHours)} sub={`${Math.round(totalHours)}時間（確度を掛ける前）`} />
        <KpiCard label="確度を掛けた見込み" value={fmtManMonths(weighted)} sub="稼働状況の「見込み」に反映される量" tone="default" />
        <KpiCard label="判断期限が近い案件" icon={CalendarClock} value={soon.length} unit="件" tone={soon.length > 0 ? 'attention' : 'good'} sub="7日以内（超過を含む）" />
      </div>

      <div className="board" role="list" aria-label="受注見込みボード">
        {OPP_STAGES.map((st) => {
          const list = byStage.get(st) ?? []
          const h = list.reduce((s, o) => s + oppHours(o), 0)
          return (
            <section
              key={st}
              role="listitem"
              className={cx('board__col', over === st && 'is-over')}
              aria-label={OPP_STAGE_LABEL[st]}
              onDragOver={(e) => {
                if (!editable || !dragId) return
                e.preventDefault()
                setOver(st)
              }}
              onDragLeave={() => setOver((cur) => (cur === st ? null : cur))}
              onDrop={(e) => {
                e.preventDefault()
                const o = data.opportunities.find((x) => x.id === dragId)
                setOver(null)
                setDragId(null)
                if (o) move(o, st)
              }}
            >
              <header className="board__head">
                <h2>{OPP_STAGE_LABEL[st]}</h2>
                <span className="count-pill">{list.length}</span>
                <small>{fmtManMonths(h)}</small>
              </header>
              <div className="board__cards">
                {list.length === 0 && <div className="board__empty">なし</div>}
                {list.map((o) => (
                  <OppCard
                    key={o.id}
                    o={o}
                    editable={editable}
                    dragging={dragId === o.id}
                    onDragStart={() => setDragId(o.id)}
                    onDragEnd={() => (setDragId(null), setOver(null))}
                    onMove={(stage) => move(o, stage)}
                    onLose={() => setLosing(o)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {closed.length > 0 && (
        <section className="card board__closed">
          <header className="card__head">
            <h2 className="card__title">PJ化済み・見送り</h2>
          </header>
          <div className="card__body card__body--flush">
            <ul className="closed">
              {closed.map((o) => (
                <li key={o.id}>
                  <Link to={o.stage === 'converted' && o.convertedProjectId ? `/projects/${o.convertedProjectId}` : `/pipeline/${o.id}`}>
                    <span className={cx('chip', o.stage === 'converted' && 'chip--soft')}>{OPP_STAGE_LABEL[o.stage]}</span>
                    <strong>{o.title}</strong>
                    <small>
                      {derived.customerById.get(o.customerId)?.name} · {fmtManMonths(oppHours(o))}
                      {o.stage === 'lost' && o.lostReason ? ` · 理由: ${o.lostReason}` : ''}
                    </small>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {adding && <OpportunityDialog onClose={() => setAdding(false)} />}
      {losing && (
        <ReasonDialog
          title={`「${losing.title}」を見送りますか？`}
          lead="見送ると、将来の見込み（稼働状況）から外れます。理由を残しておくと、後から振り返れます。"
          label="見送りの理由"
          placeholder="例: 時期尚早 / 体制を確保できない / 顧客予算の都合"
          confirmLabel="見送る"
          onCancel={() => setLosing(null)}
          onConfirm={(reason) => {
            actions.moveOpportunity(losing.id, 'lost', reason)
            toast(<><strong>{losing.title}</strong> を見送りにしました</>, 'info')
            setLosing(null)
            navigate('/pipeline')
          }}
        />
      )}
    </div>
  )
}

function OppCard({
  o,
  editable,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onLose,
}: {
  o: Opportunity
  editable: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onMove: (stage: OppStage) => void
  onLose: () => void
}) {
  const { data, derived } = useApp()
  const owner = derived.userById.get(o.ownerId)
  const customer = derived.customerById.get(o.customerId)
  const ev = evaluateOpp(o.scores)
  const gaps = roleGapsForOpp(o, data.assignments, data.settings.baseCapacity).filter((g) => g.gap > 1)
  const dueIn = o.decisionDue ? daysBetween(derived.todayISO, o.decisionDue) : null
  return (
    <article
      className={cx('ocard', dragging && 'is-dragging')}
      draggable={editable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', o.id)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
    >
      <div className="ocard__top">
        {editable && <GripVertical size={14} className="ocard__grip" aria-hidden="true" />}
        <span className="chip chip--project">{customer?.name}</span>
        <span className="ocard__prob" title="確度（受注できる見込み）">{o.probability}%</span>
      </div>
      <Link to={`/pipeline/${o.id}`} className="ocard__title">
        {o.title}
      </Link>
      <div className="ocard__meta">
        <b>{fmtManMonths(oppHours(o))}</b>
        <span>
          {fmtMD(o.startDate)}–{fmtMD(o.endDate)}
        </span>
        <Avatar user={owner} size="sm" />
      </div>
      {o.nextAction && <p className="ocard__next">次: {o.nextAction}</p>}
      <div className="ocard__chips">
        {dueIn !== null && (
          <span className={cx('chip', dueIn <= 7 && 'chip--warn')} title="PJ化判断の期限">
            判断 {fmtMD(o.decisionDue!)}
            {dueIn < 0 ? '（超過）' : ''}
          </span>
        )}
        {ev.score !== null && <span className="chip chip--soft">評価 {ev.score}点</span>}
        {gaps.length > 0 && (
          <Link to={`/assignments?target=opp:${o.id}`} className="chip chip--warn" title={gaps.map((g) => g.role).join('・')}>
            <UserRoundX size={11} /> 未配置 {gaps.length}
          </Link>
        )}
      </div>
      {editable && (
        <div className="ocard__foot">
          <select className="input input--sm" value={o.stage} onChange={(e) => onMove(e.target.value as OppStage)} aria-label={`${o.title}の段階`}>
            {OPP_STAGES.map((s) => (
              <option key={s} value={s}>
                {OPP_STAGE_LABEL[s]}
              </option>
            ))}
          </select>
          <button type="button" className="link-btn" onClick={onLose}>
            見送る
          </button>
        </div>
      )}
    </article>
  )
}
