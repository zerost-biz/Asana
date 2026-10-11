import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, toISO } from '../domain/dates'
import { STAGE_DEFAULT_PROB } from '../domain/pipeline'
import { OPP_STAGES, OPP_STAGE_LABEL, type OppStage } from '../domain/types'
import { useApp } from '../store/AppContext'
import { useToast } from './Toast'

/** 受注見込み（案件）の新規登録 */
export function OpportunityDialog({ onClose }: { onClose: () => void }) {
  const { data, derived, actions, today, me } = useApp()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [customerId, setCustomerId] = useState(data.customers[0]?.id ?? '__new__')
  const [newCustomer, setNewCustomer] = useState('')
  const [title, setTitle] = useState('')
  const [ownerId, setOwnerId] = useState(me.id)
  const [stage, setStage] = useState<OppStage>('consultation')
  const [probability, setProbability] = useState(STAGE_DEFAULT_PROB.consultation)
  const [startDate, setStartDate] = useState(toISO(addDays(today, 30)))
  const [endDate, setEndDate] = useState(toISO(addDays(today, 120)))
  const [nextAction, setNextAction] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const needsName = customerId === '__new__'
  const invalid = !title.trim() || (needsName && !newCustomer.trim()) || !startDate || !endDate || endDate < startDate

  const create = () => {
    if (invalid) return
    let cid = customerId
    if (needsName) {
      cid = `c-${Date.now().toString(36)}`
      actions.upsertCustomer({ id: cid, name: newCustomer.trim(), industry: '' })
    }
    const id = actions.addOpportunity({
      customerId: cid,
      title: title.trim(),
      ownerId,
      stage,
      probability,
      startDate,
      endDate,
      nextAction: nextAction.trim(),
      demands: [],
      skills: [],
      scores: {},
      evalComment: '',
    })
    toast(<><strong>{title.trim()}</strong> を受注見込みに追加しました。詳細で必要な役割・工数を入力してください</>)
    onClose()
    navigate(`/pipeline/${id}`)
  }

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal modal--wide" role="dialog" aria-label="案件を追加" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal__title">受注見込みの案件を追加</h3>
        <div className="modal__body">
          <p className="modal__lead">相談・探索の段階から登録しておくと、受注前から将来の人手（工数）が見えます。</p>
          <div className="form">
            <div className="form__row">
              <label className="field">
                <span className="field__label">顧客</span>
                <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  {data.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__new__">（新しい顧客を追加）</option>
                </select>
              </label>
              {needsName ? (
                <label className="field">
                  <span className="field__label">新しい顧客名</span>
                  <input className="input" value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)} placeholder="例: F社" />
                </label>
              ) : (
                <label className="field">
                  <span className="field__label">案件オーナー</span>
                  <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                    {derived.activeUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <label className="field">
              <span className="field__label">案件名・テーマ</span>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: F社 品質データ活用構想" autoFocus />
            </label>
            <div className="form__row">
              <label className="field">
                <span className="field__label">段階</span>
                <select
                  className="input"
                  value={stage}
                  onChange={(e) => {
                    const st = e.target.value as OppStage
                    setStage(st)
                    setProbability(STAGE_DEFAULT_PROB[st])
                  }}
                >
                  {OPP_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {OPP_STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">確度（{probability}%）</span>
                <input type="range" min={0} max={100} step={5} value={probability} onChange={(e) => setProbability(Number(e.target.value))} />
              </label>
            </div>
            <div className="form__row">
              <label className="field">
                <span className="field__label">想定開始日</span>
                <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label className="field">
                <span className="field__label">想定終了日</span>
                <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            </div>
            <label className="field">
              <span className="field__label">次のアクション</span>
              <input className="input" value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="例: 来週、現場責任者へヒアリング" />
            </label>
          </div>
        </div>
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn btn--primary" onClick={create} disabled={invalid}>
            追加する
          </button>
        </div>
      </div>
    </div>
  )
}
