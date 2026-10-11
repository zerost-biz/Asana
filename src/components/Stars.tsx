import { SKILL_LEVEL_LABEL } from '../domain/types'

/** スキルレベルの星表示（1=基礎 … 5=専門責任者） */
export function Stars({ level, size = 13 }: { level: number; size?: number }) {
  return (
    <span className="stars" title={`レベル${level}：${SKILL_LEVEL_LABEL[level] ?? ''}`} aria-label={`レベル${level}`} style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= level ? 'is-on' : ''}>
          ★
        </i>
      ))}
    </span>
  )
}
