import { ExternalLink, Flag, History, MessageSquare, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { descendantsOf, leafMetrics } from '../domain/calculations'
import { addDays, daysBetween, fmtDateTime, fmtMD, toISO } from '../domain/dates'
import { clamp, fmtNum, fmtPct, fmtSignedH, fmtSignedYenShort, fmtYen, fmtYenShort } from '../domain/format'
import {
  PRIORITY_LABEL,
  RISK_STATUS_LABEL,
  SEVERITY_LABEL,
  WBS_STATUSES,
  WBS_STATUS_LABEL,
  WBS_TYPE_LABEL,
  type Priority,
  type RiskSeverity,
  type WbsItem,
  type WbsStatus,
  type WbsType,
} from '../domain/types'
import { defaultOrderId, selectableOrders } from '../domain/orders'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { ConfirmDialog } from './ConfirmDialog'
import { Drawer } from './Drawer'
import { ProgressBar } from './ProgressBar'
import { useToast } from './Toast'
import { WbsStatusBadge } from './StatusBadge'
import { WbsTypeIcon } from './WbsTypeIcon'
import { cx } from './cx'

interface Props {
  projectId: string
  /** wbsId または 'new' */
  taskParam: string
  parentParam: string | null
  newType: 'task' | 'milestone'
  onClose: () => void
  onOpen: (id: string) => void
}

/** 右側ドロワー: 作業項目の編集 / 新規作成（基本・日程・工数・進捗・成果物・リスク・更新履歴） */
export function TaskDrawer({ projectId, taskParam, parentParam, newType, onClose, onOpen }: Props) {
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
      key={isNew ? `new:${parentParam ?? ''}:${newType}` : taskParam}
      projectId={projectId}
      item={item}
      parentParam={parentParam}
      newType={newType}
      onClose={onClose}
      onOpen={onOpen}
    />
  )
}

interface Draft {
  title: string
  description: string
  type: WbsType
  ownerId: string
  priority: Priority
  status: WbsStatus
  startDate: string
  endDate: string
  plan: string
  etc: string
  progress: number
  predecessorId: string
  deliverableUrl: string
  /** 社内オーダー（作業時間を計上する先）。空なら未設定 */
  orderId: string
  comment: string
  parentId: string
}

const toNum = (s: string): number => (s.trim() === '' ? NaN : Number(s))
const isUrl = (s: string): boolean => /^https?:\/\/\S+$/i.test(s.trim())

function TaskForm({
  projectId,
  item,
  parentParam,
  newType,
  onClose,
  onOpen,
}: {
  projectId: string
  item: WbsItem | null
  parentParam: string | null
  newType: 'task' | 'milestone'
  onClose: () => void
  onOpen: (id: string) => void
}) {
  const { data, derived, actions, today, can, me } = useApp()
  const { toast } = useToast()
  const { idx, metrics, numbers } = derived
  const project = derived.projectById.get(projectId)
  const isNew = item === null
  const isParent = !!item && idx.childrenOf.has(item.id)
  const itemMetrics = item ? metrics.get(item.id) : undefined

  const canStructure = can('wbs.structure', { project })
  const canProgress = isNew ? canStructure : can('wbs.progress', { project, wbs: item ?? undefined })
  const readOnly = !canStructure && !canProgress

  /** 新規作成時に選べる親: 既にフェーズ/パッケージ/親タスクである行、または実績のない行 */
  const withEntries = useMemo(() => new Set(data.timeEntries.map((e) => e.wbsId)), [data.timeEntries])
  const parentOptions = useMemo(
    () =>
      data.wbs
        .filter((w) => w.projectId === projectId && w.type !== 'milestone' && (idx.childrenOf.has(w.id) || !withEntries.has(w.id)))
        .map((w) => ({ w, depth: depthOf(idx.byId, w) })),
    [data.wbs, projectId, idx, withEntries],
  )

  const initial = useMemo<Draft>(() => {
    if (item) {
      return {
        title: item.title,
        description: item.description ?? '',
        type: item.type,
        ownerId: item.ownerId ?? '',
        priority: item.priority,
        status: item.status,
        startDate: item.startDate,
        endDate: item.endDate,
        plan: String(item.planHours),
        etc: String(item.etcHours),
        progress: item.progress,
        predecessorId: item.predecessorId ?? '',
        deliverableUrl: item.deliverableUrl ?? '',
        orderId: item.orderId ?? '',
        comment: item.comment ?? '',
        parentId: item.parentId ?? '',
      }
    }
    const parent = parentParam ? idx.byId.get(parentParam) : undefined
    const start = parent && !idx.childrenOf.has(parent.id) ? parent.startDate : toISO(today)
    const end = newType === 'milestone' ? toISO(addDays(today, 7)) : toISO(addDays(today, 4))
    const isMs = newType === 'milestone'
    return {
      title: '',
      description: '',
      type: newType,
      ownerId: isMs ? '' : data.currentUserId,
      priority: 'medium',
      status: 'not_started',
      startDate: isMs ? end : start,
      endDate: end,
      plan: isMs ? '0' : '8',
      etc: isMs ? '0' : '8',
      progress: 0,
      predecessorId: '',
      deliverableUrl: '',
      orderId: isMs ? '' : (defaultOrderId(data.internalOrders, projectId) ?? ''),
      comment: '',
      parentId: parentParam ?? '',
    }
    // 初期値はマウント時（key 変更時）のみ決める
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [draft, setDraft] = useState<Draft>(initial)
  /** 保存済みの内容（変更有無の判定基準）。保存すると draft に更新される */
  const [baseline, setBaseline] = useState<Draft>(initial)
  const [note, setNote] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [newRisk, setNewRisk] = useState({ title: '', severity: 'medium' as RiskSeverity })

  const isMilestone = draft.type === 'milestone'

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setSavedAt(null)
    setDraft((d) => ({ ...d, [k]: v }))
  }

  const onProgress = (v: number) => {
    const p = clamp(Math.round(v) || 0, 0, 100)
    setSavedAt(null)
    setDraft((d) => {
      if (p >= 100) return { ...d, progress: p, status: 'done', etc: '0' }
      if (d.status === 'done') return { ...d, progress: p, status: 'in_progress' }
      if (d.status === 'not_started' && p > 0) return { ...d, progress: p, status: 'in_progress' }
      return { ...d, progress: p }
    })
  }

  const onStatus = (s: WbsStatus) => {
    setSavedAt(null)
    setDraft((d) => (s === 'done' ? { ...d, status: s, progress: 100, etc: '0' } : { ...d, status: s }))
  }

  const onDate = (k: 'startDate' | 'endDate', v: string) => {
    setSavedAt(null)
    setDraft((d) => {
      const n = { ...d, [k]: v }
      // マイルストーンは1日だけ
      if (d.type === 'milestone') return { ...n, startDate: v, endDate: v }
      return n
    })
  }

  // ---- 検証 ----
  const plan = isMilestone ? 0 : toNum(draft.plan)
  const etc = isMilestone ? 0 : toNum(draft.etc)
  const errors: string[] = []
  if (!draft.title.trim()) errors.push('名称を入力してください')
  if (!isParent) {
    if (!isMilestone) {
      if (!Number.isFinite(plan) || plan < 0) errors.push('計画は 0 以上の数値で入力してください')
      if (!Number.isFinite(etc) || etc < 0) errors.push('残りは 0 以上の数値で入力してください')
    }
    if (!draft.startDate || !draft.endDate) errors.push('日付を入力してください')
    else if (draft.endDate < draft.startDate) errors.push('終了日は開始日以降にしてください')
  }
  if (draft.deliverableUrl.trim() && !isUrl(draft.deliverableUrl)) errors.push('成果物のURLは http:// または https:// で始めてください')

  // ---- 先行タスク ----
  const predecessorOptions = useMemo(() => {
    const cyc = (candidateId: string): boolean => {
      // candidate から先行をたどって自分に戻ってくるなら循環
      let cur: WbsItem | undefined = idx.byId.get(candidateId)
      const seen = new Set<string>()
      while (cur && !seen.has(cur.id)) {
        if (item && cur.id === item.id) return true
        seen.add(cur.id)
        cur = cur.predecessorId ? idx.byId.get(cur.predecessorId) : undefined
      }
      return false
    }
    return derived.leaves.filter((l) => l.projectId === projectId && l.id !== item?.id && !cyc(l.id))
  }, [derived.leaves, projectId, item, idx])
  const pred = draft.predecessorId ? idx.byId.get(draft.predecessorId) : undefined
  const depConflict = !!pred && pred.status !== 'done' && !!draft.startDate && draft.startDate < pred.endDate

  // ---- ライブ計算（保存前でも EAC / 差異が見える） ----
  const act = itemMetrics && !isParent ? itemMetrics.act : 0
  const live = leafMetrics(Number.isFinite(plan) ? plan : 0, act, Number.isFinite(etc) ? etc : 0)
  const before = item && !isParent ? leafMetrics(item.planHours, act, item.etcHours) : null

  const dirty = useMemo(() => {
    if (isNew) return true
    return (
      note.trim() !== '' ||
      (Object.keys(draft) as (keyof Draft)[]).some((k) => {
        if (k === 'plan' || k === 'etc') return toNum(draft[k]) !== toNum(baseline[k])
        return draft[k] !== baseline[k]
      })
    )
  }, [draft, baseline, isNew, note])

  const entries = useMemo(
    () =>
      item && !isParent
        ? data.timeEntries.filter((e) => e.wbsId === item.id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        : [],
    [data.timeEntries, item, isParent],
  )
  const itemRisks = useMemo(() => (item ? data.risks.filter((r) => r.wbsId === item.id) : []), [data.risks, item])
  const logs = useMemo(
    () =>
      item
        ? data.activity
            .filter((l) => l.entityId === item.id && (l.entityType === 'wbs' || l.entityType === 'time_entry'))
            .slice()
            .reverse()
        : [],
    [data.activity, item],
  )

  const save = () => {
    if (errors.length > 0 || readOnly) return
    const common = {
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      comment: draft.comment.trim() || undefined,
    }
    if (isNew) {
      const id = actions.addWbs({
        projectId,
        parentId: draft.parentId || null,
        type: draft.type,
        priority: draft.priority,
        ownerId: draft.ownerId || null,
        startDate: draft.startDate,
        endDate: draft.endDate,
        planHours: plan,
        etcHours: etc,
        progress: draft.progress,
        status: draft.status,
        predecessorId: draft.predecessorId || undefined,
        deliverableUrl: draft.deliverableUrl.trim() || undefined,
        orderId: isMilestone ? undefined : draft.orderId || undefined,
        ...common,
      })
      toast(
        isMilestone ? (
          <>
            マイルストーン <strong>{common.title}</strong> を追加しました（{fmtMD(draft.endDate)}）
          </>
        ) : (
          <>
            <strong>{common.title}</strong> を追加しました（計画 {fmtNum(plan)}h / 見込み {fmtNum(live.eac)}h）
          </>
        ),
      )
      onOpen(id)
      return
    }
    if (!item) return
    if (isParent) {
      if (!canStructure) return
      actions.updateWbs(item.id, { ...common, priority: draft.priority })
      toast(
        <>
          <strong>{common.title}</strong> を保存しました
        </>,
      )
    } else if (canStructure) {
      actions.updateWbs(item.id, {
        ...common,
        type: draft.type,
        priority: draft.priority,
        ownerId: draft.ownerId || null,
        startDate: draft.startDate,
        endDate: draft.endDate,
        planHours: plan,
        etcHours: etc,
        progress: draft.progress,
        status: draft.status,
        predecessorId: draft.predecessorId || undefined,
        deliverableUrl: draft.deliverableUrl.trim() || undefined,
        orderId: draft.type === 'milestone' ? undefined : draft.orderId || undefined,
      })
      toast(
        isMilestone ? (
          <>
            <strong>{common.title}</strong> を保存しました
          </>
        ) : (
          <>
            <strong>{common.title}</strong> を保存しました：見込み {fmtNum(live.eac)}h / 差異 {fmtSignedH(live.variance)}
          </>
        ),
      )
    } else {
      // 担当者本人: 残り・進捗・状態・コメントだけ
      actions.updateWbs(item.id, {
        etcHours: etc,
        progress: draft.progress,
        status: draft.status,
        comment: common.comment,
      })
      toast(
        <>
          <strong>{item.title}</strong> を保存しました：見込み {fmtNum(live.eac)}h / 差異 {fmtSignedH(live.variance)}
        </>,
      )
    }
    if (note.trim()) {
      actions.addComment('wbs', item.id, projectId, `進捗${draft.progress}%：${note.trim()}`)
      setNote('')
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
  const eyebrow = isNew
    ? isMilestone
      ? '新しいマイルストーン'
      : '新しい作業'
    : `${derived.summaryById.get(projectId)?.shortName ?? ''}  ·  ${WBS_TYPE_LABEL[item!.type]} ${numbers.get(item!.id) ?? ''}`
  const owner = derived.userById.get(draft.ownerId)

  const showM = isParent && itemMetrics ? itemMetrics : null
  const shown = showM
    ? { plan: showM.plan, act: showM.act, etc: showM.etc, eac: showM.eac, variance: showM.variance, burn: showM.burn }
    : live
  const progressShown = showM ? showM.progress : draft.progress

  // 人件費（原価）
  const rate = derived.rateOf(draft.ownerId || null)
  const planN = Number.isFinite(plan) ? plan : 0
  const etcN = Number.isFinite(etc) ? etc : 0
  const actCostNow = itemMetrics && !isParent ? itemMetrics.actCost : 0
  const costView = showM
    ? { plan: showM.planCost, act: showM.actCost, etc: showM.etcCost, eac: showM.eacCost, variance: showM.varianceCost }
    : {
        plan: planN * rate,
        act: actCostNow,
        etc: etcN * rate,
        eac: actCostNow + etcN * rate,
        variance: actCostNow + etcN * rate - planN * rate,
      }

  const structOff = !canStructure
  const progOff = !canProgress
  const canHaveChildren = !!item && item.type !== 'milestone' && (isParent || !withEntries.has(item.id))

  return (
    <>
      <Drawer
        title={isNew ? (isMilestone ? 'マイルストーンを追加' : '作業を追加') : item!.title}
        eyebrow={eyebrow}
        onClose={onClose}
        ariaLabel="作業の詳細"
        footer={
          <>
            {!isNew && canStructure && (
              <button type="button" className="btn btn--quiet btn--icon" onClick={() => setConfirmDelete(true)} title="この作業を削除">
                <Trash2 size={16} />
                削除
              </button>
            )}
            <span className="drawer__spacer" />
            {savedAt && !dirty && <span className="saved-note">保存しました</span>}
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              {isNew ? 'キャンセル' : '閉じる'}
            </button>
            <button type="button" className="btn btn--primary" onClick={save} disabled={errors.length > 0 || !dirty || readOnly}>
              {isNew ? '追加' : '保存'}
            </button>
          </>
        }
      >
        {readOnly && (
          <p className="notice-inline" role="note">
            この作業は参照のみです。変更できるのは、担当者本人・プロジェクトのリーダー・課長以上です。
          </p>
        )}

        {/* 工数 */}
        {!isMilestone && (
          <section className="metrics" aria-label="工数サマリー">
            <div className="metrics__grid">
              <Metric label="計画" value={`${fmtNum(shown.plan)}h`} prev={before && before.plan !== shown.plan ? `${fmtNum(before.plan)}h` : undefined} hint="最初に見積もった作業時間" />
              <Metric label="実績" value={`${fmtNum(shown.act)}h`} hint="これまでに記録された作業時間の合計" />
              <Metric label="残り" value={`${fmtNum(shown.etc)}h`} prev={before && before.etc !== shown.etc ? `${fmtNum(before.etc)}h` : undefined} hint="完了まで、あと何時間かかるか" />
              <Metric label="見込み" value={`${fmtNum(shown.eac)}h`} prev={before && before.eac !== shown.eac ? `${fmtNum(before.eac)}h` : undefined} strong hint="実績 + 残り（完了までの合計時間）" />
              <Metric
                label="差異"
                value={fmtSignedH(shown.variance)}
                prev={before && before.variance !== shown.variance ? fmtSignedH(before.variance) : undefined}
                tone={shown.variance > 0 ? 'over' : shown.variance < 0 ? 'under' : undefined}
                hint="見込み − 計画（＋は計画より時間がかかる）"
              />
            </div>
            <div className="metrics__bars">
              <div>
                <div className="metrics__barlabel">
                  <span>工数消化率</span>
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
            <div className="costline" aria-label="人件費（原価）">
              <div className="costline__head">
                <span>人件費（原価・万円）</span>
                <em>{isParent ? '配下の合計' : `${owner?.name ?? '担当未設定（平均単価）'}  ${fmtYen(rate)}/h`}</em>
              </div>
              <div className="costline__grid">
                <span title={fmtYen(costView.plan)}>
                  計画 <b>{fmtYenShort(costView.plan)}</b>
                </span>
                <span title={fmtYen(costView.act)}>
                  実績 <b>{fmtYenShort(costView.act)}</b>
                </span>
                <span title={fmtYen(costView.etc)}>
                  残り <b>{fmtYenShort(costView.etc)}</b>
                </span>
                <span title={fmtYen(costView.eac)}>
                  見込み <b>{fmtYenShort(costView.eac)}</b>
                </span>
                <span className={costView.variance > 0 ? 'is-over' : undefined} title={fmtYen(costView.variance)}>
                  差異 <b>{fmtSignedYenShort(costView.variance)}</b>
                </span>
              </div>
            </div>
            {isParent && <p className="hint">計画・実績・残り・見込み・進捗は、配下の作業から自動で集計されます。</p>}
          </section>
        )}

        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          {/* 基本 */}
          <Section title="基本">
            <Field label="名称">
              <input
                className="input"
                value={draft.title}
                disabled={structOff}
                onChange={(e) => set('title', e.target.value)}
                placeholder={isMilestone ? '例: 構想レビュー完了' : '例: ヒアリング'}
                autoFocus={isNew}
              />
            </Field>

            {isNew && (
              <div className="form__row">
                <Field label="種別">
                  <select
                    className="input"
                    value={draft.type}
                    onChange={(e) => {
                      const t = e.target.value as WbsType
                      setSavedAt(null)
                      setDraft((d) =>
                        t === 'milestone'
                          ? { ...d, type: t, ownerId: '', plan: '0', etc: '0', startDate: d.endDate }
                          : { ...d, type: t, ownerId: d.ownerId || data.currentUserId, plan: d.plan === '0' ? '8' : d.plan, etc: d.etc === '0' ? '8' : d.etc },
                      )
                    }}
                  >
                    <option value="task">タスク</option>
                    <option value="milestone">マイルストーン</option>
                    <option value="work_package">作業パッケージ（子を持つ）</option>
                    <option value="phase">フェーズ（子を持つ）</option>
                  </select>
                </Field>
                <Field label="親">
                  <select className="input" value={draft.parentId} onChange={(e) => set('parentId', e.target.value)}>
                    <option value="">（なし：最上位）</option>
                    {parentOptions.map(({ w, depth }) => (
                      <option key={w.id} value={w.id}>
                        {'　'.repeat(depth)}
                        {numbers.get(w.id)} {w.title}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            {!isNew && !isParent && item && (item.type === 'task' || item.type === 'milestone') && (
              <Field label="種別">
                <div className="seg seg--2" role="radiogroup" aria-label="種別">
                  {(['task', 'milestone'] as WbsType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={draft.type === t}
                      disabled={structOff}
                      className={cx('seg__btn', draft.type === t && 'is-on')}
                      onClick={() =>
                        setDraft((d) =>
                          t === 'milestone'
                            ? { ...d, type: t, ownerId: '', plan: '0', etc: '0', startDate: d.endDate }
                            : { ...d, type: t, plan: d.plan === '0' ? '8' : d.plan, etc: d.etc === '0' ? '8' : d.etc },
                        )
                      }
                    >
                      {WBS_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            <Field label="説明">
              <textarea
                className="input input--area"
                rows={2}
                value={draft.description}
                disabled={structOff}
                onChange={(e) => set('description', e.target.value)}
                placeholder="目的・完了の条件など"
              />
            </Field>

            {!isParent && !isMilestone && (
              <Field label="社内オーダー" help="作業時間・人件費を計上するオーダー。レポート（締めのCSV）の集計に使います">
                <select
                  className="input"
                  value={draft.orderId}
                  disabled={structOff}
                  onChange={(e) => set('orderId', e.target.value)}
                  aria-label="社内オーダー"
                >
                  <option value="">未設定</option>
                  {selectableOrders(data.internalOrders, projectId, draft.orderId).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} {o.name}
                      {o.status === 'closed' ? '（終了）' : ''}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {!isParent && !isMilestone && (
              <div className="form__row">
                <Field label="担当者">
                  <div className="owner-select">
                    <Avatar user={owner} size="sm" />
                    <select className="input" value={draft.ownerId} disabled={structOff} onChange={(e) => set('ownerId', e.target.value)}>
                      <option value="">未設定</option>
                      {derived.activeUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </Field>
                <Field label="優先度">
                  <select className="input" value={draft.priority} disabled={structOff} onChange={(e) => set('priority', e.target.value as Priority)}>
                    {(['high', 'medium', 'low'] as Priority[]).map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            {!isParent && (
              <Field label="状態" help={isMilestone ? undefined : '完了 / 進捗100% にすると、残りは 0h になります'}>
                <div className={cx('seg', isMilestone && 'seg--2')} role="radiogroup" aria-label="状態">
                  {(isMilestone ? (['not_started', 'done'] as WbsStatus[]) : WBS_STATUSES).map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={draft.status === s}
                      disabled={progOff}
                      className={cx('seg__btn', draft.status === s && 'is-on', `seg__btn--${s === 'blocked' ? 'blocked' : 'plain'}`)}
                      onClick={() => onStatus(s)}
                    >
                      {isMilestone ? (s === 'done' ? '達成' : '未達成') : WBS_STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </Section>

          {/* 日程 */}
          {!isParent && (
            <Section title="日程">
              {isMilestone ? (
                <Field label="日付">
                  <input type="date" className="input" value={draft.endDate} disabled={structOff} onChange={(e) => onDate('endDate', e.target.value)} />
                </Field>
              ) : (
                <div className="form__row">
                  <Field label="開始日">
                    <input type="date" className="input" value={draft.startDate} disabled={structOff} onChange={(e) => onDate('startDate', e.target.value)} />
                  </Field>
                  <Field label="終了日">
                    <input type="date" className="input" value={draft.endDate} disabled={structOff} onChange={(e) => onDate('endDate', e.target.value)} />
                  </Field>
                </div>
              )}
              <Field label="先行タスク（これが終わってから始める）">
                <select className="input" value={draft.predecessorId} disabled={structOff} onChange={(e) => set('predecessorId', e.target.value)}>
                  <option value="">なし</option>
                  {predecessorOptions.map((l) => (
                    <option key={l.id} value={l.id}>
                      {numbers.get(l.id)} {l.title}（{fmtMD(l.endDate)}まで）
                    </option>
                  ))}
                </select>
              </Field>
              {depConflict && pred && (
                <p className="form__warn">先行タスク「{pred.title}」は {fmtMD(pred.endDate)} まで続きます。開始日がそれより前になっています。</p>
              )}
            </Section>
          )}

          {/* 工数 */}
          {!isParent && !isMilestone && (
            <Section title="工数">
              <div className="form__row">
                <Field label="計画（見積もった時間 h）">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    inputMode="decimal"
                    className="input input--num"
                    value={draft.plan}
                    disabled={structOff}
                    onChange={(e) => set('plan', e.target.value)}
                  />
                </Field>
                <Field label="残り（あと何時間かかるか h）" help="進捗の％からは自動計算しません">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    inputMode="decimal"
                    className="input input--num"
                    value={draft.etc}
                    disabled={progOff}
                    onChange={(e) => set('etc', e.target.value)}
                  />
                </Field>
              </div>
              {item && (
                <p className="baseline" title="再計画しても当初の計画は残ります">
                  <b>当初の計画</b>
                  <span>
                    {fmtNum(item.baselinePlanHours)}h ・ {fmtMD(item.baselineStart)}–{fmtMD(item.baselineEnd)}
                  </span>
                  {item.planHours !== item.baselinePlanHours && <em>計画 {fmtSignedH(item.planHours - item.baselinePlanHours)}</em>}
                  {item.endDate !== item.baselineEnd && (
                    <em>終了日 {daysBetween(item.baselineEnd, item.endDate) > 0 ? '+' : ''}{daysBetween(item.baselineEnd, item.endDate)}日</em>
                  )}
                </p>
              )}
            </Section>
          )}

          {/* 進捗 */}
          {!isParent && !isMilestone && (
            <Section title="進捗">
              <Field label={`進捗  ${draft.progress}%`}>
                <div className="slider">
                  <input type="range" min={0} max={100} step={5} value={draft.progress} disabled={progOff} onChange={(e) => onProgress(Number(e.target.value))} aria-label="進捗" />
                  <input type="number" min={0} max={100} className="input input--num slider__num" value={draft.progress} disabled={progOff} onChange={(e) => onProgress(Number(e.target.value))} aria-label="進捗(数値)" />
                </div>
              </Field>
              <Field label="更新コメント" help="保存すると、更新履歴にコメントとして残ります">
                <input className="input" value={note} disabled={progOff} onChange={(e) => (setSavedAt(null), setNote(e.target.value))} placeholder="例: 顧客レビュー待ち。来週頭に再開" />
              </Field>
            </Section>
          )}

          {/* 成果物 */}
          {!isParent && (
            <Section title="成果物">
              <Field label="成果物のURL（Drive など）">
                <div className="url-row">
                  <input className="input" value={draft.deliverableUrl} disabled={structOff} onChange={(e) => set('deliverableUrl', e.target.value)} placeholder="https://drive.google.com/…" />
                  {isUrl(draft.deliverableUrl) && (
                    <a className="btn btn--ghost btn--sm" href={draft.deliverableUrl.trim()} target="_blank" rel="noreferrer noopener">
                      <ExternalLink size={14} />
                      開く
                    </a>
                  )}
                </div>
              </Field>
            </Section>
          )}

          <Section title="メモ">
            <Field label="メモ（背景・懸念など）">
              <textarea className="input input--area" rows={2} value={draft.comment} disabled={progOff} onChange={(e) => set('comment', e.target.value)} placeholder="背景・懸念・メモなど" />
            </Field>
          </Section>

          {errors.length > 0 && (
            <ul className="form__errors" role="alert">
              {errors.map((er) => (
                <li key={er}>{er}</li>
              ))}
            </ul>
          )}
        </form>

        {/* 子の追加（親行） */}
        {item && canStructure && canHaveChildren && (
          <section className="dsec">
            <h3 className="section-title">
              配下の作業 <span>{isParent ? `${idx.childrenOf.get(item.id)?.length ?? 0}件` : 'まだありません'}</span>
            </h3>
            {isParent && (
              <ul className="kids">
                {(idx.childrenOf.get(item.id) ?? []).map((k) => (
                  <li key={k.id}>
                    <button type="button" onClick={() => onOpen(k.id)}>
                      <WbsTypeIcon type={k.type} />
                      <span className="kids__title">
                        {numbers.get(k.id)} {k.title}
                      </span>
                      <WbsStatusBadge status={metrics.get(k.id)?.status ?? k.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="hint">追加は一覧の行にある「＋」から行います（種別を選べます）。</p>
          </section>
        )}

        {/* リスク・課題 */}
        {item && (
          <section className="dsec">
            <h3 className="section-title">
              リスク・課題 <span>{itemRisks.length}件</span>
            </h3>
            {itemRisks.length === 0 && <p className="hint">この作業に紐づくリスク・課題はありません。</p>}
            {itemRisks.length > 0 && (
              <ul className="irisks">
                {itemRisks.map((r) => (
                  <li key={r.id} className={cx(r.status === 'closed' && 'is-closed')}>
                    <Flag size={13} className={`sev-ic sev-ic--${r.severity}`} />
                    <span className="irisks__title">{r.title}</span>
                    <span className="chip">{r.kind === 'risk' ? 'リスク' : '課題'}・{SEVERITY_LABEL[r.severity]}</span>
                    <em>{RISK_STATUS_LABEL[r.status]}</em>
                  </li>
                ))}
              </ul>
            )}
            {can('risk.edit', { project }) && (
              <div className="irisks__add">
                <input
                  className="input input--sm"
                  value={newRisk.title}
                  onChange={(e) => setNewRisk({ ...newRisk, title: e.target.value })}
                  placeholder="リスクを追加（例: 顧客の回答が遅れる）"
                  aria-label="リスクの内容"
                />
                <select className="input input--sm irisks__sev" value={newRisk.severity} onChange={(e) => setNewRisk({ ...newRisk, severity: e.target.value as RiskSeverity })} aria-label="重大度">
                  {(['high', 'medium', 'low'] as RiskSeverity[]).map((s) => (
                    <option key={s} value={s}>
                      {SEVERITY_LABEL[s]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={!newRisk.title.trim()}
                  onClick={() => {
                    actions.addRisk({
                      projectId,
                      wbsId: item.id,
                      kind: 'risk',
                      severity: newRisk.severity,
                      probability: 'medium',
                      title: newRisk.title.trim(),
                      ownerId: item.ownerId ?? undefined,
                      status: 'open',
                    })
                    setNewRisk({ title: '', severity: 'medium' })
                    toast('リスクを追加しました')
                  }}
                >
                  <Plus size={14} />
                  追加
                </button>
              </div>
            )}
            <Link className="link-btn" to={`/projects/${projectId}/risks`}>
              リスク一覧を開く
            </Link>
          </section>
        )}

        {/* 実績の履歴 */}
        {!isNew && !isParent && !isMilestone && (
          <section className="history">
            <h3 className="section-title">
              作業時間の記録 <span>実績 = 合計 {fmtNum(act)}h（{entries.length}件）</span>
            </h3>
            {entries.length === 0 ? (
              <p className="hint">まだ作業時間の記録がありません。担当者が「自分の作業」から入力すると、実績に加算されます。</p>
            ) : (
              <ul className="history__list">
                {entries.slice(0, 8).map((e) => (
                  <li key={e.id}>
                    <span className="history__date">{fmtMD(e.date)}</span>
                    <Avatar user={derived.userById.get(e.userId)} size="sm" />
                    <span className="history__hours">{fmtNum(e.hours)}h</span>
                    <span className="history__comment">
                      {e.orderId && <em className="history__order">{data.internalOrders.find((o) => o.id === e.orderId)?.code} </em>}
                      {e.comment || '—'}
                    </span>
                  </li>
                ))}
                {entries.length > 8 && <li className="history__more">ほか {entries.length - 8} 件</li>}
              </ul>
            )}
          </section>
        )}

        {/* 更新履歴・コメント */}
        {item && (
          <section className="dsec">
            <h3 className="section-title">
              更新履歴・コメント <span>{logs.length}件</span>
            </h3>
            {me.role !== 'viewer' && (
              <div className="cform">
                <textarea
                  className="input input--area"
                  rows={2}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="コメントを書く（関係者の更新履歴に残ります）"
                  aria-label="コメント"
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={!commentText.trim()}
                  onClick={() => {
                    actions.addComment('wbs', item.id, projectId, commentText.trim())
                    setCommentText('')
                  }}
                >
                  <MessageSquare size={14} />
                  コメントする
                </button>
              </div>
            )}
            {logs.length === 0 ? (
              <p className="hint">まだ更新履歴がありません。</p>
            ) : (
              <ul className="alog">
                {logs.slice(0, 12).map((l) => (
                  <li key={l.id} className={cx(l.action === 'comment' && 'is-comment')}>
                    {l.action === 'comment' ? <MessageSquare size={13} /> : <History size={13} />}
                    <span className="alog__meta">
                      {derived.userById.get(l.userId)?.name ?? l.userId} · {fmtDateTime(l.timestamp)}
                    </span>
                    <span className="alog__text">{l.summary}</span>
                  </li>
                ))}
                {logs.length > 12 && <li className="history__more">ほか {logs.length - 12} 件</li>}
              </ul>
            )}
          </section>
        )}
      </Drawer>

      {confirmDelete && item && (
        <ConfirmDialog title="この作業を削除しますか？" confirmLabel="削除する" onCancel={() => setConfirmDelete(false)} onConfirm={doDelete}>
          「{item.title}」{childCount > 0 ? `と配下の ${childCount} 件` : ''}、およびこれらの作業時間の記録も削除されます。
        </ConfirmDialog>
      )}
    </>
  )
}

function depthOf(byId: Map<string, WbsItem>, w: WbsItem): number {
  let d = 0
  let cur: WbsItem | undefined = w
  while (cur?.parentId) {
    d++
    cur = byId.get(cur.parentId)
  }
  return d
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="dsec dsec--form">
      <legend className="dsec__title">{title}</legend>
      {children}
    </fieldset>
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
