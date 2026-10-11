import type { AppData, ProjectStatus, Risk, TimeEntry, User, WbsItem, WbsStatus } from '../domain/types'
import { addDays, parseDate, toISO, weekStartOf, workdaysBetween } from '../domain/dates'

/**
 * 初期ダミーデータ。
 * 日付は「今週の月曜(M)」からの日数オフセットで定義し、起動した週に合わせて生成する。
 * （常に 今週〜+3週 に負荷が乗り、遅延・Blocked が見えるようにするため）
 *
 * 週末に開いても Health が変わらないよう、「遅延」にしたいタスク以外は終了日を来週以降にしている。
 *
 * 想定している見え方（今週月曜起点）:
 *   Workload  K 93/118/123/85%  H 83/95/75/75%  U 60/62/94/69%  S 73/87/112/71%
 *   B社 MES構想 : WATCH（EAC超過・WBSあり・主サンプル）
 *   A社 SaaS導入: GOOD （進捗が工数消化より先行）
 *   C社 SCADA: RISK （遅延・EAC超過・Blocked）
 *   新商材GTM    : GOOD （小規模・社内PJなので受注額なし）
 *
 * 人件費は 工数 × 単価（K 8,000 / H 7,000 / U 6,000 / S 5,000 円/h）。受注額に対する粗利率の目安:
 *   B社 約14% / A社 約32% / C社 約4%（薄利）
 */

export const USERS: User[] = [
  { id: 'u-k', name: 'Kさん', initials: 'K', weeklyCapacity: 40, hourlyRate: 8000 },
  { id: 'u-h', name: 'Hさん', initials: 'H', weeklyCapacity: 40, hourlyRate: 7000 },
  { id: 'u-u', name: 'Uさん', initials: 'U', weeklyCapacity: 40, hourlyRate: 6000 },
  { id: 'u-s', name: 'Sさん', initials: 'S', weeklyCapacity: 40, hourlyRate: 5000 },
]

const K = 'u-k'
const H = 'u-h'
const U = 'u-u'
const S = 'u-s'

interface LeafDef {
  title: string
  owner: string
  /** 今週月曜からの日数 */
  s: number
  e: number
  plan: number
  act: number
  etc: number
  prog: number
  status: WbsStatus
  comment?: string
}
interface PhaseDef {
  title: string
  tasks: LeafDef[]
}
interface ProjectDef {
  id: string
  name: string
  /** 受注額・予算（円）。社内PJは未設定 */
  budget?: number
  status: ProjectStatus
  s: number
  e: number
  phases: PhaseDef[]
}

const DONE: WbsStatus = 'Done'
const WIP: WbsStatus = 'In progress'
const TODO: WbsStatus = 'Not started'
const BLOCKED: WbsStatus = 'Blocked'

const PROJECTS: ProjectDef[] = [
  {
    id: 'bmes',
    name: 'B社 MES構想',
    budget: 2400000,
    status: 'active',
    s: -14,
    e: 39,
    phases: [
      {
        title: '現状分析',
        tasks: [
          { title: 'ヒアリング', owner: H, s: -14, e: -10, plan: 20, act: 20, etc: 0, prog: 100, status: DONE },
          { title: '現場調査', owner: K, s: -12, e: -4, plan: 24, act: 28, etc: 0, prog: 100, status: DONE, comment: '工場見学が想定より長引いた（+4h）' },
          { title: 'As-Is整理', owner: H, s: -5, e: 9, plan: 36, act: 24, etc: 16, prog: 70, status: WIP, comment: '現場調査の追加メモを反映中。主サンプル（PLAN36 / ACT24 / ETC16 → EAC40）' },
        ],
      },
      {
        title: 'To-Be設計',
        tasks: [
          { title: '課題整理', owner: H, s: -3, e: 7, plan: 20, act: 12, etc: 8, prog: 60, status: WIP },
          { title: 'MES構想', owner: K, s: -3, e: 18, plan: 60, act: 20, etc: 48, prog: 30, status: WIP, comment: '構想の論点が増えており、ETCを上方修正済み' },
          { title: 'システム構成', owner: U, s: -3, e: 21, plan: 60, act: 10, etc: 40, prog: 20, status: WIP },
          { title: 'データ連携設計', owner: H, s: 7, e: 18, plan: 18, act: 0, etc: 32, prog: 0, status: TODO },
        ],
      },
      {
        title: 'ロードマップ策定',
        tasks: [
          { title: 'ロードマップ案作成', owner: K, s: 21, e: 25, plan: 12, act: 0, etc: 12, prog: 0, status: TODO },
          { title: '概算見積・経営報告', owner: H, s: 21, e: 31, plan: 16, act: 0, etc: 18, prog: 0, status: TODO },
        ],
      },
    ],
  },
  {
    id: 'asaas',
    name: 'A社 SaaS導入',
    budget: 1800000,
    status: 'active',
    s: -28,
    e: 25,
    phases: [
      {
        title: '導入準備',
        tasks: [
          { title: '要件整理', owner: S, s: -28, e: -17, plan: 16, act: 14, etc: 0, prog: 100, status: DONE },
          { title: 'アカウント設計', owner: U, s: -21, e: -10, plan: 12, act: 10, etc: 0, prog: 100, status: DONE },
        ],
      },
      {
        title: '環境構築',
        tasks: [
          { title: 'テナント設定', owner: S, s: -14, e: 7, plan: 40, act: 22, etc: 14, prog: 70, status: WIP },
          { title: 'データ移行', owner: U, s: 7, e: 25, plan: 32, act: 0, etc: 30, prog: 0, status: TODO },
          { title: 'SSO連携', owner: K, s: 0, e: 11, plan: 20, act: 4, etc: 18, prog: 20, status: WIP },
          { title: '受入テスト', owner: S, s: 7, e: 18, plan: 30, act: 0, etc: 30, prog: 0, status: TODO },
        ],
      },
      {
        title: '展開',
        tasks: [
          { title: '運用設計', owner: H, s: 0, e: 18, plan: 44, act: 6, etc: 42, prog: 15, status: WIP },
          { title: 'ユーザー研修', owner: S, s: 21, e: 25, plan: 16, act: 0, etc: 16, prog: 0, status: TODO },
        ],
      },
    ],
  },
  {
    id: 'cscada',
    name: 'C社 SCADA',
    budget: 2000000,
    status: 'active',
    s: -35,
    e: 28,
    phases: [
      {
        title: '現状調査',
        tasks: [
          { title: '設備台帳整理', owner: U, s: -35, e: -21, plan: 24, act: 30, etc: 0, prog: 100, status: DONE },
          { title: '保全業務ヒアリング', owner: S, s: -30, e: -17, plan: 20, act: 22, etc: 0, prog: 100, status: DONE },
        ],
      },
      {
        title: 'PoC構築',
        tasks: [
          { title: 'センサー選定', owner: K, s: -21, e: -4, plan: 30, act: 36, etc: 12, prog: 80, status: WIP, comment: '候補の再評価が発生し期限超過' },
          { title: 'データ収集基盤', owner: U, s: -14, e: 7, plan: 40, act: 28, etc: 14, prog: 45, status: BLOCKED, comment: 'センサー納品遅延のため停止中。納期回答待ち' },
          { title: '異常検知モデル', owner: S, s: -7, e: 18, plan: 48, act: 6, etc: 52, prog: 10, status: WIP },
        ],
      },
      {
        title: '現場検証',
        tasks: [
          { title: '現場実証', owner: K, s: 7, e: 25, plan: 56, act: 0, etc: 66, prog: 0, status: TODO },
          { title: '効果測定・報告', owner: H, s: 21, e: 28, plan: 24, act: 0, etc: 24, prog: 0, status: TODO },
        ],
      },
    ],
  },
  {
    id: 'gtm',
    name: '新商材GTM',
    status: 'active',
    s: -7,
    e: 25,
    phases: [
      {
        title: '市場調査',
        tasks: [
          { title: '競合・市場整理', owner: S, s: -7, e: -3, plan: 12, act: 12, etc: 0, prog: 100, status: DONE },
          { title: 'ターゲット仮説', owner: H, s: -5, e: 7, plan: 8, act: 5, etc: 3, prog: 70, status: WIP },
        ],
      },
      {
        title: '商品設計・ローンチ',
        tasks: [
          { title: 'パッケージ・価格案', owner: K, s: 14, e: 18, plan: 11, act: 0, etc: 11, prog: 0, status: TODO },
          { title: '営業資料作成', owner: U, s: 14, e: 25, plan: 30, act: 0, etc: 30, prog: 0, status: TODO },
          { title: 'LP・告知準備', owner: S, s: 14, e: 25, plan: 25, act: 0, etc: 25, prog: 0, status: TODO },
        ],
      },
    ],
  },
]

/** 工数入力コメントの例（ダミー） */
const ENTRY_COMMENTS = ['打合せ・内容整理', '資料作成', 'レビュー・修正対応', '', '調査・検討', '顧客確認対応']

/** act(h) を [start, min(end, today)] の稼働日へ 0.5h 刻みで均等に分けて TimeEntry 化する */
function spreadEntries(
  wbsId: string,
  userId: string,
  startISO: string,
  endISO: string,
  act: number,
  today: Date,
  seq: { n: number },
): TimeEntry[] {
  if (act <= 0) return []
  const start = parseDate(startISO)
  const endD = parseDate(endISO)
  const last = endD < today ? endD : today
  let days = workdaysBetween(start, last)
  if (days.length === 0) days = [today]
  const units = Math.round(act * 2) // 0.5h を1単位
  const n = Math.min(days.length, units)
  // 直近の n 日に配分（古い日に寄せると今週の入力が空になるため）
  days = days.slice(days.length - n)
  const q = Math.floor(units / n)
  const r = units % n
  const out: TimeEntry[] = []
  days.forEach((d, i) => {
    const u = q + (i < r ? 1 : 0)
    if (u <= 0) return
    out.push({
      id: `te-seed-${++seq.n}`,
      wbsId,
      userId,
      date: toISO(d),
      hours: u / 2,
      comment: ENTRY_COMMENTS[seq.n % ENTRY_COMMENTS.length],
    })
  })
  return out
}

export function createSeed(today: Date): AppData {
  const mon = weekStartOf(today)
  const at = (offset: number) => toISO(addDays(mon, offset))

  const wbs: WbsItem[] = []
  const timeEntries: TimeEntry[] = []
  const seq = { n: 0 }

  for (const p of PROJECTS) {
    p.phases.forEach((ph, pi) => {
      const phaseId = `${p.id}-${pi + 1}`
      const starts = ph.tasks.map((t) => t.s)
      const ends = ph.tasks.map((t) => t.e)
      wbs.push({
        id: phaseId,
        projectId: p.id,
        parentId: null,
        title: ph.title,
        ownerId: null,
        startDate: at(Math.min(...starts)),
        endDate: at(Math.max(...ends)),
        planHours: 0,
        etcHours: 0,
        progress: 0,
        status: 'In progress',
      })
      ph.tasks.forEach((t, ti) => {
        const id = `${phaseId}-${ti + 1}`
        const item: WbsItem = {
          id,
          projectId: p.id,
          parentId: phaseId,
          title: t.title,
          ownerId: t.owner,
          startDate: at(t.s),
          endDate: at(t.e),
          planHours: t.plan,
          etcHours: t.etc,
          progress: t.prog,
          status: t.status,
          comment: t.comment,
        }
        wbs.push(item)
        timeEntries.push(...spreadEntries(id, t.owner, item.startDate, item.endDate, t.act, today, seq))
      })
    })
  }

  const risks: Risk[] = [
    { id: 'r-b1', projectId: 'bmes', severity: 'medium', title: 'PJ化判断（本導入フェーズへ進めるか）', status: 'open' },
    { id: 'r-b2', projectId: 'bmes', wbsId: 'bmes-2-2', severity: 'low', title: '構想の論点増加によるMES構想の工数膨張', status: 'watching' },
    { id: 'r-c1', projectId: 'cscada', wbsId: 'cscada-2-2', severity: 'high', title: 'センサー納品遅延でPoC全体の日程に影響', status: 'open' },
    { id: 'r-c2', projectId: 'cscada', severity: 'medium', title: '現場担当者の確保（検証期間）', status: 'watching' },
    { id: 'r-a1', projectId: 'asaas', severity: 'low', title: '旧システムのデータ品質（欠損）', status: 'watching' },
  ]

  return {
    users: USERS.map((u) => ({ ...u })),
    projects: PROJECTS.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      startDate: at(p.s),
      endDate: at(p.e),
      health: null,
      budget: p.budget,
    })),
    wbs,
    timeEntries,
    risks,
    currentUserId: H,
    seededOn: toISO(today),
  }
}

/** Dashboard「Recent Wins」用ダミー（今日からの相対日数） */
export const RECENT_WINS: { title: string; note: string; daysAgo: number }[] = [
  { title: 'A社 PoC受注', note: 'SaaS導入のPoCから本契約へ。来週キックオフ', daysAgo: 1 },
  { title: 'MES構想ヒアリング完了', note: 'B社 現状分析フェーズのヒアリングを全件完了', daysAgo: 3 },
  { title: 'WBSテンプレート完成', note: '現状分析〜ロードマップの標準WBSを整備', daysAgo: 5 },
  { title: '新商材LP のワイヤー確定', note: 'GTM 営業資料の骨子も合意', daysAgo: 8 },
]
