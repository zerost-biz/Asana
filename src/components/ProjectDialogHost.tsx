import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { templateTotalHours } from '../data/templates'
import { addDays, isWorkday, toISO } from '../domain/dates'
import { fmtNum, fmtYen } from '../domain/format'
import { PROJECT_STATUS_LABEL, type Project, type ProjectStatus } from '../domain/types'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { cx } from './cx'
import { useToast } from './Toast'

interface Api {
  openCreate: () => void
  openEdit: (projectId: string) => void
}

const Ctx = createContext<Api | null>(null)

type DialogState = { mode: 'create' } | { mode: 'edit'; id: string } | null

/** プロジェクトの追加・編集ダイアログをアプリのどこからでも開けるようにする */
export function ProjectDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(null)
  const openCreate = useCallback(() => setState({ mode: 'create' }), [])
  const openEdit = useCallback((id: string) => setState({ mode: 'edit', id }), [])
  const api = useMemo(() => ({ openCreate, openEdit }), [openCreate, openEdit])
  return (
    <Ctx.Provider value={api}>
      {children}
      {state && <ProjectDialog key={state.mode === 'edit' ? state.id : 'new'} state={state} onClose={() => setState(null)} />}
    </Ctx.Provider>
  )
}

export function useProjectDialog(): Api {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProjectDialog must be used within ProjectDialogProvider')
  return ctx
}

const STATUSES: ProjectStatus[] = ['active', 'planning', 'completed']

function ProjectDialog({ state, onClose }: { state: Exclude<DialogState, null>; onClose: () => void }) {
  const { data, actions, today } = useApp()
  const { toast } = useToast()
  const navigate = useNavigate()
  const editing: Project | undefined = state.mode === 'edit' ? data.projects.find((p) => p.id === state.id) : undefined
  const isEdit = !!editing

  // 既定の開始日は「今日以降の最初の営業日」（過去日にすると作成直後に遅延扱いになるため）
  const firstDay = (() => {
    let d = today
    while (!isWorkday(d)) d = addDays(d, 1)
    return d
  })()
  const [name, setName] = useState(editing?.name ?? '')
  const [status, setStatus] = useState<ProjectStatus>(editing?.status ?? 'active')
  const [start, setStart] = useState(editing?.startDate ?? toISO(firstDay))
  const [end, setEnd] = useState(editing?.endDate ?? toISO(addDays(firstDay, 7 * 8 - 3)))
  const [budget, setBudget] = useState(editing?.budget ? String(editing.budget) : '')
  const [template, setTemplate] = useState<'standard' | 'blank'>('standard')
  /** '__all__' = 全メンバーで分担 / '' = 未設定 / ユーザーid = その人 */
  const [owner, setOwner] = useState<string>('__all__')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const budgetNum = budget.trim() === '' ? undefined : Number(budget)
  const errors: string[] = []
  if (!name.trim()) errors.push('プロジェクト名を入力してください')
  if (!start || !end) errors.push('開始日・終了日を入力してください')
  else if (end < start) errors.push('終了日は開始日以降にしてください')
  if (budgetNum !== undefined && (!Number.isFinite(budgetNum) || budgetNum < 0)) errors.push('受注額は 0 以上の数値で入力してください')

  const submit = () => {
    if (errors.length > 0) return
    if (editing) {
      actions.updateProject(editing.id, {
        name: name.trim(),
        status,
        startDate: start,
        endDate: end,
        budget: budgetNum && budgetNum > 0 ? budgetNum : undefined,
      })
      toast(
        <>
          <strong>{name.trim()}</strong> を保存しました
        </>,
      )
      onClose()
      return
    }
    const id = actions.addProject({
      name: name.trim(),
      status,
      startDate: start,
      endDate: end,
      budget: budgetNum && budgetNum > 0 ? budgetNum : undefined,
      template,
      ownerIds: template !== 'standard' ? [] : owner === '__all__' ? data.users.map((u) => u.id) : owner ? [owner] : [],
    })
    toast(
      <>
        <strong>{name.trim()}</strong> を追加しました
        {template === 'standard' ? '（標準WBSテンプレート）' : '。List から「タスクを追加」でWBSを作成できます'}
      </>,
    )
    onClose()
    navigate(`/projects/${id}`)
  }

  const doDelete = () => {
    if (!editing) return
    actions.deleteProject(editing.id)
    toast(<>「{editing.name}」を削除しました</>, 'info')
    onClose()
    navigate('/projects')
  }

  if (confirmDelete && editing) {
    const taskCount = data.wbs.filter((w) => w.projectId === editing.id).length
    return (
      <div className="modal-scrim" onMouseDown={onClose}>
        <div className="modal" role="alertdialog" aria-label="プロジェクトの削除" onMouseDown={(e) => e.stopPropagation()}>
          <h3 className="modal__title">プロジェクトを削除しますか？</h3>
          <div className="modal__body">
            「{editing.name}」と、配下のWBS（{taskCount}件）、実績工数（TimeEntry）、リスクがすべて削除されます。
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmDelete(false)}>
              戻る
            </button>
            <button type="button" className="btn btn--primary" onClick={doDelete} autoFocus>
              削除する
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <form
        className="modal modal--wide"
        role="dialog"
        aria-label={isEdit ? 'プロジェクト設定' : 'プロジェクトを追加'}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h3 className="modal__title">{isEdit ? 'プロジェクト設定' : 'プロジェクトを追加'}</h3>

        <div className="form modal__form">
          <label className="field" htmlFor="pj-name">
            <span className="field__label">プロジェクト名</span>
            <input id="pj-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: D社 需給予測" autoFocus />
          </label>

          <div className="form__row">
            <label className="field" htmlFor="pj-start">
              <span className="field__label">開始日</span>
              <input id="pj-start" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="field" htmlFor="pj-end">
              <span className="field__label">終了日</span>
              <input id="pj-end" type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>

          <div className="form__row">
            <label className="field" htmlFor="pj-status">
              <span className="field__label">ステータス</span>
              <select id="pj-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="pj-budget">
              <span className="field__label">受注額・予算（円）</span>
              <input
                id="pj-budget"
                type="number"
                min={0}
                step={10000}
                inputMode="numeric"
                className="input input--num"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="未設定（社内PJ）"
              />
              <span className="field__help">
                {budgetNum && Number.isFinite(budgetNum) ? `${fmtYen(budgetNum)}。粗利の計算に使います` : '設定すると 受注額 − 人件費 で粗利を計算します'}
              </span>
            </label>
          </div>

          {!isEdit && (
            <>
              <div className="field">
                <span className="field__label">WBSの初期構成</span>
                <div className="choices" role="radiogroup" aria-label="WBSの初期構成">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={template === 'standard'}
                    className={cx('choice', template === 'standard' && 'is-on')}
                    onClick={() => setTemplate('standard')}
                  >
                    <strong>標準WBSテンプレート</strong>
                    <span>現状分析 → To-Be設計 → ロードマップ策定（3フェーズ・8タスク / 計 {fmtNum(templateTotalHours())}h）。期間に合わせて日程を自動配置</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={template === 'blank'}
                    className={cx('choice', template === 'blank' && 'is-on')}
                    onClick={() => setTemplate('blank')}
                  >
                    <strong>空のプロジェクト</strong>
                    <span>WBSなしで作成し、あとから List の「タスクを追加」で入力します</span>
                  </button>
                </div>
              </div>

              {template === 'standard' && (
                <label className="field" htmlFor="pj-owner">
                  <span className="field__label">テンプレートの担当者</span>
                  <div className="owner-select">
                    <Avatar user={data.users.find((u) => u.id === owner)} size="sm" />
                    <select id="pj-owner" className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
                      <option value="__all__">全メンバーで分担（タスクを順番に割り当て）</option>
                      <option value="">未設定（あとで割り当て）</option>
                      {data.users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="field__help">担当を設定すると、残工数（ETC）がその人の Workload に計上されます。個別の変更は WBS のドロワーから行えます。</span>
                </label>
              )}
            </>
          )}

          {errors.length > 0 && (
            <ul className="form__errors" role="alert">
              {errors.map((er) => (
                <li key={er}>{er}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="modal__foot modal__foot--split">
          {isEdit ? (
            <button type="button" className="btn btn--quiet" onClick={() => setConfirmDelete(true)}>
              プロジェクトを削除
            </button>
          ) : (
            <span />
          )}
          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              キャンセル
            </button>
            <button type="submit" className="btn btn--primary" disabled={errors.length > 0}>
              {isEdit ? '保存' : '追加'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
