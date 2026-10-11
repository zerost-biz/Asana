import { Award, Check, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from './Avatar'
import { Card } from './Card'
import { ConfirmDialog } from './ConfirmDialog'
import { useToast } from './Toast'
import { cx } from './cx'
import { fmtNum, fmtSignedH, fmtSignedYen, fmtYen } from '../domain/format'
import type { CloseMember, ProjectClose } from '../domain/types'
import { useApp } from '../store/AppContext'

/** プロジェクト完了処理: 成果・学び・再利用できる資産・メンバーの役割とスキル → 経験（候補）としてメンバーへ蓄積 */
export function ProjectCloseView({ projectId }: { projectId: string }) {
  const { data, derived, actions, can } = useApp()
  const { toast } = useToast()
  const summary = derived.summaryById.get(projectId)
  const existing = data.closes.find((c) => c.projectId === projectId)
  const project = summary?.project

  const initial = useMemo<ProjectClose>(() => {
    if (existing) return existing
    const members: CloseMember[] = (summary?.memberIds ?? []).map((uid) => ({
      userId: uid,
      role: uid === project?.ownerId ? 'PJリード' : 'メンバー',
      summary: '',
      skillIds: [],
      nextRecommendation: '',
    }))
    return {
      projectId,
      outcome: '',
      valueText: '',
      revenue: project?.budget,
      lessons: '',
      reusableAssets: '',
      members,
      status: 'draft',
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])
  const [draft, setDraft] = useState<ProjectClose>(initial)
  const [confirm, setConfirm] = useState(false)

  if (!summary || !project) return null
  const closed = existing?.status === 'closed'
  const editable = can('close.edit', { project }) && !closed
  const { totals, cost } = summary
  const openLeaves = summary.leaves.filter((l) => l.status !== 'done' && l.type !== 'milestone')
  const patch = (p: Partial<ProjectClose>) => setDraft((d) => ({ ...d, ...p }))
  const setMember = (i: number, p: Partial<CloseMember>) => setDraft((d) => ({ ...d, members: d.members.map((m, k) => (k === i ? { ...m, ...p } : m)) }))
  const invalid = !draft.outcome.trim() || !draft.lessons.trim() || draft.members.length === 0 || draft.members.some((m) => !m.role)

  const save = () => {
    actions.saveClose({ ...draft, status: 'draft' })
    toast('完了記録を下書き保存しました')
  }
  const finalize = () => {
    actions.saveClose({ ...draft, status: 'draft' })
    actions.finalizeClose(projectId)
    setConfirm(false)
    toast(<><strong>{project.name}</strong> を完了しました。メンバーの経験（候補）を作成しました</>)
  }

  return (
    <div className="ov">
      <div className="ov__main">
        {closed && (
          <div className="notice-inline" role="status">
            <Check size={14} /> 完了済みです（{existing?.closedAt}）。経験はメンバーの「プロジェクト経験」に候補として載り、本人またはリーダーが確定します。
          </div>
        )}

        <Card title="成果と学び" subtitle="何を達成し、何を学んだか。次のプロジェクトに活かせる形で残します">
          <div className="form">
            <label className="field">
              <span className="field__label">達成した成果</span>
              <textarea className="input input--area" rows={3} value={draft.outcome} disabled={!editable} onChange={(e) => patch({ outcome: e.target.value })} placeholder="例: 現状分析レポートを納品し、MES構想の提案につながった" />
            </label>
            <div className="form__row">
              <label className="field">
                <span className="field__label">売上または価値</span>
                <input className="input" value={draft.valueText} disabled={!editable} onChange={(e) => patch({ valueText: e.target.value })} placeholder="例: 売上 240万円・次期案件の受注" />
              </label>
              <label className="field">
                <span className="field__label">売上（円・任意）</span>
                <input
                  type="number"
                  min={0}
                  className="input input--num"
                  value={draft.revenue ?? ''}
                  disabled={!editable}
                  onChange={(e) => patch({ revenue: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              </label>
            </div>
            <label className="field">
              <span className="field__label">学び・振り返り</span>
              <textarea className="input input--area" rows={3} value={draft.lessons} disabled={!editable} onChange={(e) => patch({ lessons: e.target.value })} placeholder="うまくいったこと／次に変えること" />
            </label>
            <label className="field">
              <span className="field__label">再利用できる資産（テンプレート・資料・手法）</span>
              <textarea className="input input--area" rows={2} value={draft.reusableAssets} disabled={!editable} onChange={(e) => patch({ reusableAssets: e.target.value })} placeholder="例: 業務フロー整理のテンプレート、ヒアリング質問票" />
            </label>
          </div>
        </Card>

        <Card title="メンバーの役割とスキル" subtitle="誰が何を担当し、どのスキルを使った・伸ばしたか。完了すると、メンバーごとに経験の候補が作られます">
          {draft.members.length === 0 ? (
            <div className="empty">メンバーがいません</div>
          ) : (
            draft.members.map((m, i) => {
              const u = derived.userById.get(m.userId)
              return (
                <div key={m.userId} className="closemember">
                  <div className="closemember__head">
                    <Avatar user={u} size="sm" />
                    <strong>{u?.name}</strong>
                    <select className="input input--sm" value={m.role} disabled={!editable} onChange={(e) => setMember(i, { role: e.target.value })} aria-label={`${u?.name}の役割`}>
                      {data.settings.roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                      {!data.settings.roles.includes(m.role) && <option value={m.role}>{m.role}</option>}
                    </select>
                  </div>
                  <input className="input" value={m.summary} disabled={!editable} onChange={(e) => setMember(i, { summary: e.target.value })} placeholder="担当した内容・成果" aria-label={`${u?.name}の担当内容`} />
                  <div className="chipset" aria-label="使った・伸ばしたスキル">
                    {data.skills.map((s) => {
                      const on = m.skillIds.includes(s.id)
                      return (
                        <button key={s.id} type="button" className={cx(on && 'is-on')} aria-pressed={on} disabled={!editable} onClick={() => setMember(i, { skillIds: on ? m.skillIds.filter((x) => x !== s.id) : [...m.skillIds, s.id] })}>
                          {s.name}
                        </button>
                      )
                    })}
                  </div>
                  <input className="input" value={m.nextRecommendation} disabled={!editable} onChange={(e) => setMember(i, { nextRecommendation: e.target.value })} placeholder="次に任せたい役割・経験させたいこと" aria-label={`${u?.name}の次の推薦`} />
                </div>
              )
            })
          )}
        </Card>
      </div>

      <div className="ov__side">
        <Card title="計画と実績">
          <dl className="ov__dl">
            <div>
              <dt>計画</dt>
              <dd>{fmtNum(totals.plan)}h</dd>
            </div>
            <div>
              <dt>実績</dt>
              <dd>{fmtNum(totals.act)}h</dd>
            </div>
            <div>
              <dt>見込み（実績＋残り）</dt>
              <dd>{fmtNum(totals.eac)}h</dd>
            </div>
            <div>
              <dt>差異</dt>
              <dd className={cx(totals.variance > 0.05 && 'pf__over')}>{fmtSignedH(totals.variance)}</dd>
            </div>
            <div>
              <dt>人件費（見込み）</dt>
              <dd>{fmtYen(totals.eacCost)}</dd>
            </div>
            <div>
              <dt>粗利</dt>
              <dd>{cost.margin === null ? '—' : `${fmtSignedYen(cost.margin)}（${Math.round((cost.marginRate ?? 0) * 100)}%）`}</dd>
            </div>
          </dl>
        </Card>

        {!closed && (
          <Card title="完了する" action={<Award size={16} />}>
            {openLeaves.length > 0 && (
              <p className="form__warn">
                <TriangleAlert size={13} /> 未完了の作業が {openLeaves.length} 件あります。完了後も記録は残りますが、残りの工数は稼働状況から外れます。
              </p>
            )}
            {summary.openRisks.length > 0 && <p className="form__warn">未解決のリスク・課題が {summary.openRisks.length} 件あります。</p>}
            <p className="hint">「成果」「学び」「メンバーの役割」が入力されると、完了できます。完了するとプロジェクトの状態が「完了」になります。</p>
            {editable ? (
              <div className="decide">
                <button type="button" className="btn btn--ghost" onClick={save}>
                  下書きを保存
                </button>
                <button type="button" className="btn btn--primary" disabled={invalid} onClick={() => setConfirm(true)}>
                  完了して経験を記録する
                </button>
              </div>
            ) : (
              <p className="hint">完了処理は、このプロジェクトのリーダー、または課長以上が行えます。</p>
            )}
          </Card>
        )}

        {closed && (
          <Card title="次のステップ">
            <ul className="rb">
              {(existing?.members ?? []).map((m) => (
                <li key={m.userId}>
                  <Link to={`/people/${m.userId}`}>
                    <Avatar user={derived.userById.get(m.userId)} size="sm" />
                    <span className="rb__text">
                      <strong>{derived.userById.get(m.userId)?.name}：経験を確認する</strong>
                      <small>{m.nextRecommendation || m.role}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {confirm && (
        <ConfirmDialog title="プロジェクトを完了しますか？" confirmLabel="完了する" onCancel={() => setConfirm(false)} onConfirm={finalize}>
          「{project.name}」を完了にし、メンバー {draft.members.length} 名の経験（候補）を作成します。経験は本人またはリーダーが確定するまで、スキルには反映されません。
        </ConfirmDialog>
      )}
    </div>
  )
}
