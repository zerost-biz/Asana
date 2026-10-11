import type { User } from '../domain/types'
import { cx } from './cx'

const tone = (id: string): number => {
  let h = 0
  for (const ch of id) h = (h + ch.charCodeAt(0)) % 6
  return h
}

interface Props {
  user?: User | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Avatar({ user, size = 'md', className }: Props) {
  if (!user) {
    return <span className={cx('avatar', `avatar--${size}`, 'avatar--empty', className)}>–</span>
  }
  return (
    <span className={cx('avatar', `avatar--${size}`, `avatar--t${tone(user.id)}`, className)} title={user.name}>
      {user.initials}
    </span>
  )
}

/** 担当者の重なり表示（親行など） */
export function AvatarStack({ users, max = 3 }: { users: User[]; max?: number }) {
  const shown = users.slice(0, max)
  const rest = users.length - shown.length
  return (
    <span className="avatar-stack">
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size="sm" />
      ))}
      {rest > 0 && <span className="avatar avatar--sm avatar--empty">+{rest}</span>}
    </span>
  )
}
