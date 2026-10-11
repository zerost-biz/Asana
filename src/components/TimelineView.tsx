import { ChevronDown, ChevronRight, Lock } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { isOverdue } from '../domain/calculations'
import {
  addDays,
  daysBetween,
  fmtMD,
  fmtMDDate,
  parseDate,
  toISO,
  weekStartOf,
} from '../domain/dates'
import { fmtNum } from '../domain/format'
import type { WbsItem } from '../domain/types'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { cx } from './cx'

interface Props {
  projectId: string
  selectedId: string | null
  onOpen: (id: string) => void
}

const DAY_W = 18
const LEFT_W = 300

interface Row {
  item: WbsItem
  isParent: boolean
  phase: number
}

/** WBS と同じデータを週単位の日付軸に並べる（ドラッグ編集なし。日付は List 側のドロワーで変更） */
export function TimelineView({ projectId, selectedId, onOpen }: Props) {
  const { derived, today } = useApp()
  const { idx, metrics, numbers, userById, todayISO } = derived
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  const tops = useMemo(() => idx.topOf.get(projectId) ?? [], [idx, projectId])

  const rows = useMemo(() => {
    const out: Row[] = []
    tops.forEach((top, phase) => {
      const kids = idx.childrenOf.get(top.id)
      out.push({ item: top, isParent: !!kids, phase })
      if (kids && !collapsed.has(top.id)) {
        const walk = (list: WbsItem[]) => {
          for (const it of list) {
            const k = idx.childrenOf.get(it.id)
            out.push({ item: it, isParent: !!k, phase })
            if (k && !collapsed.has(it.id)) walk(k)
          }
        }
        walk(kids)
      }
    })
    return out
  }, [tops, idx, collapsed])

  // 表示範囲: 全タスクと「今日」を含む週境界、前後に1週間の余白
  const range = useMemo(() => {
    const all = tops.flatMap((t) => {
      const m = metrics.get(t.id)
      return m ? [m.startDate, m.endDate] : []
    })
    const minISO = all.reduce((a, b) => (b < a ? b : a), todayISO)
    const maxISO = all.reduce((a, b) => (b > a ? b : a), todayISO)
    const start = addDays(weekStartOf(parseDate(minISO)), -7)
    const end = addDays(weekStartOf(parseDate(maxISO)), 7 * 2 - 1)
    const days = daysBetween(toISO(start), toISO(end)) + 1
    return { start, end, days, startISO: toISO(start) }
  }, [tops, metrics, todayISO])

  const width = range.days * DAY_W
  const weeks = Math.round(range.days / 7)
  const x = (iso: string) => daysBetween(range.startISO, iso) * DAY_W
  const todayX = x(todayISO) + DAY_W / 2

  const months = useMemo(() => {
    const out: { label: string; left: number; width: number }[] = []
    let cur: { label: string; left: number; width: number } | null = null
    for (let i = 0; i < range.days; i++) {
      const d = addDays(range.start, i)
      const label = `${d.getFullYear()}年${d.getMonth() + 1}月`
      if (!cur || cur.label !== label) {
        cur = { label, left: i * DAY_W, width: DAY_W }
        out.push(cur)
      } else cur.width += DAY_W
    }
    return out
  }, [range])

  // 初回表示で「今日」が見える位置までスクロール
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = Math.max(0, todayX - 360)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const jumpToday = () => {
    scrollRef.current?.scrollTo({ left: Math.max(0, todayX - 360), behavior: 'smooth' })
  }

  const rowH = 44

  return (
    <section className="tl" aria-label="Timeline">
      <div className="tl__toolbar">
        <div className="tl__legend">
          <span><i className="tl__swatch tl__swatch--bar" />期間（濃い部分＝進捗）</span>
          <span><i className="tl__swatch tl__swatch--late" />遅延</span>
          <span><i className="tl__swatch tl__swatch--blocked" />Blocked</span>
          <span><i className="tl__swatch tl__swatch--today" />今日（{fmtMDDate(today)}）</span>
        </div>
        <button type="button" className="btn btn--ghost" onClick={jumpToday}>
          今日へ移動
        </button>
      </div>

      <div className="tl__scroll" ref={scrollRef}>
        <div className="tl__inner" style={{ width: LEFT_W + width }}>
          {/* ヘッダー（日付軸） */}
          <div className="tl__head">
            <div className="tl__corner" style={{ width: LEFT_W }}>WBS</div>
            <div className="tl__axis" style={{ width }}>
              <div className="tl__months">
                {months.map((m) => (
                  <div key={m.label + m.left} className="tl__month" style={{ left: m.left, width: m.width }}>
                    {m.label}
                  </div>
                ))}
              </div>
              <div className="tl__weeks">
                {Array.from({ length: weeks }, (_, i) => (
                  <div key={i} className="tl__week" style={{ left: i * 7 * DAY_W, width: 7 * DAY_W }}>
                    {fmtMDDate(addDays(range.start, i * 7))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 行 */}
          <div className="tl__body">
            {rows.map(({ item, isParent, phase }) => {
              const m = metrics.get(item.id)!
              const owner = item.ownerId ? userById.get(item.ownerId) : undefined
              const od = isOverdue(m.status, m.endDate, todayISO)
              const blocked = !isParent && item.status === 'Blocked'
              const left = x(m.startDate)
              const w = (daysBetween(m.startDate, m.endDate) + 1) * DAY_W - 2
              const depth = idx.byId.get(item.id)?.parentId ? 1 : 0
              const tip = `${item.title}\n${fmtMD(m.startDate)} – ${fmtMD(m.endDate)} / 進捗 ${Math.round(m.progress)}%\nPLAN ${fmtNum(m.plan)}h  ACT ${fmtNum(m.act)}h  ETC ${fmtNum(m.etc)}h  EAC ${fmtNum(m.eac)}h`
              return (
                <div
                  key={item.id}
                  className={cx('tl__row', isParent && 'tl__row--parent', selectedId === item.id && 'is-selected')}
                  style={{ height: rowH }}
                  onClick={() => onOpen(item.id)}
                >
                  <div className="tl__label" style={{ width: LEFT_W, paddingLeft: 14 + depth * 22 }}>
                    {isParent ? (
                      <button
                        type="button"
                        className="chev"
                        aria-label={collapsed.has(item.id) ? '展開' : '折りたたむ'}
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
                    <span className="tl__name">{item.title}</span>
                    {!isParent && <Avatar user={owner} size="sm" className="tl__owner" />}
                  </div>

                  <div className="tl__track" style={{ width }}>
                    <div
                      className={cx(
                        'tl__bar',
                        `tl__bar--p${phase % 5}`,
                        isParent && 'tl__bar--parent',
                        od && 'tl__bar--late',
                        blocked && 'tl__bar--blocked',
                        m.status === 'Done' && 'tl__bar--done',
                      )}
                      style={{ left, width: Math.max(w, 6) }}
                      title={tip}
                    >
                      <span className="tl__fill" style={{ width: `${m.progress}%` }} />
                      {w > 56 && <span className="tl__pct">{Math.round(m.progress)}%</span>}
                      {blocked && <Lock size={12} strokeWidth={2.4} className="tl__lock" />}
                    </div>
                    {od && (
                      <span className="tl__late-label" style={{ left: left + Math.max(w, 6) + 8 }}>
                        遅延 {daysBetween(m.endDate, todayISO)}日
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 週の縦線・今日線 */}
          <div className="tl__overlay" style={{ left: LEFT_W, width }}>
            <div className="tl__grid" style={{ backgroundSize: `${7 * DAY_W}px 100%` }} />
            <div className="tl__today" style={{ left: todayX }}>
              <span>今日</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
