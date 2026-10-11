import { ChevronRight, CircleCheck, Clock, Flag, Gauge, Lock, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Decision, DecisionKind } from '../domain/decisions'
import { useApp } from '../store/AppContext'
import { cx } from './cx'

const ICON: Record<DecisionKind, typeof Gauge> = {
  overload: Gauge,
  eac: TrendingUp,
  risk: Flag,
  overdue: Clock,
  blocked: Lock,
}

const LIMIT = 6

/** 要判断リスト。状態から毎回導出されるため、入力すると増減する */
export function DecisionList() {
  const { derived } = useApp()
  const navigate = useNavigate()
  const [all, setAll] = useState(false)
  const list: Decision[] = derived.decisions
  const shown = all ? list : list.slice(0, LIMIT)

  if (list.length === 0) {
    return (
      <div className="empty">
        <CircleCheck size={20} />
        現在、判断が必要な項目はありません
      </div>
    )
  }
  return (
    <div className="dl">
      <ul>
        {shown.map((d) => {
          const Icon = ICON[d.kind]
          return (
            <li key={d.id}>
              <button type="button" className={cx('dl__item', `dl__item--${d.tone}`)} onClick={() => navigate(d.to)}>
                <span className="dl__icon">
                  <Icon size={16} />
                </span>
                <span className="dl__text">
                  <strong>{d.title}</strong>
                  <span>{d.detail}</span>
                </span>
                <ChevronRight size={16} className="dl__go" />
              </button>
            </li>
          )
        })}
      </ul>
      {list.length > LIMIT && (
        <button type="button" className="link-btn" onClick={() => setAll((v) => !v)}>
          {all ? '折りたたむ' : `ほか ${list.length - LIMIT} 件を表示`}
        </button>
      )}
    </div>
  )
}
