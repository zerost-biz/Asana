import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { templateTaskCount } from '../data/templates'
import { fmtManMonths, oppHours } from '../domain/pipeline'
import type { Opportunity } from '../domain/types'
import { useApp } from '../store/AppContext'
import { useToast } from './Toast'

/** 案件をプロジェクトにする（PJ化）。仮配置はそのままプロジェクトの配置へ引き継がれる */
export function ConvertDialog({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  const { data, derived, actions } = useApp()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState(opp.title)
  const [ownerId, setOwnerId] = useState(opp.ownerId)
  const [startDate, setStartDate] = useState(opp.startDate)
  const [endDate, setEndDate] = useState(opp.endDate)
  const [budget, setBudget] = useState('')
  const [template, setTemplate] = useState<'standard' | 'blank'>('standard')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const budgetNum = budget.trim() === '' ? undefined : Number(budget)
  const invalid = !name.trim() || !startDate || !endDate || endDate < startDate || (budgetNum !== undefined && !(budgetNum >= 0))
  const assignedUsers = new Set(data.assignments.filter((a) => a.targetType === 'opportunity' && a.targetId === opp.id).map((a) => a.userId))

  const convert = () => {
    if (invalid) return
    const id = actions.convertOpportunity(opp.id, { name: name.trim(), ownerId, startDate, endDate, budget: budgetNum && budgetNum > 0 ? budgetNum : undefined, template })
    if (!id) return
    toast(<><strong>{name.trim()}</strong> をプロジェクトにしました。仮配置のメンバーが引き継がれています</>)
    onClose()
    navigate(`/projects/${id}`)
  }

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal modal--wide" role="dialog" aria-label="プロジェクト化" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal__title">「{opp.title}」をプロジェクトにする</h3>
        <div className="modal__body">
          <p className="modal__lead">
            概算 {fmtManMonths(oppHours(opp))}・仮配置 {assignedUsers.size}名を引き継ぎます。案件は「PJ化済み」になり、稼働状況の見込みから、プロジェクトの作業計画へ切り替わります。
          </p>
          <div className="form">
            <label className="field">
              <span className="field__label">プロジェクト名</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
            <div className="form__row">
              <label className="field">
                <span className="field__label">リーダー</span>
                <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                  {derived.activeUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">受注額（円・任意）</span>
                <input type="number" min={0} step={100000} className="input input--num" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="例: 2400000" />
              </label>
            </div>
            <div className="form__row">
              <label className="field">
                <span className="field__label">開始日</span>
                <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label className="field">
                <span className="field__label">終了日</span>
                <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            </div>
            <label className="field">
              <span className="field__label">作業計画（WBS）</span>
              <select className="input" value={template} onChange={(e) => setTemplate(e.target.value as 'standard' | 'blank')}>
                <option value="standard">標準の作業テンプレートから作成（{templateTaskCount()}タスク）</option>
                <option value="blank">空で作成（あとで追加）</option>
              </select>
            </label>
          </div>
        </div>
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn btn--primary" onClick={convert} disabled={invalid}>
            プロジェクトにする
          </button>
        </div>
      </div>
    </div>
  )
}
