import { Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { addDays, fmtMD, toISO } from '../domain/dates'
import { descendantsOf, leafMetrics } from '../domain/calculations'
import { clamp, fmtNum, fmtPct, fmtSignedH } from '../domain/format'
import { WBS_STATUSES, WBS_STATUS_LABEL, type WbsItem, type WbsStatus } from '../domain/types'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { ConfirmDialog } from './ConfirmDialog'
import { Drawer } from './Drawer'
import { ProgressBar } from './ProgressBar'
import { useToast } from './Toast'
import { cx } from './cx'

interface Props {
  projectId: string
  /** wbsId または 'new' */
  taskParam: string
  parentParam: string | null
  onClose: () => void
  onOpen: (id: string) => void
}

/** 右側ドロワー: タスクの編集 / 新規作成 */
export function TaskDrawer({ projectId, taskParam, parentParam, onClose, onOpen }: Props) {
  const { derived } = useApp()
  const isNew = taskParam === 'new'
  const item = isNew ? null : derived.idx.byId.get(taskParam) ?? null
  const missing = !isNew && (!item || item.projectId !== projectId)

  useEffect(() => {
    if (missing) onClose()
  }, [missing, onClose])

  if (missing) return null
  return (
    <TaskForm
      key={isNew ? `new:${parentParam ?? ''}` : taskParam}
      projectId={projectId}
      item={item}
      parentParam={parentParam}
      onClose={onClose}
      onOpen={onOpen}
    />
  )
}

interface Draft {
  title: string
  ownerId: string
  startDate: string
  endDate: string
  plan: string
  etc: string
  progress: number
  status: WbsStatus
  comment: string
  parentId: string
}

const toNum = (s: string): number => (s.trim() === '' ? NaN : Number(s))

function TaskForm({
  projectId,
  item,
  parentParam,
  onClose,
  onOpen,
}: {
  projectId: string
  item: WbsItem | null
  parentParam: string | null
  onClose: () => void
  onOpen: (id: string) => void
}) {
  const { data, derived, actions, today } = useApp()
  const { toast } = useToast()
  const { idx, metrics, numbers } = derived
  const isNew = item === null
  const isParent = !!item && idx.childrenOf.has(item.id)
  const itemMetrics = item ? metrics.get(item.id) : undefined

  /** 新規作成時に選べる親: 既にフェーズである行、または実績のない最上位行 */
  const parentOptions = useMemo(() => {
    const withEntries = new Set(data.timeEntries.map((e) => e.wbsId))
    return (idx.topOf.get(projectId) ?? []).filter((t) => idx.childrenOf.has(t.id) || !withEntries.has(t.id))
  }, [idx, projectId, data.timeEntries])

  const initial = useMemo<Draft>(() => {
    if (item) {
      return {
        title: item.title,
        ownerId: item.ownerId ?? '',
        startDate: item.startDate,
        endDate: item.endDate,
        plan: String(item.planHours),
        etc: String(item.etcHours),
        progress: item.progress,
        status: item.status,
        comment: item.comment ?? '',
        parentId: item.parentId ?? '',
      }
    }
    const fallbackParent = parentParam ?? parentOptions.filter((p) => idx.childrenOf.has(p.id)).at(-1)?.id ?? ''
    const start = today
    const end = addDays(today, 4)
    return {
      title: '',
      ownerId: data.currentUserId,
      startDate: toISO(start),
      endDate: toISO(end),
      plan: '8',
      etc: '8',
      progress: 0,
      status: 'Not started',
      comment: '',
      parentId: fallbackParent,
    }
    // 初期値はマウント時（key 変更時）のみ決める
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [draft, setDraft] = useState<Draft>(initial)
  /** 保存済みの内容（変更有無の判定基準）。保存すると draft に更新される */
  const [baseline, setBaseline] = useState<Draft>(initial)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setSavedAt(null)
    setDraft((d) => ({ ...d, [k]: v }))
  }

  const onProgress = (v: number) => {
    const p = clamp(Math.round(v) || 0, 0, 100)
    setSavedAt(null)
    setDraft((d) => {
      if (p >= 100) return { ...d, progress: p, status: 'Done', etc: '0' }
      if (d.status === 'Done') return { ...d, progress: p, status: 'In progress' }
      if (d.status === 'Not started' && p > 0) return { ...d, progress: p, status: 'In progress' }
      return { ...d, progress: p }
    })
  }

  const onStatus = (s: WbsStatus) => {
    setSavedAt(null)
    setDraft((d) => (s === 'Done' ? { ...d, status: s, progress: 100, etc: '0' } : { ...d, status: s }))
  }

  // ---- 検証 ----
  const plan = toNum(draft.plan)
  const etc = toNum(draft.etc)
  const errors: string[] = []
  if (!draft.title.trim()) errors.push('タスク名を入力してください')
  if (!isParent) {
    if (!Number.isFinite(plan) || plan < 0) errors.push('PLAN は 0 以上の数値で入力してください')
    if (!Number.isFinite(etc) || etc < 0) errors.push('ETC は 0 以上の数値で入力してください')
    if (!draft.startDate || !draft.endDate) errors.push('開始日・終了日を入力してください')
    else if (draft.endDate < draft.startDate) errors.push('終了日は開始日以降にしてください')
  }

  // ---- ライブ計算（保存前でも EAC / 差異が見える） ----
  const act = itemMetrics && !isParent ? itemMetrics.act : 0
  const live = leafMetrics(Number.isFinite(plan) ? plan : 0, act, Number.isFinite(etc) ? etc : 0)
  const before = item && !isParent ? leafMetrics(item.planHours, act, item.etcHours) : null

  const dirty = useMemo(() => {
    if (isNew) return true
    return (
      draft.title !== baseline.title ||
      draft.ownerId !== baseline.ownerId ||
      draft.startDate !== baseline.startDate ||
      draft.endDate !== baseline.endDate ||
      toNum(draft.plan) !== toNum(baseline.plan) ||
      toNum(draft.etc) !== toNum(baseline.etc) ||
      draft.progress !== baseline.progress ||
      draft.status !== baseline.status ||
      draft.comment !== baseline.comment
    )
  }, [draft, baseline, isNew])

  const entries = useMemo(
    () =>
      item && !isParent
        ? data.timeEntries.filter((e) => e.wbsId === item.id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        : [],
    [data.timeEntries, item, isParent],
  )

  const save = () => {
    if (errors.length > 0) return
    if (isNew) {
      const parentId = draft.parentId || null
      const id = actions.addWbs({
        projectId,
        parentId,
        title: draft.title.trim(),
        ownerId: draft.ownerId || null,
        startDate: draft.startDate,
        endDate: draft.endDate,
        planHours: plan,
        etcHours: etc,
        progress: draft.progress,
        status: draft.status,
        comment: draft.comment.trim() || undefined,
      })
      toast(
        <>
          <strong>{draft.title.trim()}</strong> を追加しました（PLAN {fmtNum(plan)}h / EAC {fmtNum(live.eac)}h）
        </>,
      )
      onOpen(id)
      return
    }
    if (!item) return
    if (isParent) {
      actions.updateWbs(item.id, { title: draft.title.trim(), comment: draft.comment.trim() || undefined })
      toast(<>フェーズ <strong>{draft.title.trim()}</strong> を保存しました</>)
    } else {
      actions.updateWbs(item.id, {
        title: draft.title.trim(),
        ownerId: draft.ownerId || null,
        startDate: draft.startDate,
        endDate: draft.endDate,
        planHours: plan,
        etcHours: etc,
        progress: draft.progress,
        status: draft.status,
        comment: draft.comment.trim() || undefined,
      })
      toast(
        <>
          <strong>{draft.title.trim()}</strong> を保存しました：EAC {fmtNum(live.eac)}h / 差異 {fmtSignedH(live.variance)}
        </>,
      )
    }
    setSavedAt(Date.now())
    setBaseline(draft)
  }

  const doDelete = () => {
    if (!item) return
    actions.deleteWbs(item.id)
    toast(<>「{item.title}」を削除しました</>, 'info')
    setConfirmDelete(false)
    onClose()
  }

  const childCount = item ? descendantsOf(idx, item.id).length : 0
  const eyebrow = isNew ? '新しいタスク' : `${derived.summaryById.get(projectId)?.shortName ?? ''}  ·  WBS ${numbers.get(item!.id) ?? ''}`
  const owner = derived.userById.get(draft.ownerId)

  const showM = isParent && itemMetrics ? itemMetrics : null
  const shown = showM
    ? { plan: showM.plan, act: showM.act, etc: showM.etc, eac: showM.eac, variance: showM.variance, burn: showM.burn }
    : live
  const progressShown = showM ? showM.progress : draft.progress

  return (
    <>
      <Drawer
        title={isNew ? 'タスクを追加' : item!.title}
        eyebrow={eyebrow}
        onClose={onClose}
        ariaLabel="タスク詳細"
        footer={
          <>
            {!isNew && (
              <button type="button" className="btn btn--quiet btn--icon" onClick={() => setConfirmDelete(true)} title="このタスクを削除">
                <Trash2 size={16} />
                削除
              </button>
            )}
            <span className="drawer__spacer" />
            {savedAt && !dirty && <span className="saved-note">保存しました</span>}
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              {isNew ? 'キャンセル' : '閉じる'}
            </button>
            <button type="button" className="btn btn--primary" onClick={save} disabled={errors.length > 0 || !dirty}>
              {isNew ? '追加' : '保存'}
            </button>
          </>
        }
      >
        {/* 工数サマリー */}
        <section className="metrics" aria-label="工数サマリー">
          <div className="metrics__grid">
            <Metric label="PLAN" value={`${fmtNum(shown.plan)}h`} prev={before && before.plan !== shown.plan ? `${fmtNum(before.plan)}h` : undefined} hint="計画工数" />
            <Metric label="ACT" value={`${fmtNum(shown.act)}h`} hint="実績（My Work入力の合計）" />
            <Metric label="ETC" value={`${fmtNum(shown.etc)}h`} prev={before && before.etc !== shown.etc ? `${fmtNum(before.etc)}h` : undefined} hint="残工数" />
            <Metric label="EAC" value={`${fmtNum(shown.eac)}h`} prev={before && before.eac !== shown.eac ? `${fmtNum(before.eac)}h` : undefined} strong hint="ACT + ETC" />
            <Metric
              label="差異"
              value={fmtSignedH(shown.variance)}
              prev={before && before.variance !== shown.variance ? fmtSignedH(before.variance) : undefined}
              tone={shown.variance > 0 ? 'over' : shown.variance < 0 ? 'under' : undefined}
              hint="EAC − PLAN"
            />
          </div>
          <div className="metrics__bars">
            <div>
              <div className="metrics__barlabel">
                <span>工数消化 (ACT / PLAN)</span>
                <b>{fmtPct(shown.burn)}</b>
              </div>
              <ProgressBar value={(shown.burn ?? 0) * 100} tone={(shown.burn ?? 0) > 1 ? 'watch' : 'accent'} />
            </div>
            <div>
              <div className="metrics__barlabel">
                <span>進捗</span>
                <b>{Math.round(progressShown)}%</b>
              </div>
              <ProgressBar value={progressShown} tone="good" />
            </div>
          </div>
          {isParent && <p className="hint">フェーズの PLAN / ACT / ETC / EAC / 進捗は、配下タスクから自動集計されます。</p>}
        </section>

        {/* フォーム */}
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <Field label="タスク名">
            <input className="input" value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="例: ヒアリング" autoFocus={isNew} />
          </Field>

          {isNew && (
            <Field label="親フェーズ">
              <select className="input" value={draft.parentId} onChange={(e) => set('parentId', e.target.value)}>
                <option value="">（なし：最上位のタスクとして追加）</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {numbers.get(p.id)} {p.title}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {!isParent && (
            <>
              <Field label="担当者">
                <div className="owner-select">
                  <Avatar user={owner} size="sm" />
                  <select className="input" value={draft.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
                    <option value="">未設定</option>
                    {data.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>

              <div className="form__row">
                <Field label="開始日">
                  <input type="date" className="input" value={draft.startDate} onChange={(e) => set('startDate', e.target.value)} />
                </Field>
                <Field label="終了日">
                  <input type="date" className="input" value={draft.endDate} onChange={(e) => set('endDate', e.target.value)} />
                </Field>
              </div>

              <div className="form__row">
                <Field label="PLAN（計画工数 h）">
                  <input type="number" min={0} step={0.5} inputMode="decimal" className="input input--num" value={draft.plan} onChange={(e) => set('plan', e.target.value)} />
                </Field>
                <Field label="ETC（残工数 h）" help="あと何時間必要かを直接入力します（進捗率から自動算出しません）">
                  <input type="number" min={0} step={0.5} inputMode="decimal" className="input input--num" value={draft.etc} onChange={(e) => set('etc', e.target.value)} />
                </Field>
              </div>

              <Field label={`進捗  ${draft.progress}%`}>
                <div className="slider">
                  <input type="range" min={0} max={100} step={5} value={draft.progress} onChange={(e) => onProgress(Number(e.target.value))} aria-label="進捗" />
                  <input type="number" min={0} max={100} className="input input--num slider__num" value={draft.progress} onChange={(e) => onProgress(Number(e.target.value))} aria-label="進捗(数値)" />
                </div>
              </Field>

              <Field label="状態" help="完了 / 進捗100% にすると ETC は 0h になります">
                <div className="seg" role="radiogroup" aria-label="状態">
                  {WBS_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={draft.status === s}
                      className={cx('seg__btn', draft.status === s && 'is-on', `seg__btn--${s === 'Blocked' ? 'blocked' : 'plain'}`)}
                      onClick={() => onStatus(s)}
                    >
                      {WBS_STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          <Field label="コメント">
            <textarea className="input input--area" rows={3} value={draft.comment} onChange={(e) => set('comment', e.target.value)} placeholder="背景・懸念・メモなど" />
          </Field>

          {errors.length > 0 && (
            <ul className="form__errors" role="alert">
              {errors.map((er) => (
                <li key={er}>{er}</li>
              ))}
            </ul>
          )}
        </form>

        {/* 実績の履歴 */}
        {!isNew && !isParent && (
          <section className="history">
            <h3 className="section-title">
              実績工数の履歴 <span>ACT = 合計 {fmtNum(act)}h（{entries.length}件）</span>
            </h3>
            {entries.length === 0 ? (
              <p className="hint">まだ実績の入力がありません。担当者が My Work から入力すると ACT に加算されます。</p>
            ) : (
              <ul className="history__list">
                {entries.slice(0, 8).map((e) => (
                  <li key={e.id}>
                    <span className="history__date">{fmtMD(e.date)}</span>
                    <Avatar user={derived.userById.get(e.userId)} size="sm" />
                    <span className="history__hours">{fmtNum(e.hours)}h</span>
                    <span className="history__comment">{e.comment || '—'}</span>
                  </li>
                ))}
                {entries.length > 8 && <li className="history__more">ほか {entries.length - 8} 件</li>}
              </ul>
            )}
          </section>
        )}

      </Drawer>

      {confirmDelete && item && (
        <ConfirmDialog title="タスクを削除しますか？" confirmLabel="削除する" onCancel={() => setConfirmDelete(false)} onConfirm={doDelete}>
          「{item.title}」{childCount > 0 ? `と配下の ${childCount} 件のタスク` : ''}、およびこれらの実績工数（TimeEntry）が削除されます。
        </ConfirmDialog>
      )}
    </>
  )
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {help && <span className="field__help">{help}</span>}
    </label>
  )
}

function Metric({
  label,
  value,
  prev,
  strong,
  tone,
  hint,
}: {
  label: string
  value: string
  prev?: string
  strong?: boolean
  tone?: 'over' | 'under'
  hint?: string
}) {
  return (
    <div className={cx('metric', strong && 'metric--strong', tone && `metric--${tone}`)} title={hint}>
      <span className="metric__label">{label}</span>
      <span className="metric__value">{value}</span>
      {prev && <span className="metric__prev">{prev} →</span>}
    </div>
  )
}
