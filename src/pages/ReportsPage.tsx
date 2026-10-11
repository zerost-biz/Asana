import { ChevronLeft, ChevronRight, Copy, Download, FileSpreadsheet, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '../components/Card'
import { KpiCard } from '../components/KpiCard'
import { PageHeader } from '../components/PageHeader'
import { useToast } from '../components/Toast'
import { cx } from '../components/cx'
import { CLOSING_KIND_LABEL, makePeriod, periodContaining, stepPeriod, type ClosingKind, type ClosingPeriod } from '../domain/closing'
import { toCsv } from '../domain/csv'
import { fmtNum, fmtYen } from '../domain/format'
import {
  buildDetail,
  buildSummary,
  detailCsvRows,
  reportFileName,
  summaryCsvRows,
  sumCost,
  sumHours,
} from '../domain/orderReport'
import { copyText, saveTextFile } from '../platform/saveFile'
import { useApp } from '../store/AppContext'

type View = 'summary' | 'detail'
const PREVIEW_LIMIT = 300

/** レポート: 社内オーダー別の作業時間・人件費を、15日締め・末締めで集計して、CSVで出力する */
export function ReportsPage() {
  const { data, derived, can, today } = useApp()
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const [period, setPeriod] = useState<ClosingPeriod>(() => periodContaining(today))
  const [view, setView] = useState<View>('summary')
  const [byUser, setByUser] = useState(false)
  const [total, setTotal] = useState(false)

  const requested = params.get('project')
  const projectId = requested && data.projects.some((p) => p.id === requested) ? requested : 'all'
  const project = projectId === 'all' ? undefined : derived.projectById.get(projectId)

  const ctx = useMemo(
    () => ({
      entries: data.timeEntries,
      wbsById: derived.idx.byId,
      wbsNumbers: derived.numbers,
      projects: data.projects,
      customers: data.customers,
      orders: data.internalOrders,
      users: data.users,
      rateOf: derived.rateOf,
    }),
    [data, derived],
  )
  const detail = useMemo(() => buildDetail(ctx, { period, projectId }), [ctx, period, projectId])
  const summary = useMemo(() => buildSummary(detail, byUser), [detail, byUser])

  if (!can('report.export')) {
    return (
      <div className="page">
        <PageHeader title="レポート" />
        <div className="empty empty--big">レポートの出力は、リーダー以上の権限が必要です。右上のユーザー切替で確認できます。</div>
      </div>
    )
  }

  const totalHours = sumHours(detail)
  const totalCost = sumCost(detail)
  const unsetHours = sumHours(detail.filter((d) => d.orderId === null))
  const orderCount = new Set(detail.filter((d) => d.orderId !== null).map((d) => d.orderId)).size
  const isCurrent = period.kind !== 'month' && period.start === periodContaining(today).start

  const setKind = (k: ClosingKind) => {
    // 今の期間を含む種類へ切り替える（前半→月全体 は同じ月、月全体→前半 はその月の前半）
    setPeriod(makePeriod(period.year, period.month, k))
  }
  const setProject = (id: string) =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        if (id === 'all') n.delete('project')
        else n.set('project', id)
        return n
      },
      { replace: true },
    )

  const csv = (which: View): { name: string; text: string; rows: number } => {
    const rows =
      which === 'summary'
        ? summaryCsvRows(summary, period, { byUser, total })
        : detailCsvRows(detail, period, { total })
    return { name: reportFileName(which, period, project?.name), text: toCsv(rows), rows: rows.length - 1 }
  }
  const download = async (which: View) => {
    const f = csv(which)
    if (f.rows <= 0 && !total) return toast('この期間に出力するデータがありません', 'info')
    const r = await saveTextFile(f.name, f.text)
    if (r.outcome === 'saved') {
      toast(
        r.drive ? (
          <><strong>{f.name}</strong> をGoogleドライブに保存しました（{f.rows}行）。<a href={r.drive} target="_blank" rel="noreferrer">開く</a></>
        ) : (
          <><strong>{f.name}</strong> を出力しました（{f.rows}行）</>
        ),
      )
    } else if (r.outcome === 'failed') toast('この表示環境ではダウンロードできません。「コピー」から表計算ソフトへ貼り付けてください', 'info')
  }
  const copy = async () => {
    const f = csv(view)
    toast((await copyText(f.text)) ? 'CSVの内容をコピーしました（表計算ソフトへ貼り付けできます）' : 'コピーできませんでした', 'info')
  }

  return (
    <div className="page page--wide">
      <PageHeader
        title="レポート"
        sub="社内オーダー別の作業時間と人件費を、15日締め・末締めで集計してCSVで出力します。作業時間は「作業日」で期間に振り分けます"
      />

      <div className="rpt-bar" role="group" aria-label="期間と対象の選択">
        <div className="rpt-period">
          <button type="button" className="icon-btn" aria-label="前の期間" onClick={() => setPeriod(stepPeriod(period, -1))}>
            <ChevronLeft size={18} />
          </button>
          <div className="rpt-period__label" aria-live="polite">
            <strong>{period.label}</strong>
            <small>
              {period.start} 〜 {period.end}（締め日 {period.closingDate}）
            </small>
          </div>
          <button type="button" className="icon-btn" aria-label="次の期間" onClick={() => setPeriod(stepPeriod(period, 1))}>
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="unit-toggle" role="radiogroup" aria-label="締めの区分">
          {(['first', 'second', 'month'] as ClosingKind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={period.kind === k} className={cx(period.kind === k && 'is-on')} onClick={() => setKind(k)}>
              {CLOSING_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--ghost btn--sm" disabled={isCurrent} onClick={() => setPeriod(periodContaining(today))}>
          今回の締めへ
        </button>

        <label className="rpt-field">
          <span>プロジェクト</span>
          <select className="input input--sm" value={projectId} onChange={(e) => setProject(e.target.value)} aria-label="プロジェクト">
            <option value="all">すべて</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="kpi-grid">
        <KpiCard label="作業時間の合計" value={fmtNum(totalHours)} unit="h" sub={`${detail.length}件の作業時間`} />
        <KpiCard label="人件費の合計" value={fmtYen(totalCost)} sub="入力した人の時間単価で計算" />
        <KpiCard label="社内オーダー" value={orderCount} unit="件" sub="作業時間が計上されたオーダー" />
        <KpiCard label="オーダー未設定の時間" value={fmtNum(unsetHours)} unit="h" tone={unsetHours > 0 ? 'attention' : 'good'} sub={unsetHours > 0 ? '「（未設定）」として集計されます' : 'すべてオーダーに計上されています'} />
      </div>

      {unsetHours > 0 && (
        <p className="notice-inline" role="status">
          <TriangleAlert size={14} /> オーダー未設定の作業時間が {fmtNum(unsetHours)}h あります。プロジェクトの
          {project ? (
            <Link className="link-btn" to={`/projects/${project.id}/orders`}>
              「社内オーダー」タブ
            </Link>
          ) : (
            '「社内オーダー」タブ'
          )}
          で、まとめて割り当てられます。
        </p>
      )}

      <Card
        title={view === 'summary' ? 'オーダー別の集計' : '作業時間の明細'}
        subtitle={`${period.label}${project ? ` ・ ${project.name}` : ' ・ すべてのプロジェクト'}`}
        action={
          <div className="rpt-actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => download('summary')}>
              <Download size={14} /> 集計をCSVで出力
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => download('detail')}>
              <Download size={14} /> 明細をCSVで出力
            </button>
          </div>
        }
        flush
      >
        <div className="rpt-tools">
          <div className="unit-toggle" role="radiogroup" aria-label="表示する表">
            <button type="button" role="radio" aria-checked={view === 'summary'} className={cx(view === 'summary' && 'is-on')} onClick={() => setView('summary')}>
              集計
            </button>
            <button type="button" role="radio" aria-checked={view === 'detail'} className={cx(view === 'detail' && 'is-on')} onClick={() => setView('detail')}>
              明細
            </button>
          </div>
          {view === 'summary' && (
            <label className="check">
              <input type="checkbox" checked={byUser} onChange={(e) => setByUser(e.target.checked)} />
              担当者別に分ける
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={total} onChange={(e) => setTotal(e.target.checked)} />
            CSVに合計行を付ける
          </label>
          <button type="button" className="btn btn--ghost btn--sm rpt-tools__copy" onClick={copy}>
            <Copy size={14} /> 表示中の表をコピー
          </button>
        </div>

        {detail.length === 0 ? (
          <div className="empty empty--big">
            <FileSpreadsheet size={26} />
            この期間（{period.start}〜{period.end}）の作業時間はありません。前の期間・次の期間へ動かして確認できます。
          </div>
        ) : view === 'summary' ? (
          <div className="rpt-scroll">
            <table className="rpt" aria-label="オーダー別の集計">
              <thead>
                <tr>
                  <th>プロジェクト</th>
                  <th>顧客</th>
                  <th>社内オーダー番号</th>
                  <th>オーダー名</th>
                  {byUser && <th>担当者</th>}
                  <th className="num">作業時間(h)</th>
                  <th className="num">人件費(円)</th>
                  <th className="num">件数</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={`${r.projectId}|${r.orderId}|${r.userId}`} className={cx(r.orderId === null && 'is-unset')}>
                    <td>{r.projectName}</td>
                    <td>{r.customerName}</td>
                    <td className="rpt__code">{r.orderCode}</td>
                    <td>{r.orderName}</td>
                    {byUser && <td>{r.userName}</td>}
                    <td className="num">{fmtNum(r.hours)}</td>
                    <td className="num">{Math.round(r.cost).toLocaleString('ja-JP')}</td>
                    <td className="num">{r.count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={byUser ? 5 : 4}>合計</th>
                  <th className="num">{fmtNum(totalHours)}</th>
                  <th className="num">{Math.round(totalCost).toLocaleString('ja-JP')}</th>
                  <th className="num">{detail.length}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="rpt-scroll">
            <table className="rpt" aria-label="作業時間の明細">
              <thead>
                <tr>
                  <th>作業日</th>
                  <th>プロジェクト</th>
                  <th>社内オーダー番号</th>
                  <th>作業</th>
                  <th>担当者</th>
                  <th className="num">作業時間(h)</th>
                  <th className="num">人件費(円)</th>
                  <th>コメント</th>
                </tr>
              </thead>
              <tbody>
                {detail.slice(0, PREVIEW_LIMIT).map((r, i) => (
                  <tr key={i} className={cx(r.orderId === null && 'is-unset')}>
                    <td className="rpt__date">{r.date}</td>
                    <td>{r.projectName}</td>
                    <td className="rpt__code">{r.orderCode}</td>
                    <td>
                      {r.wbsNo} {r.wbsTitle}
                    </td>
                    <td>{r.userName}</td>
                    <td className="num">{fmtNum(r.hours)}</td>
                    <td className="num">{Math.round(r.cost).toLocaleString('ja-JP')}</td>
                    <td className="rpt__comment">{r.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.length > PREVIEW_LIMIT && <p className="hint rpt__more">プレビューは先頭 {PREVIEW_LIMIT} 件です。CSVには {detail.length} 件すべてが入ります。</p>}
          </div>
        )}
      </Card>

      <p className="hint">
        CSVは UTF-8（BOMつき）・改行 CRLF で、Excel で文字化けせずに開けます。人件費は「入力した人の現在の時間単価 × 作業時間」です（単価の履歴は持ちません）。
        15日締めは1日〜15日、末締めは16日〜月末の作業日を対象にします。
      </p>
    </div>
  )
}
