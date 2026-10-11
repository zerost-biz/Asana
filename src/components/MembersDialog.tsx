import { useEffect } from 'react'
import { fmtNum, fmtYen, HOURS_PER_DAY } from '../domain/format'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { NumInput } from './NumInput'

/** メンバーの稼働時間・原価単価の設定。人件費（原価）はここの単価 × 工数で計算される */
export function MembersDialog({ onClose }: { onClose: () => void }) {
  const { data, derived, actions } = useApp()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal modal--wide" role="dialog" aria-label="メンバーと単価" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal__title">メンバーと単価</h3>
        <p className="modal__lead">
          人件費 ＝ 作業時間 × 時間単価。「実績」は<strong>入力した人</strong>の単価、「残り」と「計画」は<strong>担当者</strong>の単価で計算します。
          担当未設定のタスクは平均単価（{fmtYen(derived.defaultRate)}/h）を使います。変更はすぐに全画面へ反映されます。
        </p>
        <div className="members">
          <div className="members__row members__row--head">
            <span>メンバー</span>
            <span className="num">稼働（時間/週）</span>
            <span className="num">時間単価（円）</span>
            <span className="num">人日単価（{HOURS_PER_DAY}h）</span>
          </div>
          {data.users.map((u) => (
            <div key={u.id} className="members__row">
              <span className="members__name">
                <Avatar user={u} size="sm" />
                {u.name}
              </span>
              <NumInput
                className="input input--num"
                value={u.weeklyCapacity}
                min={0}
                step={1}
                ariaLabel={`${u.name}の稼働時間（時間/週）`}
                onCommit={(n) => actions.updateUser(u.id, { weeklyCapacity: n })}
              />
              <NumInput
                className="input input--num"
                value={u.hourlyRate}
                min={0}
                step={500}
                ariaLabel={`${u.name}の時間単価（円）`}
                onCommit={(n) => actions.updateUser(u.id, { hourlyRate: n })}
              />
              <span className="num members__day">{fmtYen(u.hourlyRate * HOURS_PER_DAY)}</span>
            </div>
          ))}
        </div>
        <p className="hint">
          平均単価 {fmtYen(derived.defaultRate)}/h ・ 全員の週あたり稼働 {fmtNum(data.users.reduce((s, u) => s + u.weeklyCapacity, 0))}h
        </p>
        <div className="modal__foot">
          <button type="button" className="btn btn--primary" onClick={onClose} autoFocus>
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
