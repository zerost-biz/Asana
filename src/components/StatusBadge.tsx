import { Lock } from 'lucide-react'
import type { Health, WbsStatus } from '../domain/types'
import { HEALTH_LABEL } from '../domain/calculations'
import { WBS_STATUS_LABEL } from '../domain/types'
import { cx } from './cx'

export function HealthBadge({ health, size = 'md', title }: { health: Health; size?: 'sm' | 'md'; title?: string }) {
  return (
    <span className={cx('badge', 'badge--health', `badge--${health.toLowerCase()}`, size === 'sm' && 'badge--sm')} title={title}>
      <span className="badge__dot" />
      {HEALTH_LABEL[health]}
    </span>
  )
}

const STATUS_CLASS: Record<WbsStatus, string> = {
  'not_started': 'todo',
  'in_progress': 'wip',
  blocked: 'blocked',
  done: 'done',
}

export function WbsStatusBadge({ status }: { status: WbsStatus }) {
  return (
    <span className={cx('badge', 'badge--status', `badge--${STATUS_CLASS[status]}`)}>
      {status === 'blocked' && <Lock size={11} strokeWidth={2.4} />}
      {WBS_STATUS_LABEL[status]}
    </span>
  )
}
