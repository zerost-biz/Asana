import { Users } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { PageHeader } from '../components/PageHeader'
import { PeopleTabs } from '../components/PeopleTabs'
import { Stars } from '../components/Stars'
import { cx } from '../components/cx'
import { availabilityOf } from '../domain/talent'
import { ROLE_LABEL } from '../domain/types'
import { loadLevel } from '../domain/workload'
import { useApp } from '../store/AppContext'

/** メンバー一覧（タレントの入口）。誰が何をできるか・今どれくらい空いているかを一覧する */
export function PeoplePage() {
  const { data, derived } = useApp()
  const rows = useMemo(
    () =>
      data.users.map((u) => {
        const ui = derived.workloadAll.users.findIndex((x) => x.id === u.id)
        const cells = ui >= 0 ? derived.workloadAll.cells[ui] : []
        const avail = cells.length > 0 ? availabilityOf(cells) : { thisWeek: 0, futureFree: 0, freeHours: [] }
        const next4 = cells.slice(0, 4)
        const monthLoad = next4.length > 0 ? next4.reduce((s, c) => s + c.forecastUtilization, 0) / next4.length : 0
        const nextMonthCells = cells.slice(4, 8)
        const nextFree = nextMonthCells.length > 0 ? nextMonthCells.reduce((s, c) => s + Math.max(0, 1 - c.forecastUtilization), 0) / nextMonthCells.length : 0
        const skills = data.userSkills.filter((s) => s.userId === u.id && s.level >= 3).sort((a, b) => b.level - a.level)
        const pending = data.experiences.filter((e) => e.userId === u.id && e.status === 'candidate').length
        const growth = data.growthFocus.filter((g) => g.userId === u.id)
        return { u, avail, monthLoad, nextFree, skills, pending, growth }
      }),
    [data, derived.workloadAll],
  )

  return (
    <div className="page">
      <PageHeader
        title="メンバー"
        sub="人事評価ではなく、「誰が何をできるか」「何を経験したか」「次に何を経験させたいか」を、配置の判断に使うための軽量なタレント基盤です"
      />
      <PeopleTabs />
      <div className="people">
        {rows.map(({ u, avail, monthLoad, nextFree, skills, pending, growth }) => (
          <Link key={u.id} to={`/people/${u.id}`} className={cx('pcard', u.status === 'inactive' && 'is-off')}>
            <div className="pcard__head">
              <Avatar user={u} size="lg" />
              <div className="pcard__who">
                <strong>
                  {u.name}
                  {pending > 0 && <em className="badge-new" title="確認待ちの経験があります">NEW</em>}
                </strong>
                <span>{u.jobTitle}</span>
                <small>
                  {ROLE_LABEL[u.role]} · {u.team}
                  {u.status === 'inactive' ? ' · 停止中' : ''}
                </small>
              </div>
            </div>
            <div className="pcard__load">
              <div className={cx('pcard__pill', `pcard__pill--${loadLevel(avail.thisWeek, data.settings)}`)}>
                <small>今週の負荷</small>
                <b>{Math.round(avail.thisWeek * 100)}%</b>
              </div>
              <div className={cx('pcard__pill', `pcard__pill--${loadLevel(monthLoad, data.settings)}`)}>
                <small>今後4週の見込み負荷</small>
                <b>{Math.round(monthLoad * 100)}%</b>
              </div>
              <div className="pcard__pill pcard__pill--free">
                <small>来月の空き</small>
                <b>{Math.round(nextFree * 100)}%</b>
              </div>
            </div>
            <div className="pcard__skills">
              {skills.length === 0 && <small className="hint">レベル3以上のスキルはまだありません</small>}
              {skills.slice(0, 5).map((s) => (
                <span key={s.skillId} className="skillchip">
                  {data.skills.find((k) => k.id === s.skillId)?.name}
                  <Stars level={s.level} size={11} />
                </span>
              ))}
            </div>
            {growth[0] && <p className="pcard__growth">育成テーマ: {growth[0].text}</p>}
          </Link>
        ))}
        {rows.length === 0 && (
          <div className="empty empty--big">
            <Users size={28} />
            メンバーがいません
          </div>
        )}
      </div>
    </div>
  )
}
