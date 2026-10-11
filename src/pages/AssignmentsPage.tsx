import { Check, GitCompareArrows, Network, Trash2, TriangleAlert, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Card } from '../components/Card'
import { PageHeader } from '../components/PageHeader'
import { ProgressBar } from '../components/ProgressBar'
import { useToast } from '../components/Toast'
import { cx } from '../components/cx'
import { fmtMD, weekStartsBetween } from '../domain/dates'
import { clamp, fmtNum } from '../domain/format'
import { roleGapsForOpp, roleGapsForProject, type RoleGap } from '../domain/pipeline'
import { rankCandidates, type MatchResult, type MatchTarget } from '../domain/talent'
import { OPP_STAGE_LABEL, SKILL_LEVEL_LABEL, type Opportunity, type OpportunitySkill, type Project } from '../domain/types'
import { loadLevel } from '../domain/workload'
import { useApp } from '../store/AppContext'

type TargetKey = string // 'opp:<id>' | 'prj:<id>'

const MATCH_LABELS: { key: 'skill' | 'capacity' | 'experience' | 'growth' | 'continuity'; label: string; hint: string }[] = [
  { key: 'skill', label: 'スキル適合', hint: '必要なスキルのレベルを満たしているか' },
  { key: 'capacity', label: '空き適合', hint: '配置した期間に空きがあるか（85%以下で満点）' },
  { key: 'experience', label: '経験適合', hint: '同じ役割・業界・スキルの経験があるか' },
  { key: 'growth', label: '育成適合', hint: '本人・上司の育成テーマに合っているか' },
  { key: 'continuity', label: '継続性', hint: '同じ顧客・業界の経験があるか' },
]

/** 配置（アサイン）の検討。必要な役割・期間・工数・スキルと、人の空き・スキル・経験・育成を照らして推薦する（最終判断は人） */
export function AssignmentsPage() {
  const { data, derived, actions, can, me } = useApp()
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()

  // 配置の検討対象: 受注見込みの案件 / 計画中・進行中のプロジェクト
  const opps = useMemo(() => data.opportunities.filter((o) => o.stage !== 'converted' && o.stage !== 'lost'), [data.opportunities])
  const prjs = useMemo(() => data.projects.filter((p) => p.status === 'planned' || p.status === 'active'), [data.projects])

  const gapFor = (key: TargetKey): number => {
    const [t, id] = [key.slice(0, 3), key.slice(4)]
    if (t === 'opp') {
      const o = opps.find((x) => x.id === id)
      return o ? roleGapsForOpp(o, data.assignments, data.settings.baseCapacity).reduce((s, g) => s + g.gap, 0) : 0
    }
    const p = prjs.find((x) => x.id === id)
    return p ? roleGapsForProject(p, data.assignments, data.settings.baseCapacity).reduce((s, g) => s + g.gap, 0) : 0
  }

  const options: { key: TargetKey; label: string; gap: number }[] = [
    ...opps.map((o) => ({ key: `opp:${o.id}`, label: `［${OPP_STAGE_LABEL[o.stage]}］${o.title}`, gap: gapFor(`opp:${o.id}`) })),
    ...prjs.map((p) => ({ key: `prj:${p.id}`, label: `［${p.status === 'planned' ? '計画中' : '進行中'}］${p.name}`, gap: gapFor(`prj:${p.id}`) })),
  ]
  const requested = params.get('target')
  const target: TargetKey | null =
    requested && options.some((o) => o.key === requested) ? requested : (options.slice().sort((a, b) => b.gap - a.gap)[0]?.key ?? null)

  const kind = target?.slice(0, 3)
  const id = target?.slice(4) ?? ''
  const opp = kind === 'opp' ? opps.find((o) => o.id === id) : undefined
  const prj = kind === 'prj' ? prjs.find((p) => p.id === id) : undefined

  const setTarget = (key: TargetKey) =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.set('target', key)
        n.delete('role')
        return n
      },
      { replace: true },
    )

  return (
    <div className="page page--wide">
      <PageHeader
        title="配置"
        sub="必要な役割・期間・工数・スキルと、人の空き・スキル・経験・育成を照らし合わせて、候補を推薦します。決めるのは人です（自動で確定しません）"
      />
      {options.length === 0 ? (
        <div className="empty empty--big">
          <Network size={28} />
          <p>配置を検討する案件・プロジェクトがありません。受注見込みに案件を追加してください。</p>
          <Link to="/pipeline" className="btn btn--primary">
            受注見込みへ
          </Link>
        </div>
      ) : (
        <>
          <div className="asgbar">
            <label className="field">
              <span className="field__label">配置を検討する対象</span>
              <select className="input" value={target ?? ''} onChange={(e) => setTarget(e.target.value)} aria-label="配置を検討する対象">
                <optgroup label="受注見込みの案件">
                  {options
                    .filter((o) => o.key.startsWith('opp:'))
                    .map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                        {o.gap > 1 ? '　（人員不足）' : ''}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="プロジェクト">
                  {options
                    .filter((o) => o.key.startsWith('prj:'))
                    .map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                        {o.gap > 1 ? '　（人員不足）' : ''}
                      </option>
                    ))}
                </optgroup>
              </select>
            </label>
            <p className="hint">
              {options.filter((o) => o.gap > 1).length > 0
                ? `人員が足りていない対象: ${options.filter((o) => o.gap > 1).length}件`
                : 'すべての対象で必要な役割が配置されています'}
            </p>
          </div>

          {(opp || prj) && (
            <Planner
              key={target ?? ''}
              opp={opp}
              prj={prj}
              canPropose={can('assignment.propose')}
              canConfirm={can('assignment.confirm')}
              meName={me.name}
              onDone={(msg) => toast(msg)}
              actions={actions}
              data={data}
              derived={derived}
            />
          )}
        </>
      )}
    </div>
  )
}

type PlannerProps = {
  opp?: Opportunity
  prj?: Project
  canPropose: boolean
  canConfirm: boolean
  meName: string
  onDone: (msg: React.ReactNode) => void
  actions: ReturnType<typeof useApp>['actions']
  data: ReturnType<typeof useApp>['data']
  derived: ReturnType<typeof useApp>['derived']
}

function Planner({ opp, prj, canPropose, canConfirm, onDone, actions, data, derived }: PlannerProps) {
  const [params, setParams] = useSearchParams()
  const targetType: 'opportunity' | 'project' = opp ? 'opportunity' : 'project'
  const targetId = (opp?.id ?? prj?.id) as string
  const title = opp?.title ?? prj?.name ?? ''
  const customerId = (opp?.customerId ?? prj?.customerId) as string
  const startDate = (opp?.startDate ?? prj?.startDate) as string
  const endDate = (opp?.endDate ?? prj?.endDate) as string
  const base = data.settings.baseCapacity
  const gaps: RoleGap[] = opp ? roleGapsForOpp(opp, data.assignments, base) : roleGapsForProject(prj as Project, data.assignments, base)
  const roleNames = gaps.map((g) => g.role)
  const roleParam = params.get('role')
  const role = roleParam && roleNames.includes(roleParam) ? roleParam : (gaps.find((g) => g.gap > 1)?.role ?? roleNames[0] ?? '')
  const gap = gaps.find((g) => g.role === role)
  const periodWeeks = useMemo(() => weekStartsBetween(startDate, endDate), [startDate, endDate])
  const nWeeks = Math.max(1, periodWeeks.length)

  const [selected, setSelected] = useState<string | null>(null)
  const [hoursPerWeek, setHoursPerWeek] = useState(0)
  const [weekCount, setWeekCount] = useState(nWeeks)
  const [reason, setReason] = useState('')
  const [compare, setCompare] = useState<string[]>([])

  // 役割を切り替えたら、不足分を期間で割った時間を初期値にする
  useEffect(() => {
    const need = gap?.gap ?? 0
    const suggested = need > 0 ? Math.round((need / nWeeks) * 2) / 2 : Math.round(base * (gap?.fte ?? 0.3) * 2) / 2
    setHoursPerWeek(clamp(suggested || 8, 1, base))
    setWeekCount(nWeeks)
    setSelected(null)
    setReason('')
    setCompare([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, targetId, nWeeks])

  const skills: OpportunitySkill[] = useMemo(() => {
    if (!opp) return []
    const d = opp.demands.find((x) => x.role === role)
    return d && d.skillIds.length > 0 ? opp.skills.filter((s) => d.skillIds.includes(s.skillId)) : opp.skills
  }, [opp, role])

  const chosenWeeks = periodWeeks.slice(0, weekCount)
  const mt: MatchTarget = { role, skills, customerId, weekStarts: chosenWeeks, hoursPerWeek }
  const cellsByUser = useMemo(() => new Map(derived.workloadAll.users.map((u, i) => [u.id, derived.workloadAll.cells[i]])), [derived.workloadAll])
  const ctx = useMemo(
    () => ({
      userSkills: data.userSkills,
      experiences: data.experiences,
      growthFocus: data.growthFocus,
      projects: data.projects,
      customers: data.customers,
      weights: data.settings.matchWeights,
    }),
    [data.userSkills, data.experiences, data.growthFocus, data.projects, data.customers, data.settings.matchWeights],
  )
  const ranked: MatchResult[] = useMemo(
    () => rankCandidates(derived.activeUsers, mt, cellsByUser, derived.weeksAll, ctx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [derived.activeUsers, role, skills, customerId, weekCount, hoursPerWeek, cellsByUser, derived.weeksAll, ctx, periodWeeks],
  )

  const mine = data.assignments.filter((a) => a.targetType === targetType && a.targetId === targetId)
  const batches = [...new Set(mine.map((a) => a.batchId))].map((b) => mine.filter((a) => a.batchId === b))
  const weeksView = derived.weeksAll.filter((w) => chosenWeeks.includes(w.startISO)).slice(0, 8)
  const sel = ranked.find((r) => r.userId === selected)
  const selUser = sel ? derived.userById.get(sel.userId) : undefined
  const alreadyIn = (uid: string) => mine.some((a) => a.userId === uid && a.role === role)
  const outsideWindow = chosenWeeks.length > 0 && weeksView.length === 0

  const propose = () => {
    if (!sel || !selUser || hoursPerWeek <= 0 || chosenWeeks.length === 0) return
    actions.proposeAssignment({ targetType, targetId, userId: sel.userId, role, weekStarts: chosenWeeks, hoursPerWeek, reason: reason.trim() || undefined })
    onDone(
      <>
        <strong>{selUser.name}</strong> を「{role}」に仮配置しました（週{fmtNum(hoursPerWeek)}h × {chosenWeeks.length}週）。稼働状況に「受注見込み分」として反映されます
      </>,
    )
    setSelected(null)
    setReason('')
  }

  const toggleCompare = (uid: string) =>
    setCompare((c) => (c.includes(uid) ? c.filter((x) => x !== uid) : c.length >= 3 ? [...c.slice(1), uid] : [...c, uid]))

  return (
    <div className="plan">
      <div className="plan__left">
        <Card
          title={title}
          subtitle={`${derived.customerById.get(customerId)?.name ?? ''} · ${startDate} 〜 ${endDate}${opp ? ` · 確度${opp.probability}%` : ''}`}
          action={
            opp ? (
              <Link className="link-btn" to={`/pipeline/${opp.id}`}>
                案件の詳細
              </Link>
            ) : (
              <Link className="link-btn" to={`/projects/${prj?.id}`}>
                プロジェクト
              </Link>
            )
          }
        >
          {gaps.length === 0 ? (
            <div className="empty">
              必要な役割が登録されていません。{opp ? '案件の詳細で「必要な役割と工数」を入力してください。' : 'プロジェクトの設定で必要な役割を登録してください。'}
            </div>
          ) : (
            <div className="roles" role="radiogroup" aria-label="配置する役割">
              {gaps.map((g) => (
                <button
                  key={g.role}
                  type="button"
                  role="radio"
                  aria-checked={g.role === role}
                  className={cx('roles__item', g.role === role && 'is-on', g.gap > 1 && 'is-gap')}
                  onClick={() =>
                    setParams(
                      (prev) => {
                        const n = new URLSearchParams(prev)
                        n.set('role', g.role)
                        return n
                      },
                      { replace: true },
                    )
                  }
                >
                  <strong>{g.role}</strong>
                  <span>
                    必要 {fmtNum(g.demand)}h（{g.fte.toFixed(1)}人分） · 配置済み {fmtNum(g.assigned)}h
                  </span>
                  <em>{g.gap > 1 ? `不足 ${fmtNum(g.gap)}h` : '充足'}</em>
                </button>
              ))}
            </div>
          )}
          {opp && skills.length > 0 && (
            <p className="hint">
              必要スキル:{' '}
              {skills.map((s) => `${data.skills.find((k) => k.id === s.skillId)?.name} Lv${s.requiredLevel}（${SKILL_LEVEL_LABEL[s.requiredLevel]}）`).join(' / ')}
            </p>
          )}
        </Card>

        <Card title="配置の状況" subtitle="仮配置は「受注見込み分」として稼働状況に反映されます。確定は課長が行います">
          {batches.length === 0 ? (
            <div className="empty">まだ配置がありません</div>
          ) : (
            <ul className="asg asg--full">
              {batches.map((rows) => {
                const a = rows[0]
                const u = derived.userById.get(a.userId)
                return (
                  <li key={a.batchId}>
                    <Avatar user={u} size="sm" />
                    <span className="asg__who">
                      <strong>{u?.name}</strong>
                      <small>
                        {a.role} · 週{fmtNum(a.plannedHours)}h × {rows.length}週（{fmtMD(rows[0].weekStart)}〜{fmtMD(rows[rows.length - 1].weekStart)}）
                        {a.reason ? ` · 理由: ${a.reason}` : ''}
                      </small>
                    </span>
                    <span className={cx('chip', a.status === 'tentative' && 'chip--warn')}>{a.status === 'tentative' ? '仮' : '確定'}</span>
                    <span className="asg__btns">
                      {canConfirm && (
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => actions.setAssignmentStatus(a.batchId, a.status === 'tentative' ? 'confirmed' : 'tentative')}>
                          <Check size={13} />
                          {a.status === 'tentative' ? '確定する' : '仮に戻す'}
                        </button>
                      )}
                      {canPropose && (
                        <button
                          type="button"
                          className="icon-btn icon-btn--sm"
                          aria-label="この配置を取り消す"
                          title="取り消す"
                          onClick={() => {
                            actions.removeAssignment(a.batchId)
                            onDone('配置を取り消しました')
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="plan__right">
        <Card
          title={role ? `「${role}」の候補` : '候補'}
          subtitle={`適合度 = スキル${Math.round(data.settings.matchWeights.skill * 100)}% + 空き${Math.round(data.settings.matchWeights.capacity * 100)}% + 経験${Math.round(data.settings.matchWeights.experience * 100)}% + 育成${Math.round(data.settings.matchWeights.growth * 100)}% + 継続性${Math.round(data.settings.matchWeights.continuity * 100)}%（重みは管理で変更可）`}
        >
          {!role ? (
            <div className="empty">配置する役割を選んでください</div>
          ) : (
            <>
              <div className="plan__params">
                <label className="field">
                  <span className="field__label">週あたりの時間（h）</span>
                  <input type="number" min={1} max={base} step={0.5} className="input input--num" value={hoursPerWeek} onChange={(e) => setHoursPerWeek(Number(e.target.value) || 0)} aria-label="週あたりの時間" />
                </label>
                <label className="field">
                  <span className="field__label">配置する週数（最大{nWeeks}週）</span>
                  <input type="number" min={1} max={nWeeks} step={1} className="input input--num" value={weekCount} onChange={(e) => setWeekCount(clamp(Math.round(Number(e.target.value)) || 1, 1, nWeeks))} aria-label="配置する週数" />
                </label>
                <p className="hint plan__calc">
                  合計 {fmtNum(hoursPerWeek * weekCount)}h
                  {gap && gap.gap > 1 ? `（不足 ${fmtNum(gap.gap)}h）` : ''} · {fmtMD(chosenWeeks[0] ?? startDate)}〜
                </p>
              </div>

              <ul className="cands">
                {ranked.map((r) => {
                  const u = derived.userById.get(r.userId)!
                  const open = selected === r.userId
                  return (
                    <li key={r.userId} className={cx('cand', open && 'is-open', r.overload && 'is-over')}>
                      <div className="cand__head">
                        <Avatar user={u} size="md" />
                        <div className="cand__who">
                          <strong>{u.name}</strong>
                          <small>{u.jobTitle}</small>
                        </div>
                        <div className="cand__match" title="適合度（推薦の目安）">
                          <b>{r.total}</b>
                          <span>%</span>
                        </div>
                      </div>
                      <div className="cand__bars">
                        {MATCH_LABELS.map((m) => (
                          <div key={m.key} className="cand__bar" title={m.hint}>
                            <span>{m.label}</span>
                            <ProgressBar value={r[m.key]} size="sm" tone={r[m.key] >= 80 ? 'good' : r[m.key] >= 50 ? 'accent' : 'muted'} />
                            <b>{r[m.key]}</b>
                          </div>
                        ))}
                      </div>
                      <ul className="cand__notes">
                        {r.notes.map((n) => (
                          <li key={n} className={cx(n.includes('超える') && 'is-warn')}>
                            {n}
                          </li>
                        ))}
                      </ul>
                      <div className="cand__foot">
                        <label className="check">
                          <input type="checkbox" checked={compare.includes(r.userId)} onChange={() => toggleCompare(r.userId)} aria-label={`${u.name}を比較に加える`} />
                          比較
                        </label>
                        {alreadyIn(r.userId) && <span className="chip chip--soft">この役割に配置済み</span>}
                        {canPropose ? (
                          <button type="button" className={cx('btn btn--sm', open ? 'btn--ghost' : 'btn--primary')} onClick={() => setSelected(open ? null : r.userId)}>
                            <UserPlus size={14} />
                            {open ? '閉じる' : '仮配置する…'}
                          </button>
                        ) : null}
                      </div>

                      {open && (
                        <div className="cand__panel">
                          <h4>稼働の変化（受注見込みを含む負荷率）</h4>
                          {outsideWindow && <p className="hint">配置期間が12週先より後のため、稼働状況には表示されません（配置は記録されます）。</p>}
                          <div className="ba" role="table" aria-label="配置前後の負荷">
                            <div className="ba__row ba__row--head">
                              <span />
                              {weeksView.map((w) => (
                                <span key={w.index}>{w.label}</span>
                              ))}
                            </div>
                            {(['before', 'after'] as const).map((k) => (
                              <div key={k} className="ba__row">
                                <span className="ba__label">{k === 'before' ? '現在' : '配置後'}</span>
                                {weeksView.map((w) => {
                                  const v = r[k][w.index] ?? 0
                                  const lv = loadLevel(v, data.settings)
                                  return (
                                    <span key={w.index} className={cx('wo__pill', `wo__pill--${lv}`, 'ba__pill')}>
                                      {Math.round(v * 100)}%
                                    </span>
                                  )
                                })}
                              </div>
                            ))}
                          </div>
                          {r.overload && (
                            <p className="form__warn">
                              <TriangleAlert size={13} /> 配置すると、100%を超える週があります。時間・期間を調整するか、他の人を検討してください。
                            </p>
                          )}
                          <label className="field">
                            <span className="field__label">配置の理由（育成の意図など・任意）</span>
                            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例: 構想コンサルを自分で回す経験を積ませたい" />
                          </label>
                          <div className="cand__go">
                            <button type="button" className="btn btn--primary" onClick={propose} disabled={hoursPerWeek <= 0}>
                              仮配置する（週{fmtNum(hoursPerWeek)}h × {chosenWeeks.length}週）
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
              {!canPropose && <p className="hint">仮配置の登録は、リーダー以上の権限が必要です（推薦の確認はどなたでもできます）。</p>}

              {compare.length >= 2 && (
                <div className="cmp">
                  <h4>
                    <GitCompareArrows size={15} /> 案の比較（もしこの人を配置したら）
                  </h4>
                  <table>
                    <thead>
                      <tr>
                        <th />
                        {compare.map((uid) => (
                          <th key={uid}>{derived.userById.get(uid)?.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th>適合度</th>
                        {compare.map((uid) => (
                          <td key={uid}>{ranked.find((r) => r.userId === uid)?.total}%</td>
                        ))}
                      </tr>
                      {MATCH_LABELS.map((m) => (
                        <tr key={m.key}>
                          <th>{m.label}</th>
                          {compare.map((uid) => (
                            <td key={uid}>{ranked.find((r) => r.userId === uid)?.[m.key]}</td>
                          ))}
                        </tr>
                      ))}
                      <tr>
                        <th>配置後の最大負荷</th>
                        {compare.map((uid) => {
                          const r = ranked.find((x) => x.userId === uid)
                          const peak = r ? Math.max(0, ...r.after.filter((_, i) => chosenWeeks.includes(derived.weeksAll[i]?.startISO))) : 0
                          return (
                            <td key={uid} className={cx(peak > 1 && 'cmp__over')}>
                              {Math.round(peak * 100)}%
                            </td>
                          )
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
