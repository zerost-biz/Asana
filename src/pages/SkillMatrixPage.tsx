import { Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Card } from '../components/Card'
import { PageHeader } from '../components/PageHeader'
import { PeopleTabs } from '../components/PeopleTabs'
import { useToast } from '../components/Toast'
import { cx } from '../components/cx'
import { buildSkillMatrix, growthCandidates } from '../domain/talent'
import { SKILL_LEVEL_LABEL } from '../domain/types'
import { useApp } from '../store/AppContext'

/** スキルマップ: 組織としてどのスキルが足りないか、誰に経験を積ませるべきかを見える化 */
export function SkillMatrixPage() {
  const { data, derived, actions, can, me } = useApp()
  const { toast } = useToast()
  const users = derived.activeUsers
  const rows = useMemo(() => buildSkillMatrix(users, data.skills, data.userSkills), [users, data.skills, data.userSkills])
  const short = rows.filter((r) => r.shortage > 0)

  const setLevel = (userId: string, skillId: string, level: number) => {
    const cur = data.userSkills.find((s) => s.userId === userId && s.skillId === skillId)
    actions.setUserSkill({
      userId,
      skillId,
      level,
      evidence: cur?.evidence ?? '',
      updatedAt: derived.todayISO,
      confirmedBy: can('skill.confirm') ? me.id : undefined,
    })
  }

  return (
    <div className="page">
      <PageHeader title="スキルマップ" sub="人 × スキルのレベル一覧。「レベル3以上（自走）」の人数が目標に足りないスキルを、育成の対象として見つけます" />
      <PeopleTabs />

      <div className="dash">
        <div className="dash__main">
          <Card title="スキル × メンバー" subtitle="1=基礎 / 2=支援あり / 3=自走 / 4=指導 / 5=専門責任者。セルで直接変更できます（権限のある方のみ）" flush>
            <div className="wl__scroll">
              <table className="smx" aria-label="スキルマップ">
                <thead>
                  <tr>
                    <th>スキル</th>
                    {users.map((u) => (
                      <th key={u.id}>
                        <Link to={`/people/${u.id}`} className="smx__head">
                          <Avatar user={u} size="sm" /> {u.name}
                        </Link>
                      </th>
                    ))}
                    <th>Lv3以上</th>
                    <th>目標</th>
                    <th>過不足</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.skill.id} className={cx(r.shortage > 0 && 'is-short')}>
                      <td className="smx__skill">
                        <strong>{r.skill.name}</strong>
                        <small>{r.skill.category}</small>
                      </td>
                      {users.map((u) => {
                        const lv = r.levels.get(u.id) ?? 0
                        const editable = can('skill.edit', { targetUserId: u.id })
                        return (
                          <td key={u.id}>
                            {editable ? (
                              <select
                                className={cx('lvsel', `lv--${lv}`)}
                                value={lv}
                                onChange={(e) => setLevel(u.id, r.skill.id, Number(e.target.value))}
                                aria-label={`${u.name}の${r.skill.name}のレベル`}
                                title={`Lv${lv} ${SKILL_LEVEL_LABEL[lv] ?? ''}`}
                              >
                                {[0, 1, 2, 3, 4, 5].map((l) => (
                                  <option key={l} value={l}>
                                    {l === 0 ? '–' : l}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className={cx('lv', `lv--${lv}`)} title={`Lv${lv} ${SKILL_LEVEL_LABEL[lv] ?? ''}`}>
                                {lv === 0 ? '–' : lv}
                              </span>
                            )}
                          </td>
                        )
                      })}
                      <td className="smx__count">{r.lv3Count}人</td>
                      <td className="smx__count">{r.skill.targetLv3Count}人</td>
                      <td className={cx('smx__count', r.shortage > 0 ? 'smx__short' : 'smx__ok')}>{r.shortage > 0 ? `あと${r.shortage}人` : '充足'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="dash__side">
          <Card title="育成の候補" subtitle="目標に足りないスキルについて、あと一歩（レベル2）の人" action={<Sparkles size={16} />}>
            {short.length === 0 ? (
              <div className="empty">目標に足りないスキルはありません</div>
            ) : (
              <ul className="rb">
                {short.map((r) => {
                  const cands = growthCandidates(r, users)
                  return (
                    <li key={r.skill.id} className="gcand">
                      <strong>
                        {r.skill.name} <small>あと{r.shortage}人</small>
                      </strong>
                      {cands.length === 0 ? (
                        <small className="hint">レベル2の人がいません。外部の力も検討してください</small>
                      ) : (
                        <div className="gcand__list">
                          {cands.map((u) => {
                            const has = data.growthFocus.some((g) => g.userId === u.id && g.skillId === r.skill.id)
                            return (
                              <span key={u.id} className="gcand__who">
                                <Avatar user={u} size="sm" /> {u.name}
                                {can('skill.edit', { targetUserId: u.id }) && (
                                  <button
                                    type="button"
                                    className="link-btn"
                                    disabled={has}
                                    onClick={() => {
                                      actions.upsertGrowth({ userId: u.id, text: `${r.skill.name}を自走レベル（Lv3）へ`, by: me.id === u.id ? 'self' : 'manager', skillId: r.skill.id })
                                      toast(`${u.name}の育成テーマに追加しました`)
                                    }}
                                  >
                                    {has ? '育成テーマ済み' : '育成テーマにする'}
                                  </button>
                                )}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
          <p className="hint">スキルの変更履歴は、各メンバーのプロフィールで確認できます。スキルの追加・目標人数の変更は「管理」で行います。</p>
        </div>
      </div>
    </div>
  )
}
