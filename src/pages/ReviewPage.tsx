import { ClipboardCheck, Funnel, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Card } from '../components/Card'
import { DecisionList } from '../components/DecisionList'
import { KpiCard } from '../components/KpiCard'
import { PageHeader } from '../components/PageHeader'
import { GrowthFeed, RecentWins } from '../components/RecentWins'
import { WorkloadOutlook } from '../components/WorkloadOutlook'
import { HealthBadge } from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import { addDays, daysBetween, fmtDateTime, fmtMD, parseDate, toISO, weekStartOf } from '../domain/dates'
import { fmtNum, fmtSignedH } from '../domain/format'
import { fmtManMonths, oppHours } from '../domain/pipeline'
import { OPP_STAGES, OPP_STAGE_LABEL, SEVERITY_LABEL } from '../domain/types'
import { useApp } from '../store/AppContext'
import { cx } from '../components/cx'

/** 週次レビュー: 報告会ではなく「意思決定」のための画面（別の資料は作らない） */
export function ReviewPage() {
  const { data, derived, actions, can, today } = useApp()
  const { toast } = useToast()
  const [text, setText] = useState('')
  const weekStart = toISO(weekStartOf(today))
  const week = derived.weeks[0]
  const live = derived.summaries.filter((s) => s.project.status === 'active' || s.project.status === 'planned' || s.project.status === 'on_hold')
  const sevenDaysAgo = toISO(addDays(today, -7))

  const moves = useMemo(
    () =>
      data.activity
        .filter((l) => l.entityType === 'opportunity' && ['move', 'convert', 'create'].includes(l.action) && l.timestamp.slice(0, 10) >= sevenDaysAgo)
        .slice()
        .reverse(),
    [data.activity, sevenDaysAgo],
  )

  const stageCount = OPP_STAGES.map((st) => {
    const list = data.opportunities.filter((o) => o.stage === st)
    return { st, n: list.length, hours: list.reduce((s, o) => s + (oppHours(o) * o.probability) / 100, 0) }
  })
  const converted = data.opportunities.filter((o) => o.stage === 'converted').length
  const totals = live.reduce(
    (a, s) => ({
      plan: a.plan + s.totals.plan,
      act: a.act + s.totals.act,
      etc: a.etc + s.totals.etc,
      eac: a.eac + s.totals.eac,
    }),
    { plan: 0, act: 0, etc: 0, eac: 0 },
  )

  const blocked = derived.leaves.filter((l) => l.status === 'blocked' && derived.projectById.get(l.projectId)?.status !== 'completed')
  const risks = data.risks.filter((r) => r.status !== 'closed' && r.severity !== 'low' && derived.projectById.get(r.projectId)?.status !== 'completed')

  const notes = data.reviewNotes.filter((n) => n.weekStart === weekStart).slice().reverse()
  const pastNotes = data.reviewNotes.filter((n) => n.weekStart !== weekStart).slice().reverse()

  const addNote = () => {
    if (!text.trim()) return
    actions.addReviewNote(weekStart, text.trim())
    setText('')
    toast('決定メモを保存しました')
  }

  return (
    <div className="page">
      <PageHeader
        title="週次レビュー"
        sub={`${week.range} の週 · 判断が必要なことを上に、確認ごとを下に並べています。別の資料は作らず、この画面を見ながら決めます`}
      />

      <div className="kpi-grid">
        <KpiCard label="要判断" icon={ClipboardCheck} value={derived.decisions.length} unit="件" tone={derived.decisions.length > 0 ? 'attention' : 'good'} sub={`うち重要 ${derived.decisions.filter((d) => d.tone === 'critical').length}件`} />
        <KpiCard label="進行中のプロジェクト" value={live.filter((s) => s.project.status === 'active').length} unit="件" sub={`危険 ${live.filter((s) => s.health.health === 'RISK').length} · 注意 ${live.filter((s) => s.health.health === 'WATCH').length}`} to="/projects" />
        <KpiCard label="受注見込み（確度加重）" icon={Funnel} value={fmtManMonths(stageCount.reduce((s, c) => s + c.hours, 0))} sub={`${data.opportunities.filter((o) => o.stage !== 'converted' && o.stage !== 'lost').length}件を検討中`} to="/pipeline" />
        <KpiCard label="過負荷の人数" value={derived.overloadUsers.length} unit="人" tone={derived.overloadUsers.length > 0 ? 'critical' : 'good'} sub="4週間で100%超の週がある人" to="/workload" />
      </div>

      <div className="dash">
        <div className="dash__main">
          <Card title="判断が必要なこと" subtitle="PJ化・人員不足・時間超過・納期・リスクから自動で抽出。クリックで該当画面へ" action={<span className="count-pill">{derived.decisions.length}</span>}>
            <DecisionList />
          </Card>

          <Card title="受注見込みの動き" subtitle="相談 → 探索 → PJ候補 → 評価中 → PJ化待ち → PJ化。直近7日の変化" action={<Link className="link-btn" to="/pipeline">受注見込みを開く</Link>}>
            <div className="flow" aria-label="段階ごとの件数">
              {stageCount.map((c) => (
                <div key={c.st} className="flow__stage">
                  <span>{OPP_STAGE_LABEL[c.st]}</span>
                  <b>{c.n}</b>
                  <small>{fmtManMonths(c.hours)}</small>
                </div>
              ))}
              <div className="flow__stage flow__stage--done">
                <span>PJ化済み</span>
                <b>{converted}</b>
                <small>累計</small>
              </div>
            </div>
            {moves.length === 0 ? (
              <p className="hint">直近7日の動きはありません。</p>
            ) : (
              <ul className="log">
                {moves.map((m) => (
                  <li key={m.id}>
                    <Funnel size={13} />
                    <span className="log__time">{fmtDateTime(m.timestamp)}</span>
                    <span className="log__who">{derived.userById.get(m.userId)?.name}</span>
                    <span className="log__text">{m.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="プロジェクトの状態と工数" subtitle="計画・実績・残り・見込み・差異を並べて確認" flush>
            <div className="rv" role="table" aria-label="プロジェクトの工数">
              <div className="rv__row rv__row--head" role="row">
                <div>プロジェクト</div>
                <div>状態</div>
                <div className="num">計画</div>
                <div className="num">実績</div>
                <div className="num">残り</div>
                <div className="num">見込み</div>
                <div className="num">差異</div>
              </div>
              {live.map((s) => (
                <Link key={s.project.id} to={`/projects/${s.project.id}/dashboard`} className="rv__row" role="row">
                  <div className="rv__name">
                    <strong>{s.project.name}</strong>
                    <span>{s.health.reasons.join(' · ') || '大きな懸念なし'}</span>
                  </div>
                  <div>
                    <HealthBadge health={s.health.health} size="sm" />
                  </div>
                  <div className="num">{fmtNum(s.totals.plan)}h</div>
                  <div className="num">{fmtNum(s.totals.act)}h</div>
                  <div className="num">{fmtNum(s.totals.etc)}h</div>
                  <div className="num num--strong">{fmtNum(s.totals.eac)}h</div>
                  <div className={cx('num', s.totals.variance > 0.05 && 'pf__over')}>{fmtSignedH(s.totals.variance)}</div>
                </Link>
              ))}
              <div className="rv__row rv__row--total">
                <div className="rv__name">
                  <strong>合計</strong>
                </div>
                <div />
                <div className="num">{fmtNum(totals.plan)}h</div>
                <div className="num">{fmtNum(totals.act)}h</div>
                <div className="num">{fmtNum(totals.etc)}h</div>
                <div className="num num--strong">{fmtNum(totals.eac)}h</div>
                <div className={cx('num', totals.eac - totals.plan > 0.05 && 'pf__over')}>{fmtSignedH(totals.eac - totals.plan)}</div>
              </div>
            </div>
          </Card>

          <Card title="稼働の見通し（今週〜+3週）" subtitle="見込み込みにすると、受注見込みの案件も含めた将来の負荷が見えます" action={<Link className="link-btn" to="/workload">稼働状況を開く</Link>}>
            <WorkloadOutlook />
          </Card>
        </div>

        <div className="dash__side">
          <Card title="決定メモ" subtitle={`今週（${week.range}）に決めたこと。この画面に残るので、別の議事録は不要です`}>
            {can('review.edit') ? (
              <div className="cform">
                <textarea className="input input--area" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="例: C社 SCADA は人員を1名追加する方向で調整 / E社 保全DX は来週PJ化を判断" aria-label="決定メモ" />
                <button type="button" className="btn btn--primary btn--sm" onClick={addNote} disabled={!text.trim()}>
                  メモを保存
                </button>
              </div>
            ) : (
              <p className="hint">決定メモの記入はリーダー以上が行えます。</p>
            )}
            {notes.length === 0 ? (
              <p className="hint">今週の決定メモはまだありません。</p>
            ) : (
              <ul className="rnotes">
                {notes.map((n) => (
                  <li key={n.id}>
                    <Avatar user={derived.userById.get(n.authorId)} size="sm" />
                    <div>
                      <p>{n.text}</p>
                      <small>
                        {derived.userById.get(n.authorId)?.name} · {fmtDateTime(n.createdAt)}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {pastNotes.length > 0 && (
              <details className="rnotes__past">
                <summary>過去の決定メモ（{pastNotes.length}件）</summary>
                <ul className="rnotes">
                  {pastNotes.map((n) => (
                    <li key={n.id}>
                      <Avatar user={derived.userById.get(n.authorId)} size="sm" />
                      <div>
                        <p>{n.text}</p>
                        <small>
                          {fmtMD(n.weekStart)} の週 · {derived.userById.get(n.authorId)?.name}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          <Card title="停止中・リスク" subtitle="進行を妨げているもの" action={<ShieldAlert size={16} />}>
            {blocked.length === 0 && risks.length === 0 ? (
              <div className="empty">停止中の作業・未解決のリスクはありません</div>
            ) : (
              <ul className="rb">
                {blocked.map((b) => (
                  <li key={b.id}>
                    <Link to={`/projects/${b.projectId}/wbs?task=${b.id}`}>
                      <span className="chip chip--warn">停止中</span>
                      <span className="rb__text">
                        <strong>{b.title}</strong>
                        <small>
                          {derived.summaryById.get(b.projectId)?.shortName} · {daysBetween(b.statusChangedAt, derived.todayISO)}日間
                          {b.ownerId ? ` · ${derived.userById.get(b.ownerId)?.name}` : ''}
                        </small>
                      </span>
                    </Link>
                  </li>
                ))}
                {risks.map((r) => (
                  <li key={r.id}>
                    <Link to={`/projects/${r.projectId}/risks`}>
                      <span className={cx('sev', `sev--${r.severity}`)}>{SEVERITY_LABEL[r.severity]}</span>
                      <span className="rb__text">
                        <strong>{r.title}</strong>
                        <small>{derived.summaryById.get(r.projectId)?.shortName} · {r.kind === 'risk' ? 'リスク' : '課題'}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="最近の成果" subtitle="達成したマイルストーン・プロジェクト化・完了">
            <RecentWins />
          </Card>

          <Card title="成長" subtitle="新しい経験・スキルの変化">
            <GrowthFeed />
          </Card>
        </div>
      </div>
      <p className="hint">{`基準日 ${parseDate(derived.todayISO).getMonth() + 1}/${parseDate(derived.todayISO).getDate()}。この画面の数値はすべて最新の入力から自動で集計されます。`}</p>
    </div>
  )
}
