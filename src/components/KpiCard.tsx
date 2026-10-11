import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { cx } from './cx'

interface Props {
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  icon?: LucideIcon
  /** red は 100%超負荷・重大リスクに限定。attention は橙 */
  tone?: 'default' | 'critical' | 'attention' | 'good'
  to?: string
  onClick?: () => void
}

export function KpiCard({ label, value, unit, sub, icon: Icon, tone = 'default', to, onClick }: Props) {
  const navigate = useNavigate()
  const clickable = !!to || !!onClick
  const activate = () => (onClick ? onClick() : to && navigate(to))
  return (
    <div
      className={cx('kpi', `kpi--${tone}`, clickable && 'is-clickable')}
      onClick={clickable ? activate : undefined}
      onKeyDown={clickable ? (e) => (e.key === 'Enter' || e.key === ' ') && activate() : undefined}
      role={clickable ? 'link' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <div className="kpi__head">
        <span className="kpi__label">{label}</span>
        {Icon && <Icon size={16} className="kpi__icon" />}
      </div>
      <div className="kpi__value">
        {value}
        {unit && <span className="kpi__unit">{unit}</span>}
      </div>
      {sub && <div className="kpi__sub">{sub}</div>}
    </div>
  )
}
