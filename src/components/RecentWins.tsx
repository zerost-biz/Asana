import { Trophy } from 'lucide-react'
import { RECENT_WINS } from '../data/seed'

const ago = (n: number) => (n <= 0 ? '今日' : n === 1 ? '昨日' : `${n}日前`)

/** ダミーデータ（実績との連動なし） */
export function RecentWins() {
  return (
    <ul className="wins">
      {RECENT_WINS.map((w) => (
        <li key={w.title}>
          <span className="wins__icon">
            <Trophy size={16} />
          </span>
          <span className="wins__text">
            <strong>{w.title}</strong>
            <span>{w.note}</span>
          </span>
          <time>{ago(w.daysAgo)}</time>
        </li>
      ))}
    </ul>
  )
}
