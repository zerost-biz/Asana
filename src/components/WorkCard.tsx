import { ArrowRight, Check, CircleCheck, Lock, Minus, Plus, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { leafMetrics, resolveLogWork } from '../domain/calculations'
import { daysBetween, fmtMD } from '../domain/dates'
import { clamp, fmtNum, fmtSignedH, roundStep } from '../domain/format'
import { defaultOrderId, selectableOrders } from '../domain/orders'
import { PRIORITY_LABEL, type WbsItem } from '../domain/types'
import { useApp } from '../store/AppContext'
import { ProgressBar } from './ProgressBar'
import { WbsStatusBadge } from './StatusBadge'
import { useToast } from './Toast'
import { cx } from './cx'

export interface SaveResult {
  hours: number
  before: { act: number; etc: number; eac: number; variance: number; progress: number }
}

interface Props {
  item: WbsItem
  result?: SaveResult
  onSaved: (id: string, result: SaveResult) => void
}

const QUICK_HOURS = [1, 2, 4, 8]

/** My Work の1タスク分の入力カード。保存すると TimeEntry 追加 + WBS の ETC/進捗を更新する */
export function WorkCard({ item, result, onSaved }: Props) {
  const { data, derived, actions } = useApp()
  const { todayISO } = derived
  const { toast } = useToast()
  const m = derived.metrics.get(item.id)!
  const project = derived.projectById.get(item.projectId)
  const overdue = item.status !== 'done' && item.endDate < todayISO

  const [hours, setHours] = useState(0)
  const [etc, setEtc] = useState(String(item.etcHours))
  const [progress, setProgress] = useState(item.progress)
  const [comment, setComment] = useState('')
  // 時間を計上する社内オーダー: 作業に設定されたオーダー → なければ、使用中のオーダーが1つだけならそれ
  const orderChoices = selectableOrders(data.internalOrders, item.projectId, item.orderId)
  const [orderId, setOrderId] = useState(item.orderId ?? defaultOrderId(data.internalOrders, item.projectId) ?? '')

  const etcNum = etc.trim() === '' ? NaN : Number(etc)
  const etcValid = Number.isFinite(etcNum) && etcNum >= 0
  const next = resolveLogWork(item, { hours, etc: etcValid ? etcNum : item.etcHours, progress })
  const preview = leafMetrics(m.plan, m.act + hours, next.etc)
  const changed = hours > 0 || comment.trim() !== '' || (etcValid && etcNum !== item.etcHours) || progress !== item.progress
  const completes = progress >= 100

  const step = data.settings.hoursStep
  const setH = (v: number) => setHours(clamp(roundStep(v, step), 0, 24))

  const save = () => {
    if (!changed || !etcValid) return
    const before = { act: m.act, etc: m.etc, eac: m.eac, variance: m.variance, progress: item.progress }
    actions.logWork({
      wbsId: item.id,
      userId: data.currentUserId,
      date: todayISO,
      hours,
      comment,
      etcHours: etcNum,
      progress,
      orderId: orderId || undefined,
    })
    onSaved(item.id, { hours, before })
    toast(
      <>
        <strong>{item.title}</strong>
        {hours > 0 ? ` に ${fmtNum(hours)}h を記録しました` : ' を更新しました'}（実績 {fmtNum(m.act)}h → {fmtNum(preview.act)}h / 見込み {fmtNum(preview.eac)}h / 差異 {fmtSignedH(preview.variance)}）
      </>,
    )
  }

  const diff = (a: number, b: number, fmt: (n: number) => string) =>
    a !== b ? (
      <>
        <span className="pv__old">{fmt(a)}</span>
        <ArrowRight size={11} />
        <b>{fmt(b)}</b>
      </>
    ) : (
      <b>{fmt(b)}</b>
    )
  const fh = (n: number) => `${fmtNum(n)}h`

  return (
    <article className={cx('wc', item.status === 'blocked' && 'wc--blocked', item.status === 'done' && 'wc--done')}>
      <header className="wc__head">
        <div className="wc__meta">
          <span className="chip chip--project">{project?.name}</span>
          <WbsStatusBadge status={item.status} />
          {item.priority === 'high' && <span className="chip">優先度 {PRIORITY_LABEL[item.priority]}</span>}
          {overdue && (
            <span className="chip chip--warn">
              <TriangleAlert size={11} strokeWidth={2.4} />
              遅延 {daysBetween(item.endDate, todayISO)}日
            </span>
          )}
          {item.status === 'blocked' && (
            <span className="chip chip--warn">
              <Lock size={11} strokeWidth={2.4} />
              停止中
            </span>
          )}
        </div>
        <Link to={`/projects/${item.projectId}/wbs?task=${item.id}`} className="link-btn wc__open">
          作業一覧で開く
        </Link>
      </header>

      <h3 className="wc__title">
        <span className="wbs__code">{derived.numbers.get(item.id)}</span>
        {item.title}
      </h3>
      <p className="wc__dates">
        {fmtMD(item.startDate)} – {fmtMD(item.endDate)}
        {item.comment && <span className="wc__note">{item.comment}</span>}
      </p>

      <div className="pv" aria-label="工数">
        <div>
          <span>計画</span>
          <b>{fh(m.plan)}</b>
        </div>
        <div>
          <span>実績</span>
          {diff(m.act, preview.act, fh)}
        </div>
        <div>
          <span>残り</span>
          {diff(m.etc, preview.etc, fh)}
        </div>
        <div>
          <span>見込み</span>
          {diff(m.eac, preview.eac, fh)}
        </div>
        <div className={cx(preview.variance > 0 && 'pv--over')}>
          <span>差異</span>
          {diff(m.variance, preview.variance, fmtSignedH)}
        </div>
      </div>

      <div className="wc__inputs">
        <div className="wc__field">
          <span className="wc__label">今日の工数</span>
          <div className="stepper">
            <button type="button" onClick={() => setH(hours - step)} aria-label={`${step}h減らす`} disabled={hours <= 0}>
              <Minus size={16} />
            </button>
            <input
              type="number"
              min={0}
              max={24}
              step={step}
              inputMode="decimal"
              value={hours}
              onChange={(e) => setH(Number(e.target.value))}
              aria-label="今日の工数(h)"
            />
            <span className="stepper__unit">h</span>
            <button type="button" onClick={() => setH(hours + step)} aria-label={`${step}h増やす`}>
              <Plus size={16} />
            </button>
          </div>
          <div className="quick">
            {QUICK_HOURS.map((h) => (
              <button key={h} type="button" className={cx('quick__btn', hours === h && 'is-on')} onClick={() => setH(h)}>
                {h}h
              </button>
            ))}
          </div>
        </div>

        <div className="wc__field">
          <span className="wc__label">残り（あと何時間かかるか）</span>
          <div className="stepper stepper--plain">
            <input
              type="number"
              min={0}
              step={0.5}
              inputMode="decimal"
              value={completes ? '0' : etc}
              disabled={completes}
              onChange={(e) => setEtc(e.target.value)}
              aria-label="残り(h)"
            />
            <span className="stepper__unit">h</span>
          </div>
          <span className="wc__hint">
            {completes ? '進捗100%＝完了。残りは0hになります' : `現在 ${fmtNum(item.etcHours)}h（進捗の％からは自動計算されません）`}
          </span>
        </div>

        <div className="wc__field wc__field--wide">
          <span className="wc__label">
            進捗 <b>{progress}%</b>
          </span>
          <div className="slider">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              aria-label="進捗"
            />
            <input
              type="number"
              min={0}
              max={100}
              className="input input--num slider__num"
              value={progress}
              onChange={(e) => setProgress(clamp(Math.round(Number(e.target.value)) || 0, 0, 100))}
              aria-label="進捗(数値)"
            />
          </div>
          <ProgressBar value={progress} size="sm" tone="good" />
        </div>

        {orderChoices.length > 0 && (
          <div className="wc__field wc__field--wide">
            <span className="wc__label">社内オーダー（時間の計上先）</span>
            <select className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)} aria-label="社内オーダー">
              <option value="">未設定</option>
              {orderChoices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} {o.name}
                  {o.status === 'closed' ? '（終了）' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="wc__field wc__field--wide">
          <span className="wc__label">コメント</span>
          <input
            className="input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="今日やったこと・共有事項（任意）"
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </div>
      </div>

      {result && (
        <div className="wc__result" role="status">
          <Check size={15} />
          <span>
            保存しました{result.hours > 0 && `（+${fmtNum(result.hours)}h）`}
            <span className="wc__result-line">
              実績 {fmtNum(result.before.act)}h → <b>{fmtNum(m.act)}h</b>
            </span>
            <span className="wc__result-line">
              見込み {fmtNum(result.before.eac)}h → <b>{fmtNum(m.eac)}h</b>
            </span>
            <span className="wc__result-line">
              差異 {fmtSignedH(result.before.variance)} → <b>{fmtSignedH(m.variance)}</b>
            </span>
          </span>
        </div>
      )}

      <footer className="wc__foot">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setProgress(100)}
          disabled={completes || item.status === 'done'}
          title="進捗を100%にします（完了になり、残りは0hになります）"
        >
          <CircleCheck size={15} />
          完了にする
        </button>
        <button type="button" className="btn btn--primary" onClick={save} disabled={!changed || !etcValid}>
          保存
        </button>
      </footer>
    </article>
  )
}
