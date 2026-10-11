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
import { usePref } from '../hooks/usePref'
import type { WbsItem } from '../domain/types'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { WbsTypeIcon } from './WbsTypeIcon'
import { cx } from './cx'

interface Props {
  projectId: string
  selectedId: string | null
  onOpen: (id: string) => void
}

/** 週表示は1日18px、月表示は1日6px（長期の見通し用） */
const DAY_W_BY_SCALE = { week: 18, month: 6 } as const
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
  const [scale, setScale] = usePref<'week' | 'month'>('timeline-scale', 'week', ['week', 'month'])
  const DAY_W = DAY_W_BY_SCALE[scale]

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
    const end = addDays(weekStartOf(parseDate(maxISO)), 7 * (scale === 'month' ? 6 : 2) - 1)
    const days = daysBetween(toISO(start), toISO(end)) + 1
    return { start, end, days, startISO: toISO(start) }
  }, [tops, metrics, todayISO, scale])

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
  }, [range, DAY_W])

  // 初回表示で「今日」が見える位置までスクロール
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = Math.max(0, todayX - 360)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, scale])

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

  // 先行 → 後続の矢印（両方の行が見えているものだけ）
  const deps = useMemo(() => {
    const rowIndex = new Map(rows.map((r, i) => [r.item.id, i]))
    const out: { key: string; x1: number; y1: number; x2: number; y2: number; bad: boolean }[] = []
    for (const { item } of rows) {
      if (!item.predecessorId) continue
      const pi = rowIndex.get(item.predecessorId)
      const si = rowIndex.get(item.id)
      const pred = idx.byId.get(item.predecessorId)
      if (pi === undefined || si === undefined || !pred) continue
      const pm = metrics.get(pred.id)
      const sm = metrics.get(item.id)
      if (!pm || !sm) continue
      const x1 = x(pm.endDate) + DAY_W - 1
      const x2 = item.type === 'milestone' ? x(sm.endDate) + DAY_W / 2 - 9 : x(sm.startDate)
      out.push({
        key: `${pred.id}->${item.id}`,
        x1,
        y1: pi * rowH + rowH / 2,
        x2,
        y2: si * rowH + rowH / 2,
        bad: pred.status !== 'done' && sm.startDate < pm.endDate,
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, metrics, idx, DAY_W, range.startISO])

  return (
    <section className="tl" aria-label="タイムライン">
      <div className="tl__toolbar">
        <div className="tl__legend">
          <span><i className="tl__swatch tl__swatch--bar" />期間（濃い部分＝進捗）</span>
          <span><i className="tl__swatch tl__swatch--late" />遅延</span>
          <span><i className="tl__swatch tl__swatch--blocked" />停止中</span>
          <span><i className="tl__swatch tl__swatch--ms" />マイルストーン</span>
          <span><i className="tl__swatch tl__swatch--dep" />先行 → 後続</span>
          <span><i className="tl__swatch tl__swatch--today" />今日（{fmtMDDate(today)}）</span>
        </div>
        <div className="tl__tools">
          <div className="unit-toggle" role="radiogroup" aria-label="表示の粒度">
            <button type="button" role="radio" aria-checked={scale === 'week'} className={cx(scale === 'week' && 'is-on')} onClick={() => setScale('week')}>
              週
            </button>
            <button type="button" role="radio" aria-checked={scale === 'month'} className={cx(scale === 'month' && 'is-on')} onClick={() => setScale('month')}>
              月
            </button>
          </div>
          <button type="button" className="btn btn--ghost" onClick={jumpToday}>
            今日へ移動
          </button>
        </div>
      </div>

      <div className="tl__scroll" ref={scrollRef}>
        <div className="tl__inner" style={{ width: LEFT_W + width }}>
          {/* ヘッダー（日付軸） */}
          <div className="tl__head">
            <div className="tl__corner" style={{ width: LEFT_W }}>作業項目</div>
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
                    {scale === 'week' ? fmtMDDate(addDays(range.start, i * 7)) : ''}
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
              const blocked = !isParent && item.status === 'blocked'
              const left = x(m.startDate)
              const w = (daysBetween(m.startDate, m.endDate) + 1) * DAY_W - 2
              const depth = idx.byId.get(item.id)?.parentId ? 1 : 0
              const ms = item.type === 'milestone'
              const msX = x(m.endDate) + DAY_W / 2
              const tip = `${item.title}\n${fmtMD(m.startDate)} – ${fmtMD(m.endDate)} / 進捗 ${Math.round(m.progress)}%\n計画 ${fmtNum(m.plan)}h  実績 ${fmtNum(m.act)}h  残り ${fmtNum(m.etc)}h  見込み ${fmtNum(m.eac)}h`
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
                    <WbsTypeIcon type={item.type} />
                    <span className="wbs__code">{numbers.get(item.id)}</span>
                    <span className="tl__name">{item.title}</span>
                    {!isParent && <Avatar user={owner} size="sm" className="tl__owner" />}
                  </div>

                  <div className="tl__track" style={{ width }}>
                    {ms ? (
                      <>
                        <span
                          className={cx('tl__ms', item.status === 'done' && 'is-done', od && 'is-late')}
                          style={{ left: msX }}
                          title={`${item.title}（${fmtMD(m.endDate)}）${item.status === 'done' ? ' 達成' : od ? ' 遅れ' : ''}`}
                        />
                        <span className="tl__ms-label" style={{ left: msX + 14 }}>
                          {item.title}・{fmtMD(m.endDate)}
                          {od && ` 遅れ${daysBetween(m.endDate, todayISO)}日`}
                        </span>
                      </>
                    ) : (
                    <div
                      className={cx(
                        'tl__bar',
                        `tl__bar--p${phase % 5}`,
                        isParent && 'tl__bar--parent',
                        od && 'tl__bar--late',
                        blocked && 'tl__bar--blocked',
                        m.status === 'done' && 'tl__bar--done',
                      )}
                      style={{ left, width: Math.max(w, 6) }}
                      title={tip}
                    >
                      <span className="tl__fill" style={{ width: `${m.progress}%` }} />
                      {w > 56 && <span className="tl__pct">{Math.round(m.progress)}%</span>}
                      {blocked && <Lock size={12} strokeWidth={2.4} className="tl__lock" />}
                    </div>
                    )}
                    {od && !ms && (
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
            <svg className="tl__deps" width={width} height={rows.length * rowH} aria-hidden="true">
              <defs>
                <marker id="tl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0 0 L8 4 L0 8 z" fill="context-stroke" />
                </marker>
              </defs>
              {deps.map((d) => (
                <path
                  key={d.key}
                  d={`M ${d.x1} ${d.y1} C ${d.x1 + 22} ${d.y1}, ${d.x2 - 22} ${d.y2}, ${d.x2} ${d.y2}`}
                  className={cx('tl__dep', d.bad && 'is-bad')}
                  markerEnd="url(#tl-arrow)"
                />
              ))}
            </svg>
            <div className="tl__today" style={{ left: todayX }}>
              <span>今日</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
