import { ArrowLeft, Check, History, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Card } from '../components/Card'
import { CommitField } from '../components/CommitField'
import { Stars } from '../components/Stars'
import { useToast } from '../components/Toast'
import { cx } from '../components/cx'
import { fmtDateTime, fmtMD } from '../domain/dates'
import { fmtNum } from '../domain/format'
import { availabilityOf, domainsOf, experienceViews, recommendNext, skillLevelOf } from '../domain/talent'
import { ROLE_LABEL, SKILL_LEVEL_LABEL, type Experience } from '../domain/types'
import { loadLevel } from '../domain/workload'
import { useApp } from '../store/AppContext'
import { NotFoundPage } from './NotFoundPage'

/** タレントプロフィール: スキル・経験・得意領域・育成テーマ・将来の空き・次におすすめの案件 */
export function TalentProfilePage() {
  const { userId = '' } = useParams()
  const { data, derived, actions, can, me } = useApp()
  const { toast } = useToast()
  const user = data.users.find((u) => u.id === userId)
  const [growthText, setGrowthText] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [levelUp, setLevelUp] = useState<string[]>([])
  const [addingExp, setAddingExp] = useState(false)
  const [expDraft, setExpDraft] = useState({ projectId: '', role: '', summary: '' })

  const ui = derived.workloadAll.users.findIndex((u) => u.id === userId)
  const cells = useMemo(() => (ui >= 0 ? derived.workloadAll.cells[ui] : []), [ui, derived.workloadAll])
  const avail = useMemo(() => (cells.length > 0 ? availabilityOf(cells) : null), [cells])
  const views = useMemo(() => experienceViews(userId, data.experiences, data.projects, data.customers), [userId, data])
  const domains = useMemo(() => domainsOf(views), [views])

  const ctx = useMemo(
    () => ({
      userSkills: data.userSkills,
      experiences: data.experiences,
      growthFocus: data.growthFocus,
      projects: data.projects,
      customers: data.customers,
      weights: data.settings.matchWeights,
    }),
    [data],
  )
  const recs = useMemo(
    () => (user && cells.length > 0 ? recommendNext(user, data.opportunities, derived.weeksAll, cells, ctx, data.settings.baseCapacity).slice(0, 4) : []),
    [user, cells, data.opportunities, derived.weeksAll, ctx, data.settings.baseCapacity],
  )

  if (!user) return <NotFoundPage message="このメンバーは見つかりません" />

  const canSkill = can('skill.edit', { targetUserId: userId })
  const leaderPlus = can('skill.confirm')
  const myGrowth = data.growthFocus.filter((g) => g.userId === userId)
  const skillLogs = data.activity.filter((l) => l.entityType === 'user_skill' && l.entityId.startsWith(`${userId}:`)).slice().reverse()
  const pendingExp = views.filter((v) => v.experience.status === 'candidate')
  const next4 = cells.slice(0, 4)
  const monthLoad = next4.length > 0 ? next4.reduce((s, c) => s + c.forecastUtilization, 0) / next4.length : 0
  const nextMonth = cells.slice(4, 8)
  const nextFree = nextMonth.length > 0 ? nextMonth.reduce((s, c) => s + Math.max(0, 1 - c.forecastUtilization), 0) / nextMonth.length : 0
  const maxFree = Math.max(1, ...(avail?.freeHours ?? [1]))

  const setSkill = (skillId: string, level: number, evidence?: string) => {
    const cur = data.userSkills.find((s) => s.userId === userId && s.skillId === skillId)
    actions.setUserSkill({
      userId,
      skillId,
      level,
      evidence: evidence ?? cur?.evidence ?? '',
      updatedAt: derived.todayISO,
      // 本人の自己申告は「未確認」、リーダー以上の更新は確認済みとして残す
      confirmedBy: leaderPlus ? me.id : undefined,
    })
  }

  const confirmExp = (e: Experience) => {
    actions.confirmExperience(e.id, levelUp)
    toast(<>経験「{derived.projectById.get(e.projectId)?.name}（{e.role}）」を確定しました{levelUp.length > 0 ? `（スキル${levelUp.length}件のレベルを更新）` : ''}</>)
    setConfirming(null)
    setLevelUp([])
  }

  const addExp = () => {
    if (!expDraft.projectId || !expDraft.role.trim()) return
    const p = derived.projectById.get(expDraft.projectId)
    actions.addExperience({
      userId,
      projectId: expDraft.projectId,
      role: expDraft.role.trim(),
      summary: expDraft.summary.trim(),
      skillIds: [],
      status: 'confirmed',
      startDate: p?.startDate ?? derived.todayISO,
      endDate: p?.endDate ?? derived.todayISO,
    })
    setExpDraft({ projectId: '', role: '', summary: '' })
    setAddingExp(false)
    toast('経験を追加しました')
  }

  return (
    <div className="page">
      <Link to="/people" className="opp__back">
        <ArrowLeft size={15} /> メンバー一覧へ戻る
      </Link>
      <div className="profile__hero">
        <Avatar user={user} size="lg" />
        <div>
          <h1>{user.name}</h1>
          <p>
            {user.jobTitle} · {ROLE_LABEL[user.role]} · {user.team}
            {user.status === 'inactive' ? ' · 停止中' : ''}
          </p>
        </div>
        <div className="profile__stats">
          <div className={cx('pcard__pill', `pcard__pill--${loadLevel(avail?.thisWeek ?? 0, data.settings)}`)}>
            <small>今週の負荷</small>
            <b>{Math.round((avail?.thisWeek ?? 0) * 100)}%</b>
          </div>
          <div className={cx('pcard__pill', `pcard__pill--${loadLevel(monthLoad, data.settings)}`)}>
            <small>今後4週（見込み込み）</small>
            <b>{Math.round(monthLoad * 100)}%</b>
          </div>
          <div className="pcard__pill pcard__pill--free">
            <small>来月の空き</small>
            <b>{Math.round(nextFree * 100)}%</b>
          </div>
        </div>
      </div>

      <div className="profile">
        <div className="profile__main">
          <Card
            title="スキル"
            subtitle="レベル: 1=基礎 / 2=支援あり / 3=自走 / 4=指導 / 5=専門責任者。自己申告だけでなく、プロジェクト経験・上司の確認を根拠として残します"
          >
            {data.skills.map((sk) => {
              const us = data.userSkills.find((s) => s.userId === userId && s.skillId === sk.id)
              const lv = us?.level ?? 0
              return (
                <div key={sk.id} className="skrow">
                  <div className="skrow__name">
                    <strong>{sk.name}</strong>
                    <small>{sk.category}</small>
                  </div>
                  {lv > 0 ? <Stars level={lv} size={15} /> : <small className="hint">未経験</small>}
                  <div className="skrow__ev">
                    {canSkill ? (
                      <CommitField
                        className="input input--sm"
                        value={us?.evidence ?? ''}
                        placeholder="根拠（経験したPJ・確認者など）"
                        disabled={lv === 0}
                        aria-label={`${sk.name}の根拠`}
                        onCommit={(v) => setSkill(sk.id, lv, v)}
                      />
                    ) : (
                      us?.evidence || '—'
                    )}
                    {us && (
                      <small>
                        {fmtMD(us.updatedAt)} 更新{us.confirmedBy ? ` · ${derived.userById.get(us.confirmedBy)?.name}が確認` : ' · 本人申告（未確認）'}
                      </small>
                    )}
                  </div>
                  {canSkill ? (
                    <select className="input input--sm" value={lv} onChange={(e) => setSkill(sk.id, Number(e.target.value))} aria-label={`${sk.name}のレベル`}>
                      {[0, 1, 2, 3, 4, 5].map((l) => (
                        <option key={l} value={l}>
                          {l === 0 ? '未経験' : `Lv${l} ${SKILL_LEVEL_LABEL[l]}`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="hint">Lv{lv}</span>
                  )}
                </div>
              )
            })}
            {!canSkill && <p className="hint">スキルの変更は、本人またはリーダー以上が行えます。</p>}
          </Card>

          <Card
            title="プロジェクト経験"
            subtitle="プロジェクト完了時に自動で候補が作られ、本人・リーダーが確定します（確定すると、使ったスキルに反映できます）"
            action={
              can('experience.confirm', { targetUserId: userId }) ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAddingExp((v) => !v)}>
                  <Plus size={14} /> 経験を追加
                </button>
              ) : undefined
            }
          >
            {addingExp && (
              <div className="form expform">
                <div className="form__row form__row--3">
                  <label className="field">
                    <span className="field__label">プロジェクト</span>
                    <select className="input" value={expDraft.projectId} onChange={(e) => setExpDraft({ ...expDraft, projectId: e.target.value })} aria-label="プロジェクト">
                      <option value="">選択</option>
                      {data.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">役割</span>
                    <select className="input" value={expDraft.role} onChange={(e) => setExpDraft({ ...expDraft, role: e.target.value })} aria-label="役割">
                      <option value="">選択</option>
                      {data.settings.roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">内容</span>
                    <input className="input" value={expDraft.summary} onChange={(e) => setExpDraft({ ...expDraft, summary: e.target.value })} placeholder="担当した内容・成果" />
                  </label>
                </div>
                <div className="cand__go">
                  <button type="button" className="btn btn--primary btn--sm" onClick={addExp} disabled={!expDraft.projectId || !expDraft.role}>
                    追加
                  </button>
                </div>
              </div>
            )}
            {views.length === 0 ? (
              <div className="empty">経験の記録はまだありません</div>
            ) : (
              <ul className="explist">
                {views.map(({ experience: e, project, customer }) => (
                  <li key={e.id}>
                    <div className="explist__main">
                      <strong>
                        {project?.name ?? '（削除されたプロジェクト）'} · {e.role}
                        {e.status === 'candidate' ? <em className="badge-new">NEW・確認待ち</em> : <span className="chip chip--soft">確定</span>}
                      </strong>
                      <small>
                        {fmtMD(e.startDate)}–{fmtMD(e.endDate)}
                        {customer ? ` · ${customer.name}（${customer.industry}）` : ''}
                      </small>
                      {e.summary && <p>{e.summary}</p>}
                      {e.skillIds.length > 0 && (
                        <div className="chipset">
                          {e.skillIds.map((sid) => (
                            <span key={sid} className="chip">
                              {data.skills.find((s) => s.id === sid)?.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      {e.status === 'candidate' && can('experience.confirm', { targetUserId: userId, project }) && (
                        <button type="button" className="btn btn--primary btn--sm" onClick={() => (setConfirming(confirming === e.id ? null : e.id), setLevelUp([]))}>
                          <Check size={13} /> 確認して確定
                        </button>
                      )}
                      {can('experience.confirm', { targetUserId: userId, project }) && e.status === 'confirmed' && (
                        <button type="button" className="icon-btn icon-btn--sm" aria-label="この経験を削除" onClick={() => actions.deleteExperience(e.id)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    {confirming === e.id && (
                      <div className="explist__confirm">
                        <span>この経験で伸びたスキルのレベルを1つ上げる:</span>
                        {e.skillIds.length === 0 && <small>（スキルの指定なし）</small>}
                        {e.skillIds.map((sid) => {
                          const sk = data.skills.find((s) => s.id === sid)
                          const cur = skillLevelOf(data.userSkills, userId, sid)
                          return (
                            <label key={sid} className="check">
                              <input
                                type="checkbox"
                                checked={levelUp.includes(sid)}
                                onChange={() => setLevelUp((l) => (l.includes(sid) ? l.filter((x) => x !== sid) : [...l, sid]))}
                                disabled={cur >= 5}
                              />
                              {sk?.name}（Lv{cur} → Lv{Math.min(5, cur + 1)}）
                            </label>
                          )
                        })}
                        <button type="button" className="btn btn--primary btn--sm" onClick={() => confirmExp(e)}>
                          確定する
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="業界・顧客の経験" subtitle="確定した経験から">
            <div className="chipset">
              {domains.industries.length === 0 && domains.customers.length === 0 && <span className="hint">まだありません</span>}
              {domains.industries.map((d) => (
                <span key={d} className="chip chip--soft">
                  {d || '業界未設定'}
                </span>
              ))}
              {domains.customers.map((c) => (
                <span key={c} className="chip">
                  {c}
                </span>
              ))}
            </div>
          </Card>
        </div>

        <div className="profile__side">
          <Card title="次におすすめの案件・役割" subtitle="適合度が高い順。配置の検討へ進めます">
            {recs.length === 0 ? (
              <div className="empty">おすすめできる案件がありません</div>
            ) : (
              <ul className="rec">
                {recs.map((r) => (
                  <li key={`${r.id}:${r.role}`}>
                    <Link to={`/assignments?target=opp:${r.id}&role=${encodeURIComponent(r.role)}`}>
                      <span className="rec__text">
                        <strong>{r.title}</strong>
                        <small>{r.role}</small>
                      </span>
                      <span className="rec__match">{r.total}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="将来の空き（週ごと）" subtitle="稼働可能時間 − 確定 − 見込み。12週先まで">
            <div className="avail" aria-label="週ごとの空き時間">
              {(avail?.freeHours ?? []).map((h, i) => (
                <div key={i} className="avail__col" title={`${derived.weeksAll[i]?.range}：空き ${fmtNum(h)}h`}>
                  <div className={cx('avail__bar', h <= 0 && 'avail__bar--warn')} style={{ height: `${Math.max(3, (h / maxFree) * 70)}px` }} />
                  <small>{i === 0 ? '今週' : `+${i}`}</small>
                </div>
              ))}
            </div>
            <Link className="link-btn" to={`/workload?cell=${userId}:0`}>
              稼働状況で詳しく見る
            </Link>
          </Card>

          <Card title="得意領域・育成テーマ">
            <div className="chipset">
              {user.strengths.length === 0 && <span className="hint">得意領域は未登録です（管理で登録できます）</span>}
              {user.strengths.map((s) => (
                <span key={s} className="chip chip--soft">
                  {s}
                </span>
              ))}
            </div>
            <h4 className="subhead">育成テーマ（本人・上司）</h4>
            <ul className="gfocus">
              {myGrowth.length === 0 && <li className="hint">まだありません</li>}
              {myGrowth.map((g) => (
                <li key={g.id}>
                  <span>{g.text}</span>
                  <span className="chip">{g.by === 'self' ? '本人' : '上司'}</span>
                  {canSkill && (
                    <button type="button" className="icon-btn icon-btn--sm" aria-label="育成テーマを削除" onClick={() => actions.deleteGrowth(g.id)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canSkill && (
              <div className="irisks__add" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <input className="input input--sm" value={growthText} onChange={(e) => setGrowthText(e.target.value)} placeholder="例: 構想コンサルを自分で回せるようになる" aria-label="育成テーマ" />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={!growthText.trim()}
                  onClick={() => {
                    actions.upsertGrowth({ userId, text: growthText.trim(), by: me.id === userId ? 'self' : 'manager' })
                    setGrowthText('')
                  }}
                >
                  追加
                </button>
              </div>
            )}
          </Card>

          <Card title="スキルの変更履歴" action={<History size={15} />}>
            {skillLogs.length === 0 ? (
              <div className="empty">変更履歴はまだありません</div>
            ) : (
              <ul className="log">
                {skillLogs.slice(0, 8).map((l) => (
                  <li key={l.id}>
                    <Sparkles size={13} />
                    <span className="log__time">{fmtDateTime(l.timestamp)}</span>
                    <span className="log__who">{derived.userById.get(l.userId)?.name}</span>
                    <span className="log__text">{l.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {pendingExp.length > 0 && <p className="hint">確認待ちの経験が {pendingExp.length} 件あります。</p>}
        </div>
      </div>
    </div>
  )
}
