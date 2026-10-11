import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Diamond,
  ExternalLink,
  Flag,
  Link2,
  ListPlus,
  Lock,
  MoreHorizontal,
  Plus,
  Trash2,
  TriangleAlert,
  Wand2,
} from 'lucide-react'
import { useMemo, useState, type KeyboardEvent } from 'react'
import { isOverdue, type Metrics } from '../domain/calculations'
import { daysBetween, fmtMD } from '../domain/dates'
import { fmtNum, fmtSignedH, fmtSignedYenShort, fmtYenShort } from '../domain/format'
import type { User, WbsItem } from '../domain/types'
import { usePref } from '../hooks/usePref'
import { useApp } from '../store/AppContext'
import { Avatar, AvatarStack } from './Avatar'
import { ConfirmDialog } from './ConfirmDialog'
import { GlossaryButton } from './GlossaryDialog'
import { Popover } from './Popover'
import { ProgressBar } from './ProgressBar'
import { WbsStatusBadge } from './StatusBadge'
import { TemplateDialog } from './TemplateDialog'
import { useToast } from './Toast'
import { WbsTypeIcon } from './WbsTypeIcon'
import { cx } from './cx'

interface Props {
  projectId: string
  selectedId: string | null
  onOpen: (id: string) => void
  onAdd: (parentId: string | null, type?: 'task' | 'milestone') => void
}

interface Row {
  item: WbsItem
  depth: number
  isParent: boolean
}

function VarianceCell({ value, text }: { value: number; text: string }) {
  const r = Math.round(value * 10) / 10
  if (r > 0)
    return (
      <span className="var var--over" title="見込みが計画を超えています">
        <TriangleAlert size={12} strokeWidth={2.4} />
        {text}
      </span>
    )
  if (r < 0) return <span className="var var--under">{text}</span>
  return <span className="var var--zero">{text}</span>
}

export function WbsTable({ projectId, selectedId, onOpen, onAdd }: Props) {
  const { data, derived, actions, can } = useApp()
  const { toast } = useToast()
  const { idx, metrics, numbers, userById, todayISO } = derived
  const project = derived.projectById.get(projectId)
  const canEdit = can('wbs.structure', { project })
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [warnOnly, setWarnOnly] = useState(false)
  const [template, setTemplate] = useState(false)
  const [deleting, setDeleting] = useState<WbsItem | null>(null)
  /** 数値列の表示単位: 工数(h) / 人件費(円) */
  const [unit, setUnit] = usePref<'h' | 'yen'>('wbs-unit', 'h', ['h', 'yen'])
  const money = (h: number, yen: number) =>
    unit === 'h' ? (
      <>
        {fmtNum(h)}
        <i>h</i>
      </>
    ) : (
      <>{fmtYenShort(yen)}</>
    )
  const varianceCell = (hours: number, yen: number) =>
    unit === 'h' ? (
      <VarianceCell value={hours} text={fmtSignedH(hours)} />
    ) : (
      <VarianceCell value={yen} text={fmtSignedYenShort(yen)} />
    )

  const tops = useMemo(() => idx.topOf.get(projectId) ?? [], [idx, projectId])
  const totals = derived.summaryById.get(projectId)?.totals

  // 子孫の遅延/停止中件数（親行の警告表示用）
  const warnCount = useMemo(() => {
    const map = new Map<string, { overdue: number; blocked: number }>()
    for (const l of derived.leaves) {
      if (l.projectId !== projectId) continue
      const od = isOverdue(l.status, l.endDate, todayISO)
      const bl = l.status === 'blocked'
      if (!od && !bl) continue
      let cur = l.parentId ? idx.byId.get(l.parentId) : undefined
      while (cur) {
        const w = map.get(cur.id) ?? { overdue: 0, blocked: 0 }
        if (od) w.overdue++
        if (bl) w.blocked++
        map.set(cur.id, w)
        cur = cur.parentId ? idx.byId.get(cur.parentId) : undefined
      }
    }
    return map
  }, [derived.leaves, projectId, idx, todayISO])

  const riskCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of data.risks) if (r.wbsId && r.status !== 'closed') m.set(r.wbsId, (m.get(r.wbsId) ?? 0) + 1)
    return m
  }, [data.risks])

  const withEntries = useMemo(() => new Set(data.timeEntries.map((e) => e.wbsId)), [data.timeEntries])

  const isWarn = (it: WbsItem): boolean => {
    if (it.type === 'milestone') return it.status !== 'done' && it.endDate < todayISO
    const m = metrics.get(it.id)
    return it.status === 'blocked' || isOverdue(it.status, it.endDate, todayISO) || (m ? Math.round(m.variance * 10) / 10 > 0 && it.status !== 'done' : false)
  }

  const rows = useMemo(() => {
    const visible = (it: WbsItem): boolean => {
      const kids = idx.childrenOf.get(it.id)
      if (!kids) return (ownerFilter === 'all' || it.ownerId === ownerFilter) && (!warnOnly || isWarn(it))
      return kids.some(visible)
    }
    const out: Row[] = []
    const walk = (list: WbsItem[], depth: number) => {
      for (const it of list) {
        if (!visible(it)) continue
        const kids = idx.childrenOf.get(it.id)
        out.push({ item: it, depth, isParent: !!kids })
        if (kids && !collapsed.has(it.id)) walk(kids, depth + 1)
      }
    }
    walk(tops, 0)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, tops, collapsed, ownerFilter, warnOnly, metrics, todayISO])

  const parentIds = useMemo(() => [...idx.childrenOf.keys()].filter((id) => idx.byId.get(id)?.projectId === projectId), [idx, projectId])
  const allCollapsed = parentIds.length > 0 && parentIds.every((id) => collapsed.has(id))

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const ownersInProject = useMemo(() => {
    const ids = new Set(derived.leaves.filter((l) => l.projectId === projectId && l.ownerId).map((l) => l.ownerId!))
    return data.users.filter((u) => ids.has(u.id))
  }, [derived.leaves, projectId, data.users])

  const keyOpen = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(id)
    }
  }

  const empty = tops.length === 0

  return (
    <section className="wbs" aria-label="作業一覧">
      <div className="wbs__toolbar">
        <div className="wbs__toolbar-left">
          {canEdit && (
            <>
              <button type="button" className="btn btn--primary" onClick={() => onAdd(null, 'task')}>
                <Plus size={16} />
                作業を追加
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => onAdd(null, 'milestone')}>
                <Diamond size={15} />
                マイルストーン
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setTemplate(true)} title="標準の作業（現状分析 → To-Be設計 → ロードマップ策定）を一括で追加">
                <Wand2 size={15} />
                テンプレートから作成
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(parentIds))}
            disabled={parentIds.length === 0}
          >
            {allCollapsed ? 'すべて展開' : 'すべて折りたたむ'}
          </button>
        </div>
        <div className="wbs__toolbar-right">
          <GlossaryButton />
          <label className="check" title="遅延・時間超過・停止中の行だけを表示">
            <input type="checkbox" checked={warnOnly} onChange={(e) => setWarnOnly(e.target.checked)} />
            警告のある行だけ
          </label>
          <div className="unit-toggle" role="radiogroup" aria-label="表示単位">
            <button type="button" role="radio" aria-checked={unit === 'h'} className={cx(unit === 'h' && 'is-on')} onClick={() => setUnit('h')}>
              時間
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={unit === 'yen'}
              className={cx(unit === 'yen' && 'is-on')}
              onClick={() => setUnit('yen')}
              title="作業時間 × 単価の人件費（万円表記）"
            >
              金額（円）
            </button>
          </div>
          <label className="wbs__filter">
            <span>担当</span>
            <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
              <option value="all">すべて</option>
              {ownersInProject.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="wbs__scroll">
        <div className="wbs__table" role="table">
          <div className="wbs__row wbs__row--head" role="row">
            <div role="columnheader">作業項目</div>
            <div role="columnheader">担当</div>
            <div role="columnheader">開始</div>
            <div role="columnheader">終了</div>
            <div role="columnheader" className="num" title="計画: 最初に見積もった作業時間">計画</div>
            <div role="columnheader" className="num" title="実績: これまでに記録された作業時間の合計">実績</div>
            <div role="columnheader" className="num" title="残り: 完了まで、あと何時間かかるか（担当者が入力）">残り</div>
            <div role="columnheader" className="num" title="見込み: 実績 + 残り（完了までの合計時間）">見込み</div>
            <div role="columnheader" className="num" title="差異: 見込み − 計画（＋は計画より時間がかかる）">差異</div>
            <div role="columnheader">進捗</div>
            <div role="columnheader">状態</div>
            <div role="columnheader" aria-label="操作" />
          </div>

          {rows.map(({ item, depth, isParent }) => {
            const m = metrics.get(item.id) as Metrics
            const owner: User | undefined = item.ownerId ? userById.get(item.ownerId) : undefined
            const ms = item.type === 'milestone'
            const od = isOverdue(m.status, m.endDate, todayISO)
            const w = warnCount.get(item.id)
            const nRisk = riskCount.get(item.id) ?? 0
            const pred = item.predecessorId ? idx.byId.get(item.predecessorId) : undefined
            const depBad = !!pred && pred.status !== 'done' && item.startDate < pred.endDate
            const parentOwners = isParent
              ? Array.from(new Set(derived.leaves.filter((l) => l.ownerId && isDescendant(idx.byId, l, item.id)).map((l) => l.ownerId as string)))
                  .map((id) => userById.get(id))
                  .filter((u): u is User => !!u)
              : []
            const canChild = item.type !== 'milestone' && (isParent || !withEntries.has(item.id))
            return (
              <div
                key={item.id}
                role="row"
                tabIndex={0}
                className={cx(
                  'wbs__row',
                  isParent && 'wbs__row--parent',
                  ms && 'wbs__row--ms',
                  selectedId === item.id && 'is-selected',
                  m.status === 'done' && !isParent && 'is-done',
                )}
                onClick={() => onOpen(item.id)}
                onKeyDown={(e) => keyOpen(e, item.id)}
              >
                <div role="cell" className="wbs__name" style={{ paddingLeft: depth * 24 }}>
                  {isParent ? (
                    <button
                      type="button"
                      className="chev"
                      aria-label={collapsed.has(item.id) ? '展開' : '折りたたむ'}
                      aria-expanded={!collapsed.has(item.id)}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(item.id)
                      }}
                    >
                      {collapsed.has(item.id) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </button>
                  ) : (
                    <span className="chev chev--spacer" />
                  )}
                  <WbsTypeIcon type={item.type} />
                  <span className="wbs__code">{numbers.get(item.id)}</span>
                  <span className="wbs__title">{item.title}</span>
                  {pred && (
                    <span className={cx('wbs__ind', depBad && 'is-bad')} title={`先行: ${pred.title}（${fmtMD(pred.endDate)}まで）${depBad ? ' ― 開始日が先行の終了前です' : ''}`}>
                      <Link2 size={12} />
                    </span>
                  )}
                  {item.deliverableUrl && (
                    <a
                      className="wbs__ind"
                      href={item.deliverableUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      title="成果物を開く"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                  {nRisk > 0 && (
                    <span className="wbs__ind wbs__ind--risk" title={`未解決のリスク・課題 ${nRisk}件`}>
                      <Flag size={12} />
                      {nRisk}
                    </span>
                  )}
                  {!isParent && item.status === 'blocked' && (
                    <span className="chip chip--warn" title="停止中">
                      <Lock size={11} strokeWidth={2.4} />
                    </span>
                  )}
                  {!isParent && od && (
                    <span className="chip chip--warn" title="終了日を過ぎています">
                      遅延 {daysBetween(item.endDate, todayISO)}日
                    </span>
                  )}
                  {isParent && w && (w.overdue > 0 || w.blocked > 0) && (
                    <span className="chip chip--warn" title="配下に遅延・停止中の作業があります">
                      <TriangleAlert size={11} strokeWidth={2.4} />
                      {[w.overdue > 0 && `遅延${w.overdue}`, w.blocked > 0 && `停止${w.blocked}`].filter(Boolean).join(' ')}
                    </span>
                  )}
                </div>

                <div role="cell" className="wbs__owner">
                  {isParent ? (
                    <AvatarStack users={parentOwners} />
                  ) : ms ? (
                    <span className="wbs__dash">—</span>
                  ) : (
                    <>
                      <Avatar user={owner} size="sm" />
                      <span>{owner?.name ?? '未設定'}</span>
                    </>
                  )}
                </div>
                <div role="cell" className="wbs__date">{ms ? '' : fmtMD(m.startDate)}</div>
                <div role="cell" className={cx('wbs__date', od && 'is-late')}>{fmtMD(m.endDate)}</div>
                {ms ? (
                  <>
                    <div role="cell" className="wbs__mscell">マイルストーン</div>
                    <div role="cell" />
                    <div role="cell">
                      <span className={cx('badge', 'badge--status', item.status === 'done' ? 'badge--done' : od ? 'badge--blocked' : 'badge--todo')}>
                        {item.status === 'done' ? '達成' : od ? '遅れ' : '未達成'}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div role="cell" className="num">{money(m.plan, m.planCost)}</div>
                    <div role="cell" className="num">{money(m.act, m.actCost)}</div>
                    <div role="cell" className="num">{money(m.etc, m.etcCost)}</div>
                    <div role="cell" className="num num--strong">{money(m.eac, m.eacCost)}</div>
                    <div role="cell" className="num">{varianceCell(m.variance, m.varianceCost)}</div>
                    <div role="cell" className="wbs__progress">
                      <span>{Math.round(m.progress)}%</span>
                      <ProgressBar value={m.progress} size="sm" tone={m.status === 'done' ? 'good' : 'accent'} />
                    </div>
                    <div role="cell"><WbsStatusBadge status={m.status} /></div>
                  </>
                )}
                <div role="cell" className="wbs__menu" onClick={(e) => e.stopPropagation()}>
                  {canEdit && (
                    <Popover
                      align="right"
                      trigger={({ toggle: t, open }) => (
                        <button type="button" className={cx('icon-btn icon-btn--sm', open && 'is-active')} onClick={t} aria-label={`${item.title}の操作`} title="操作">
                          <MoreHorizontal size={16} />
                        </button>
                      )}
                    >
                      {(close) => (
                        <div className="menu">
                          {item.type !== 'milestone' && (
                            <>
                              <button
                                type="button"
                                className="menu__item"
                                disabled={!canChild}
                                title={canChild ? undefined : '作業時間の記録がある作業には、配下を追加できません'}
                                onClick={() => {
                                  close()
                                  onAdd(item.id, 'task')
                                }}
                              >
                                <ListPlus size={16} />
                                {isParent || item.type !== 'task' ? '配下に作業を追加' : 'サブタスクを追加'}
                              </button>
                              <button
                                type="button"
                                className="menu__item"
                                onClick={() => {
                                  close()
                                  onAdd(item.id, 'milestone')
                                }}
                              >
                                <Diamond size={16} />
                                配下にマイルストーンを追加
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="menu__item"
                            onClick={() => {
                              close()
                              const id = actions.duplicateWbs(item.id)
                              toast('複製しました（進捗・状態は未着手に戻しています）')
                              onOpen(id)
                            }}
                          >
                            <Copy size={16} />
                            複製
                          </button>
                          <button type="button" className="menu__item" onClick={() => (close(), actions.moveWbs(item.id, 'up'))}>
                            <ArrowUp size={16} />
                            上へ移動
                          </button>
                          <button type="button" className="menu__item" onClick={() => (close(), actions.moveWbs(item.id, 'down'))}>
                            <ArrowDown size={16} />
                            下へ移動
                          </button>
                          <button
                            type="button"
                            className="menu__item menu__item--danger"
                            onClick={() => {
                              close()
                              setDeleting(item)
                            }}
                          >
                            <Trash2 size={16} />
                            削除
                          </button>
                        </div>
                      )}
                    </Popover>
                  )}
                </div>
              </div>
            )
          })}

          {rows.length === 0 && (
            <div className="wbs__empty">
              {empty ? (
                <>
                  作業項目がまだありません。
                  {canEdit ? '「作業を追加」または「テンプレートから作成」で始められます。' : ''}
                </>
              ) : (
                '条件に合う作業がありません'
              )}
            </div>
          )}

          {totals && (
            <div className="wbs__row wbs__row--total" role="row">
              <div role="cell" className="wbs__name" style={{ paddingLeft: 0 }}>
                <span className="chev chev--spacer" />
                <span className="wbs__title">プロジェクト合計</span>
              </div>
              <div role="cell" />
              <div role="cell" />
              <div role="cell" />
              <div role="cell" className="num">{money(totals.plan, totals.planCost)}</div>
              <div role="cell" className="num">{money(totals.act, totals.actCost)}</div>
              <div role="cell" className="num">{money(totals.etc, totals.etcCost)}</div>
              <div role="cell" className="num num--strong">{money(totals.eac, totals.eacCost)}</div>
              <div role="cell" className="num">{varianceCell(totals.variance, totals.varianceCost)}</div>
              <div role="cell" className="wbs__progress">
                <span>{Math.round(totals.progress)}%</span>
                <ProgressBar value={totals.progress} size="sm" />
              </div>
              <div role="cell" />
              <div role="cell" />
            </div>
          )}
        </div>
      </div>

      {canEdit && (
        <button type="button" className="add-task" onClick={() => onAdd(null, 'task')}>
          <Plus size={16} />
          作業を追加
        </button>
      )}

      {template && <TemplateDialog projectId={projectId} onClose={() => setTemplate(false)} />}
      {deleting && (
        <ConfirmDialog
          title="この作業を削除しますか？"
          confirmLabel="削除する"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            actions.deleteWbs(deleting.id)
            toast(`「${deleting.title}」を削除しました`, 'info')
            setDeleting(null)
          }}
        >
          「{deleting.title}」{idx.childrenOf.has(deleting.id) ? 'と配下のすべての作業' : ''}、およびこれらの作業時間の記録も削除されます。
        </ConfirmDialog>
      )}
    </section>
  )
}

function isDescendant(byId: Map<string, WbsItem>, leaf: WbsItem, ancestorId: string): boolean {
  let cur: WbsItem | undefined = leaf
  while (cur?.parentId) {
    if (cur.parentId === ancestorId) return true
    cur = byId.get(cur.parentId)
  }
  return false
}
