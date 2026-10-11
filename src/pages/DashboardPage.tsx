import { CalendarClock, Gauge, Info, Layers, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DecisionList } from '../components/DecisionList'
import { KpiCard } from '../components/KpiCard'
import { PageHeader } from '../components/PageHeader'
import { useProjectDialog } from '../components/ProjectDialogHost'
import { ProjectHealthTable } from '../components/ProjectHealthTable'
import { RecentWins } from '../components/RecentWins'
import { useToast } from '../components/Toast'
import { WorkloadOutlook } from '../components/WorkloadOutlook'
import { fmtFull, parseDate, weekStartOf } from '../domain/dates'
import { fmtNum } from '../domain/format'
import { useApp } from '../store/AppContext'

export function DashboardPage() {
  const { data, derived, today, actions } = useApp()
  const { toast } = useToast()
  const { openCreate } = useProjectDialog()
  const [confirmReset, setConfirmReset] = useState(false)
  const { summaries, workload, overloadUsers, decisions, weekActualHours } = derived

  const active = summaries.filter((s) => s.project.status === 'active')
  const count = (h: string) => active.filter((s) => s.health.health === h).length
  const plannedThisWeek = workload.cells.reduce((s, row) => s + row[0].planned, 0)
  const capacityThisWeek = workload.cells.reduce((s, row) => s + row[0].capacity, 0)
  const critical = decisions.filter((d) => d.tone === 'critical').length
  // サンプルデータは「作成した週」を基準に日付が入っている。週をまたいで開いた場合は案内を出す
  const stale = weekStartOf(parseDate(data.seededOn)).getTime() !== weekStartOf(today).getTime()

  return (
    <div className="page">
      <PageHeader
        title="チームのダッシュボード"
        sub={`${fmtFull(today)}  ·  今週は ${workload.weeks[0].range}`}
      />

      {stale && (
        <div className="notice" role="status">
          <Info size={16} />
          <span>
            デモデータは {data.seededOn} の週を基準に作成されています。今週に合わせ直すには初期化してください（入力済みの内容は破棄されます）。
          </span>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirmReset(true)}>
            今週に合わせて初期化
          </button>
        </div>
      )}

      <div className="kpi-grid">
        <KpiCard
          label="進行中のプロジェクト"
          icon={Layers}
          value={active.length}
          unit="件"
          sub={`順調 ${count('GOOD')} · 注意 ${count('WATCH')} · 危険 ${count('RISK')}`}
          to="/projects"
        />
        <KpiCard
          label="今週工数（実績）"
          icon={CalendarClock}
          value={fmtNum(weekActualHours)}
          unit="h"
          sub={`今週の予定 ${fmtNum(plannedThisWeek)}h / 稼働 ${fmtNum(capacityThisWeek)}h`}
          to="/workload"
        />
        <KpiCard
          label="過負荷の人数"
          icon={Users}
          value={overloadUsers.length}
          unit="人"
          tone={overloadUsers.length > 0 ? 'critical' : 'good'}
          sub={overloadUsers.length > 0 ? `${overloadUsers.map((u) => u.initials).join('・')}（4週間で100%超の週あり）` : '4週間すべて100%以内'}
          to="/workload"
        />
        <KpiCard
          label="要判断件数"
          icon={Gauge}
          value={decisions.length}
          unit="件"
          tone={decisions.length > 0 ? 'attention' : 'good'}
          sub={critical > 0 ? `うち重要 ${critical}件` : '重要な判断はありません'}
          onClick={() => document.getElementById('decision')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        />
      </div>

      <div className="dash">
        <div className="dash__main">
          <Card
            title="プロジェクトの状態"
            subtitle="進捗・工数消化・見込み差異から自動で判定。行をクリックでプロジェクトへ"
            action={
              <div className="card__actions">
                <button type="button" className="link-btn" onClick={openCreate}>
                  ＋ プロジェクトを追加
                </button>
                <Link to="/projects" className="link-btn">
                  すべて見る
                </Link>
              </div>
            }
            flush
          >
            <ProjectHealthTable />
          </Card>

          <Card
            title="稼働の見通し"
            subtitle="予定時間 ÷ 稼働可能時間（週40時間）。セルをクリックで内訳を表示"
            action={<Link to="/workload" className="link-btn">稼働状況を開く</Link>}
          >
            <WorkloadOutlook />
          </Card>
        </div>

        <div className="dash__side">
          <Card
            id="decision"
            title="要判断"
            subtitle="過負荷・時間超過・粗利・遅延・停止中・リスクから自動で抽出"
            action={decisions.length > 0 ? <span className="count-pill">{decisions.length}</span> : undefined}
          >
            <DecisionList />
          </Card>

          <Card title="最近の成果" subtitle="（ダミーデータ）">
            <RecentWins />
          </Card>
        </div>
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="デモデータを初期化しますか？"
          confirmLabel="初期化する"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            actions.resetDemo()
            setConfirmReset(false)
            toast('デモデータを初期化しました', 'info')
          }}
        >
          作業項目・作業時間の記録・残り・進捗・日付など、これまでの変更はすべて破棄され、今週を基準にしたサンプルデータへ戻ります。
        </ConfirmDialog>
      )}
    </div>
  )
}
