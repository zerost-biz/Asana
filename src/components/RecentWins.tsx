import { Award, Diamond, Rocket, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { fmtMD } from '../domain/dates'
import { useApp } from '../store/AppContext'

interface Win {
  id: string
  date: string
  icon: 'ms' | 'convert' | 'close'
  title: string
  sub: string
  to: string
}

const ICON = { ms: Diamond, convert: Rocket, close: Award } as const

/** 成果・前進: 達成したマイルストーン、PJ化した案件、完了したプロジェクト（状態から毎回導出） */
export function RecentWins() {
  const { data, derived } = useApp()
  const wins = useMemo<Win[]>(() => {
    const out: Win[] = []
    for (const l of derived.leaves) {
      if (l.type !== 'milestone' || l.status !== 'done') continue
      const p = derived.projectById.get(l.projectId)
      if (!p) continue
      out.push({
        id: `ms:${l.id}`,
        date: l.statusChangedAt,
        icon: 'ms',
        title: `${derived.summaryById.get(p.id)?.shortName ?? p.name} ${l.title} を達成`,
        sub: p.name,
        to: `/projects/${p.id}/wbs?task=${l.id}`,
      })
    }
    for (const o of data.opportunities) {
      if (o.stage !== 'converted' || !o.convertedProjectId) continue
      out.push({
        id: `opp:${o.id}`,
        date: o.convertedAt ?? o.createdAt,
        icon: 'convert',
        title: `${o.title} をプロジェクト化`,
        sub: '受注見込み → プロジェクト',
        to: `/projects/${o.convertedProjectId}`,
      })
    }
    for (const c of data.closes) {
      if (c.status !== 'closed') continue
      const p = derived.projectById.get(c.projectId)
      if (!p) continue
      out.push({
        id: `close:${c.projectId}`,
        date: c.closedAt ?? p.endDate,
        icon: 'close',
        title: `${p.name} を完了（学びを記録）`,
        sub: c.outcome.slice(0, 40),
        to: `/projects/${p.id}/close`,
      })
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6)
  }, [data.opportunities, data.closes, derived])

  if (wins.length === 0) return <div className="empty">まだ成果の記録はありません。マイルストーンを達成すると、ここに載ります。</div>
  return (
    <ul className="wins">
      {wins.map((w) => {
        const Icon = ICON[w.icon]
        return (
          <li key={w.id}>
            <Link to={w.to} className="wins__link">
              <span className="wins__icon">
                <Icon size={15} />
              </span>
              <span className="wins__text">
                <strong>{w.title}</strong>
                <span>
                  {fmtMD(w.date)} · {w.sub}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** 育成・成長: 最近の経験（候補を含む）とスキルの変化 */
export function GrowthFeed() {
  const { data, derived } = useApp()
  const items = useMemo(() => {
    const out: { id: string; date: string; title: string; sub: string; to: string; fresh: boolean }[] = []
    for (const e of data.experiences) {
      const u = derived.userById.get(e.userId)
      const p = derived.projectById.get(e.projectId)
      if (!u) continue
      out.push({
        id: `exp:${e.id}`,
        date: e.createdAt,
        title: `${u.name}：${p?.name ?? '案件'}で「${e.role}」を経験`,
        sub: e.status === 'candidate' ? '経験の候補（確認待ち）' : '経験として確定',
        to: `/people/${u.id}`,
        fresh: e.status === 'candidate',
      })
    }
    for (const us of data.userSkills) {
      if (us.level < 3) continue
      const u = derived.userById.get(us.userId)
      const sk = data.skills.find((s) => s.id === us.skillId)
      if (!u || !sk) continue
      out.push({
        id: `sk:${us.userId}:${us.skillId}`,
        date: us.updatedAt,
        title: `${u.name}：${sk.name} が レベル${us.level}`,
        sub: us.evidence || 'スキルの更新',
        to: `/people/${u.id}`,
        fresh: false,
      })
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5)
  }, [data.experiences, data.userSkills, data.skills, derived])

  if (items.length === 0) return <div className="empty">経験・スキルの更新はまだありません</div>
  return (
    <ul className="wins">
      {items.map((w) => (
        <li key={w.id}>
          <Link to={w.to} className="wins__link">
            <span className="wins__icon wins__icon--growth">
              <Sparkles size={15} />
            </span>
            <span className="wins__text">
              <strong>
                {w.title}
                {w.fresh && <em className="badge-new">NEW</em>}
              </strong>
              <span>
                {fmtMD(w.date)} · {w.sub}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
