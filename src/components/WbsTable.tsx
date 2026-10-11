import { ChevronDown, ChevronRight, Lock, Plus, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type KeyboardEvent } from 'react'
import { daysBetween, fmtMD } from '../domain/dates'
import { fmtNum, fmtSignedH, fmtSignedYenShort, fmtYenShort } from '../domain/format'
import type { Metrics } from '../domain/calculations'
import { isOverdue } from '../domain/calculations'
import type { User, WbsItem } from '../domain/types'
import { usePref } from '../hooks/usePref'
import { useApp } from '../store/AppContext'
import { Avatar, AvatarStack } from './Avatar'
import { ProgressBar } from './ProgressBar'
import { WbsStatusBadge } from './StatusBadge'
import { cx } from './cx'

interface Props {
  projectId: string
  selectedId: string | null
  onOpen: (id: string) => void
  onAdd: (parentId: string | null) => void
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
      <span className="var var--over" title="EAC が PLAN を超過する見込み">
        <TriangleAlert size={12} strokeWidth={2.4} />
        {text}
      </span>
    )
  if (r < 0) return <span className="var var--under">{text}</span>
  return <span className="var var--zero">{text}</span>
}

export function WbsTable({ projectId, selectedId, onOpen, onAdd }: Props) {
  const { data, derived } = useApp()
  const { idx, metrics, numbers, userById, todayISO } = derived
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
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

  // 子孫の遅延/Blocked件数（親行の警告表示用）
  const warnCount = useMemo(() => {
    const map = new Map<string, { overdue: number; blocked: number }>()
    for (const l of derived.leaves) {
      if (l.projectId !== projectId) continue
      const od = isOverdue(l.status, l.endDate, todayISO)
      const bl = l.status === 'Blocked'
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

  const rows = useMemo(() => {
    const visible = (it: WbsItem): boolean => {
      const kids = idx.childrenOf.get(it.id)
      if (!kids) return ownerFilter === 'all' || it.ownerId === ownerFilter
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
  }, [idx, tops, collapsed, ownerFilter])

  const parentIds = useMemo(() => tops.flatMap((t) => (idx.childrenOf.has(t.id) ? [t.id] : [])), [tops, idx])
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

  return (
    <section className="wbs" aria-label="WBS一覧">
      <div className="wbs__toolbar">
        <div className="wbs__toolbar-left">
          <button type="button" className="btn btn--primary" onClick={() => onAdd(null)}>
            <Plus size={16} />
            タスクを追加
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(parentIds))}
          >
            {allCollapsed ? 'すべて展開' : 'すべて折りたたむ'}
          </button>
        </div>
        <div className="wbs__toolbar-right">
          <div className="unit-toggle" role="radiogroup" aria-label="表示単位">
            <button type="button" role="radio" aria-checked={unit === 'h'} className={cx(unit === 'h' && 'is-on')} onClick={() => setUnit('h')}>
              工数 (h)
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={unit === 'yen'}
              className={cx(unit === 'yen' && 'is-on')}
              onClick={() => setUnit('yen')}
              title="工数 × 単価の人件費（万円表記）"
            >
              コスト (円)
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
            <div role="columnheader">WBS</div>
            <div role="columnheader">担当</div>
            <div role="columnheader">開始</div>
            <div role="columnheader">終了</div>
            <div role="columnheader" className="num" title="計画工数">PLAN</div>
            <div role="columnheader" className="num" title="実績工数（TimeEntry合計）">ACT</div>
            <div role="columnheader" className="num" title="残工数（入力値）">ETC</div>
            <div role="columnheader" className="num" title="ACT + ETC">EAC</div>
            <div role="columnheader" className="num" title="EAC − PLAN">差異</div>
            <div role="columnheader">進捗</div>
            <div role="columnheader">状態</div>
          </div>

          {rows.map(({ item, depth, isParent }) => {
            const m = metrics.get(item.id) as Metrics
            const owner: User | undefined = item.ownerId ? userById.get(item.ownerId) : undefined
            const od = isOverdue(m.status, m.endDate, todayISO)
            const w = warnCount.get(item.id)
            const parentOwners = isParent
              ? Array.from(
                  new Set(
                    derived.leaves
                      .filter((l) => l.ownerId && isDescendant(idx.byId, l, item.id))
                      .map((l) => l.ownerId as string),
                  ),
                )
                  .map((id) => userById.get(id))
                  .filter((u): u is User => !!u)
              : []
            return (
              <div
                key={item.id}
                role="row"
                tabIndex={0}
                className={cx(
                  'wbs__row',
                  isParent && 'wbs__row--parent',
                  selectedId === item.id && 'is-selected',
                  m.status === 'Done' && !isParent && 'is-done',
                )}
                onClick={() => onOpen(item.id)}
                onKeyDown={(e) => keyOpen(e, item.id)}
              >
                <div role="cell" className="wbs__name" style={{ paddingLeft: depth * 26 }}>
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
                  <span className="wbs__code">{numbers.get(item.id)}</span>
                  <span className="wbs__title">{item.title}</span>
                  {!isParent && item.status === 'Blocked' && (
                    <span className="chip chip--warn" title="Blocked">
                      <Lock size={11} strokeWidth={2.4} />
                    </span>
                  )}
                  {!isParent && od && (
                    <span className="chip chip--warn" title="終了日を過ぎています">
                      遅延 {daysBetween(item.endDate, todayISO)}日
                    </span>
                  )}
                  {isParent && w && (w.overdue > 0 || w.blocked > 0) && (
                    <span className="chip chip--warn" title="配下に遅延 / Blocked のタスクがあります">
                      <TriangleAlert size={11} strokeWidth={2.4} />
                      {[w.overdue > 0 && `遅延${w.overdue}`, w.blocked > 0 && `Blocked${w.blocked}`].filter(Boolean).join(' ')}
                    </span>
                  )}
                  {isParent && (
                    <button
                      type="button"
                      className="row-add"
                      title="このフェーズにタスクを追加"
                      aria-label="このフェーズにタスクを追加"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAdd(item.id)
                      }}
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>

                <div role="cell" className="wbs__owner">
                  {isParent ? (
                    <AvatarStack users={parentOwners} />
                  ) : (
                    <>
                      <Avatar user={owner} size="sm" />
                      <span>{owner?.name ?? '未設定'}</span>
                    </>
                  )}
                </div>
                <div role="cell" className="wbs__date">{fmtMD(m.startDate)}</div>
                <div role="cell" className={cx('wbs__date', od && 'is-late')}>{fmtMD(m.endDate)}</div>
                <div role="cell" className="num">{money(m.plan, m.planCost)}</div>
                <div role="cell" className="num">{money(m.act, m.actCost)}</div>
                <div role="cell" className="num">{money(m.etc, m.etcCost)}</div>
                <div role="cell" className="num num--strong">{money(m.eac, m.eacCost)}</div>
                <div role="cell" className="num">{varianceCell(m.variance, m.varianceCost)}</div>
                <div role="cell" className="wbs__progress">
                  <span>{Math.round(m.progress)}%</span>
                  <ProgressBar value={m.progress} size="sm" tone={m.status === 'Done' ? 'good' : 'accent'} />
                </div>
                <div role="cell"><WbsStatusBadge status={m.status} /></div>
              </div>
            )
          })}

          {rows.length === 0 && <div className="wbs__empty">表示できるタスクがありません</div>}

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
            </div>
          )}
        </div>
      </div>

      <button type="button" className="add-task" onClick={() => onAdd(null)}>
        <Plus size={16} />
        タスクを追加
      </button>
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
