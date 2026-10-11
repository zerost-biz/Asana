import { Download, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { Card } from '../components/Card'
import { CommitField } from '../components/CommitField'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PageHeader } from '../components/PageHeader'
import { useToast } from '../components/Toast'
import { cx } from '../components/cx'
import { fmtDateTime } from '../domain/dates'
import { DEFAULT_SETTINGS, ROLE_LABEL, type EntityType, type Role, type Settings } from '../domain/types'
import { saveTextFile } from '../platform/saveFile'
import { STORAGE_KEY } from '../repository'
import { useApp } from '../store/AppContext'

type Tab = 'members' | 'skills' | 'master' | 'settings' | 'audit' | 'data'
const TABS: { key: Tab; label: string }[] = [
  { key: 'members', label: 'メンバー' },
  { key: 'skills', label: 'スキル' },
  { key: 'master', label: '顧客・役割' },
  { key: 'settings', label: '設定' },
  { key: 'audit', label: '更新履歴' },
  { key: 'data', label: 'データ' },
]

const ENTITY_LABEL: Record<EntityType, string> = {
  wbs: '作業',
  project: 'プロジェクト',
  time_entry: '作業時間',
  opportunity: '受注見込み',
  assignment: '配置',
  risk: 'リスク',
  user: 'メンバー',
  user_skill: 'スキル',
  experience: '経験',
  close: '完了',
  setting: '設定',
  capacity: '稼働',
  order: '社内オーダー',
}

/** 管理: メンバー・単価・スキル・顧客・役割・設定・更新履歴（管理者のみ） */
export function AdminPage() {
  const { can, denyAdmin } = useAdminGuard()
  const [tab, setTab] = useState<Tab>('members')
  if (!can) {
    return (
      <div className="page">
        <PageHeader title="管理" />
        <div className="empty empty--big">{denyAdmin}</div>
      </div>
    )
  }
  return (
    <div className="page">
      <PageHeader title="管理" sub="メンバー・単価・スキル・顧客・役割・設定・更新履歴。管理者のみ利用できます" />
      <div className="tabs tabs--page" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={cx('tabs__tab', tab === t.key && 'is-active')} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'members' && <MembersTab />}
      {tab === 'skills' && <SkillsTab />}
      {tab === 'master' && <MasterTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'data' && <DataTab />}
    </div>
  )
}

function useAdminGuard() {
  const { can } = useApp()
  return { can: can('admin.access'), denyAdmin: '管理は管理者のみ利用できます。右上のユーザー切替で管理者（Kさん）を選んでください。' }
}

/* ---------------- メンバー ---------------- */
function MembersTab() {
  const { data, actions } = useApp()
  const { toast } = useToast()
  const [draft, setDraft] = useState({ name: '', role: 'member' as Role, jobTitle: '', rate: '6000' })

  const add = () => {
    if (!draft.name.trim()) return
    const name = draft.name.trim()
    actions.addUser({
      name,
      initials: name.slice(0, 1),
      email: '',
      role: draft.role,
      team: 'デリバリー',
      jobTitle: draft.jobTitle.trim(),
      weeklyCapacity: data.settings.baseCapacity,
      hourlyRate: Number(draft.rate) || 0,
      status: 'active',
      strengths: [],
    })
    toast(`${name} を追加しました`)
    setDraft({ name: '', role: 'member', jobTitle: '', rate: '6000' })
  }

  return (
    <>
      <Card title="メンバー" subtitle="権限・稼働・単価（人件費の計算に使う円/時間）。1人日 = 8時間として人日単価に換算できます" flush>
        <div className="admtable" role="table">
          <div className="admtable__row admtable__row--head members-cols" role="row">
            <span>名前</span>
            <span>権限</span>
            <span>役職・役割</span>
            <span>標準稼働 h/週</span>
            <span>単価 円/h</span>
            <span>人日単価</span>
            <span>状態</span>
          </div>
          {data.users.map((u) => (
            <div key={u.id} className="admtable__row members-cols" role="row">
              <span className="admtable__name">
                <Avatar user={u} size="sm" />
                <CommitField value={u.name} onCommit={(v) => v.trim() && actions.updateUser(u.id, { name: v.trim(), initials: v.trim().slice(0, 1) })} aria-label="名前" className="input input--sm" />
              </span>
              <select className="input input--sm" value={u.role} onChange={(e) => actions.updateUser(u.id, { role: e.target.value as Role })} aria-label={`${u.name}の権限`}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <CommitField value={u.jobTitle} onCommit={(v) => actions.updateUser(u.id, { jobTitle: v })} aria-label="役職" className="input input--sm" />
              <CommitField type="number" value={u.weeklyCapacity} min={0} max={80} onCommit={(v) => Number(v) >= 0 && actions.updateUser(u.id, { weeklyCapacity: Number(v) })} aria-label="標準稼働" className="input input--sm input--num" />
              <CommitField type="number" value={u.hourlyRate} min={0} step={500} onCommit={(v) => Number(v) >= 0 && actions.updateUser(u.id, { hourlyRate: Number(v) })} aria-label="単価" className="input input--sm input--num" />
              <span className="admtable__calc">{Math.round(u.hourlyRate * 8).toLocaleString('ja-JP')}円</span>
              <select className="input input--sm" value={u.status} onChange={(e) => actions.updateUser(u.id, { status: e.target.value as 'active' | 'inactive' })} aria-label={`${u.name}の状態`}>
                <option value="active">在籍</option>
                <option value="inactive">停止</option>
              </select>
            </div>
          ))}
        </div>
      </Card>
      <Card title="メンバーを追加">
        <div className="admform">
          <label className="field">
            <span className="field__label">名前</span>
            <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例: Tさん" />
          </label>
          <label className="field">
            <span className="field__label">権限</span>
            <select className="input" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">役職・役割</span>
            <input className="input" value={draft.jobTitle} onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">単価（円/h）</span>
            <input type="number" min={0} step={500} className="input input--num" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} />
          </label>
          <button type="button" className="btn btn--primary" onClick={add} disabled={!draft.name.trim()}>
            <Plus size={15} /> 追加
          </button>
        </div>
      </Card>
    </>
  )
}

/* ---------------- スキル ---------------- */
function SkillsTab() {
  const { data, actions } = useApp()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const target = data.skills.find((s) => s.id === deleting)
  return (
    <>
      <Card title="スキルのマスタ" subtitle="スキルマップの行になります。「目標人数」はレベル3以上（自走）で確保したい人数です" flush>
        <div className="admtable" role="table">
          <div className="admtable__row admtable__row--head skills-cols" role="row">
            <span>スキル名</span>
            <span>分類</span>
            <span>説明</span>
            <span>目標人数（Lv3以上）</span>
            <span />
          </div>
          {data.skills.map((s) => (
            <div key={s.id} className="admtable__row skills-cols" role="row">
              <CommitField value={s.name} onCommit={(v) => v.trim() && actions.upsertSkill({ ...s, name: v.trim() })} aria-label="スキル名" className="input input--sm" />
              <CommitField value={s.category} onCommit={(v) => actions.upsertSkill({ ...s, category: v })} aria-label="分類" className="input input--sm" />
              <CommitField value={s.description} onCommit={(v) => actions.upsertSkill({ ...s, description: v })} aria-label="説明" className="input input--sm" />
              <CommitField type="number" value={s.targetLv3Count} min={0} onCommit={(v) => Number(v) >= 0 && actions.upsertSkill({ ...s, targetLv3Count: Number(v) })} aria-label="目標人数" className="input input--sm input--num" />
              <button type="button" className="icon-btn icon-btn--sm" aria-label={`${s.name}を削除`} onClick={() => setDeleting(s.id)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </Card>
      <Card title="スキルを追加">
        <div className="admform admform--inline">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: データ分析" aria-label="スキル名" />
          <button
            type="button"
            className="btn btn--primary"
            disabled={!name.trim()}
            onClick={() => {
              actions.upsertSkill({ name: name.trim(), category: '', description: '', targetLv3Count: 2 })
              toast(`スキル「${name.trim()}」を追加しました`)
              setName('')
            }}
          >
            <Plus size={15} /> 追加
          </button>
        </div>
      </Card>
      {deleting && target && (
        <ConfirmDialog title={`スキル「${target.name}」を削除しますか？`} confirmLabel="削除する" onCancel={() => setDeleting(null)} onConfirm={() => (actions.deleteSkill(target.id), setDeleting(null), toast('スキルを削除しました', 'info'))}>
          全メンバーのこのスキルのレベル、および案件の必要スキルからも外れます。
        </ConfirmDialog>
      )}
    </>
  )
}

/* ---------------- 顧客・役割 ---------------- */
function MasterTab() {
  const { data, actions } = useApp()
  const [cname, setCname] = useState('')
  const [role, setRole] = useState('')
  const roles = data.settings.roles
  return (
    <>
      <Card title="顧客" subtitle="業界は、メンバーの「業界・顧客の経験」や適合度（継続性）の計算に使います" flush>
        <div className="admtable" role="table">
          <div className="admtable__row admtable__row--head cust-cols" role="row">
            <span>顧客名</span>
            <span>業界</span>
          </div>
          {data.customers.map((c) => (
            <div key={c.id} className="admtable__row cust-cols" role="row">
              <CommitField value={c.name} onCommit={(v) => v.trim() && actions.upsertCustomer({ ...c, name: v.trim() })} aria-label="顧客名" className="input input--sm" />
              <CommitField value={c.industry} onCommit={(v) => actions.upsertCustomer({ ...c, industry: v })} aria-label="業界" className="input input--sm" />
            </div>
          ))}
        </div>
        <div className="admform admform--inline admform--pad">
          <input className="input" value={cname} onChange={(e) => setCname(e.target.value)} placeholder="新しい顧客名" aria-label="新しい顧客名" />
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!cname.trim()}
            onClick={() => {
              actions.upsertCustomer({ name: cname.trim(), industry: '' })
              setCname('')
            }}
          >
            <Plus size={15} /> 顧客を追加
          </button>
        </div>
      </Card>
      <Card title="役割のマスタ" subtitle="配置・必要な役割・経験で使う役割の名前です">
        <div className="chipset">
          {roles.map((r) => (
            <span key={r} className="chip chip--role">
              {r}
              <button type="button" aria-label={`${r}を削除`} onClick={() => roles.length > 1 && actions.updateSettings({ roles: roles.filter((x) => x !== r) })}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="admform admform--inline admform--pad">
          <input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="新しい役割（例: データアナリスト）" aria-label="新しい役割" />
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!role.trim() || roles.includes(role.trim())}
            onClick={() => {
              actions.updateSettings({ roles: [...roles, role.trim()] })
              setRole('')
            }}
          >
            <Plus size={15} /> 追加
          </button>
        </div>
      </Card>
    </>
  )
}

/* ---------------- 設定 ---------------- */
function SettingsTab() {
  const { data, actions } = useApp()
  const s = data.settings
  const set = (p: Partial<Settings>) => actions.updateSettings(p)
  const pct = (v: number) => Math.round(v * 100)
  const w = s.matchWeights
  const wsum = w.skill + w.capacity + w.experience + w.growth + w.continuity
  const setW = (k: keyof typeof w, v: number) => set({ matchWeights: { ...w, [k]: v / 100 } })
  return (
    <>
      <Card title="工数入力・集計" subtitle="入力の刻みや、親行の進捗の計算方法">
        <div className="admform admform--grid">
          <label className="field">
            <span className="field__label">工数入力の刻み</span>
            <select className="input" value={s.hoursStep} onChange={(e) => set({ hoursStep: Number(e.target.value) as 0.25 | 0.5 })}>
              <option value={0.25}>0.25時間（15分）</option>
              <option value={0.5}>0.5時間（30分）</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">親行の進捗の重み付け</span>
            <select className="input" value={s.parentProgressWeight} onChange={(e) => set({ parentProgressWeight: e.target.value as 'plan' | 'eac' })}>
              <option value="plan">計画時間で加重（標準）</option>
              <option value="eac">見込み時間で加重</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">標準の週稼働（時間）</span>
            <CommitField type="number" className="input input--num" value={s.baseCapacity} min={1} onCommit={(v) => Number(v) > 0 && set({ baseCapacity: Number(v) })} />
          </label>
        </div>
      </Card>

      <Card title="状態・通知のしきい値" subtitle="これを超えると、プロジェクトの状態や通知が変わります">
        <div className="admform admform--grid">
          <label className="field">
            <span className="field__label">「危険」: 見込みが計画をこの割合以上超える（%）</span>
            <CommitField type="number" className="input input--num" value={pct(s.riskVarianceRatio)} min={0} onCommit={(v) => Number(v) >= 0 && set({ riskVarianceRatio: Number(v) / 100 })} />
          </label>
          <label className="field">
            <span className="field__label">「注意」: 見込みが計画をこの割合以上超える（%）</span>
            <CommitField type="number" className="input input--num" value={pct(s.watchVarianceRatio)} min={0} onCommit={(v) => Number(v) >= 0 && set({ watchVarianceRatio: Number(v) / 100 })} />
          </label>
          <label className="field">
            <span className="field__label">粗利率の目安（%）。下回ると通知</span>
            <CommitField type="number" className="input input--num" value={pct(s.marginTarget)} onCommit={(v) => Number.isFinite(Number(v)) && set({ marginTarget: Number(v) / 100 })} />
          </label>
          <label className="field">
            <span className="field__label">負荷「注意」の下限（%）</span>
            <CommitField type="number" className="input input--num" value={pct(s.loadCaution)} min={0} onCommit={(v) => Number(v) >= 0 && set({ loadCaution: Number(v) / 100 })} />
          </label>
          <label className="field">
            <span className="field__label">負荷「過負荷」の上限（%）</span>
            <CommitField type="number" className="input input--num" value={pct(s.loadWarn)} min={0} onCommit={(v) => Number(v) >= 0 && set({ loadWarn: Number(v) / 100 })} />
          </label>
          <label className="field">
            <span className="field__label">残りが未更新で通知する日数</span>
            <CommitField type="number" className="input input--num" value={s.etcStaleDays} min={1} onCommit={(v) => Number(v) >= 1 && set({ etcStaleDays: Number(v) })} />
          </label>
          <label className="field">
            <span className="field__label">停止中が続いて通知する日数</span>
            <CommitField type="number" className="input input--num" value={s.blockedAlertDays} min={0} onCommit={(v) => Number(v) >= 0 && set({ blockedAlertDays: Number(v) })} />
          </label>
          <label className="field">
            <span className="field__label">期限の何日前から通知するか</span>
            <CommitField type="number" className="input input--num" value={s.deadlineSoonDays} min={0} onCommit={(v) => Number(v) >= 0 && set({ deadlineSoonDays: Number(v) })} />
          </label>
        </div>
      </Card>

      <Card title="配置の適合度の重み" subtitle={`合計 ${Math.round(wsum * 100)}%（100%でなくても、比率で計算します）。標準は スキル40・空き30・経験15・育成10・継続性5`}>
        <div className="wsliders">
          {(
            [
              ['skill', 'スキル適合'],
              ['capacity', '空き適合'],
              ['experience', '経験適合'],
              ['growth', '育成適合'],
              ['continuity', '継続性'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="wslider">
              <span>{label}</span>
              <input type="range" min={0} max={100} step={5} value={pct(w[k])} onChange={(e) => setW(k, Number(e.target.value))} aria-label={`${label}の重み`} />
              <b>{pct(w[k])}%</b>
            </label>
          ))}
        </div>
        <button type="button" className="link-btn" onClick={() => set({ matchWeights: { ...DEFAULT_SETTINGS.matchWeights } })}>
          標準に戻す
        </button>
      </Card>
    </>
  )
}

/* ---------------- 更新履歴 ---------------- */
function AuditTab() {
  const { data, derived } = useApp()
  const [type, setType] = useState<'all' | EntityType>('all')
  const [limit, setLimit] = useState(50)
  const list = useMemo(() => data.activity.filter((l) => type === 'all' || l.entityType === type).slice().reverse(), [data.activity, type])
  return (
    <Card
      title="更新履歴（監査ログ）"
      subtitle={`誰が・いつ・何を変えたか（直近${data.activity.length}件を保持）`}
      action={
        <select className="input input--sm" value={type} onChange={(e) => setType(e.target.value as 'all' | EntityType)} aria-label="種類で絞り込み">
          <option value="all">すべて</option>
          {(Object.keys(ENTITY_LABEL) as EntityType[]).map((t) => (
            <option key={t} value={t}>
              {ENTITY_LABEL[t]}
            </option>
          ))}
        </select>
      }
      flush
    >
      <div className="admtable" role="table">
        <div className="admtable__row admtable__row--head audit-cols" role="row">
          <span>日時</span>
          <span>変更した人</span>
          <span>種類</span>
          <span>内容</span>
        </div>
        {list.slice(0, limit).map((l) => (
          <div key={l.id} className="admtable__row audit-cols" role="row">
            <span className="admtable__calc">{fmtDateTime(l.timestamp)}</span>
            <span>{derived.userById.get(l.userId)?.name ?? l.userId}</span>
            <span className="chip">{ENTITY_LABEL[l.entityType]}</span>
            <span>{l.summary}</span>
          </div>
        ))}
        {list.length === 0 && <div className="empty">履歴はありません</div>}
      </div>
      {list.length > limit && (
        <div className="admform--pad">
          <button type="button" className="link-btn" onClick={() => setLimit((n) => n + 50)}>
            さらに表示（残り {list.length - limit} 件）
          </button>
        </div>
      )}
    </Card>
  )
}

/* ---------------- データ ---------------- */

function DataTab() {
  const { data, actions } = useApp()
  const { toast } = useToast()
  const [confirm, setConfirm] = useState(false)
  const exportJson = async () => {
    const r = await saveTextFile(`project-delivery-os-${data.seededOn}.json`, JSON.stringify(data, null, 2), 'application/json')
    if (r === 'saved') toast('データをJSONで書き出しました')
    else if (r === 'failed') toast('この表示環境では書き出しできません', 'info')
  }
  const counts: [string, number][] = [
    ['プロジェクト', data.projects.length],
    ['作業項目', data.wbs.length],
    ['作業時間の記録', data.timeEntries.length],
    ['社内オーダー', data.internalOrders.length],
    ['受注見込み', data.opportunities.length],
    ['配置', data.assignments.length],
    ['リスク・課題', data.risks.length],
    ['メンバー', data.users.length],
    ['経験', data.experiences.length],
    ['更新履歴', data.activity.length],
  ]
  return (
    <>
      <Card title="保存されているデータ" subtitle={`ブラウザの localStorage（キー: ${STORAGE_KEY}）に自動保存されています。本番ではスプレッドシート等に置き換わります`}>
        <dl className="ov__dl">
          {counts.map(([k, n]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{n}件</dd>
            </div>
          ))}
        </dl>
        <div className="decide" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn--ghost" onClick={exportJson}>
            <Download size={15} /> JSONで書き出す
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirm(true)}>
            <RotateCcw size={15} /> デモデータに初期化
          </button>
        </div>
      </Card>
      {confirm && (
        <ConfirmDialog
          title="デモデータを初期化しますか？"
          confirmLabel="初期化する"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            actions.resetDemo()
            setConfirm(false)
            toast('デモデータを初期化しました', 'info')
          }}
        >
          これまでの入力・変更はすべて破棄され、今週を基準にしたサンプルデータへ戻ります。
        </ConfirmDialog>
      )}
    </>
  )
}
