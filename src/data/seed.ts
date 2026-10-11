import type {
  ActivityLog,
  AppData,
  Assignment,
  Capacity,
  Customer,
  Experience,
  GrowthFocus,
  Opportunity,
  OppStage,
  Priority,
  Project,
  ProjectClose,
  ProjectStatus,
  ReviewNote,
  Risk,
  RoleDemand,
  RoleNeed,
  Skill,
  TimeEntry,
  User,
  UserSkill,
  WbsItem,
  WbsStatus,
  WbsType,
} from '../domain/types'
import { DEFAULT_SETTINGS } from '../domain/types'
import { addDays, parseDate, toISO, weekStartOf, workdaysBetween } from '../domain/dates'

/**
 * 初期ダミーデータ。
 * 日付は「今週の月曜(M)」からの日数オフセットで定義し、起動した週に合わせて生成する。
 * （常に今週〜+3週に負荷が乗り、遅延・停止中が見えるようにするため）
 * 週末に開いても状態が変わらないよう、「遅延」にしたいタスク以外は終了日を来週以降にしている。
 *
 * 想定している見え方（今週月曜起点・確定分の負荷）:
 *   K 93/118/123/85%  H 83/95/94/75%  U 60/77/94/69%  S 73/87/112/89%
 *   B社 MES構想  : 注意（時間超過・WBSが3階層）… 主サンプル
 *   A社 SaaS導入 : 順調（進捗が工数消化より先行）
 *   C社 SCADA    : 危険（遅延・時間超過・停止中・粗利が薄い）
 *   新商材GTM    : 順調（社内PJ）
 *   A社 業務診断 : 完了済み（経験・完了記録のサンプル）
 */

const K = 'u-k'
const H = 'u-h'
const U = 'u-u'
const S = 'u-s'

export const USERS: User[] = [
  {
    id: K, name: 'Kさん', initials: 'K', email: 'k@example.com', role: 'admin', team: 'デリバリー',
    jobTitle: '課長 / シニアコンサルタント', weeklyCapacity: 40, hourlyRate: 8000, status: 'active',
    strengths: ['MES構想', '製造業務', '顧客折衝'],
  },
  {
    id: H, name: 'Hさん', initials: 'H', email: 'h@example.com', role: 'leader', team: 'デリバリー',
    jobTitle: 'コンサルタント', weeklyCapacity: 40, hourlyRate: 7000, status: 'active',
    strengths: ['製造業務', 'SCADA', '現場ヒアリング'],
  },
  {
    id: U, name: 'Uさん', initials: 'U', email: 'u@example.com', role: 'member', team: 'デリバリー',
    jobTitle: 'ITアーキテクト', weeklyCapacity: 40, hourlyRate: 6000, status: 'active',
    strengths: ['IT・セキュリティ', 'システム構成', 'データ連携'],
  },
  {
    id: S, name: 'Sさん', initials: 'S', email: 's@example.com', role: 'member', team: 'デリバリー',
    jobTitle: '企画・営業', weeklyCapacity: 40, hourlyRate: 5000, status: 'active',
    strengths: ['顧客折衝', '新商材の企画', 'SaaS導入'],
  },
]

export const SKILLS: Skill[] = [
  { id: 'sk-mes', name: 'MES', category: '製造DX', description: '製造実行システム（MES）の構想・要件整理', targetLv3Count: 3 },
  { id: 'sk-scada', name: 'SCADA', category: '制御・OT', description: '監視制御（SCADA）・設備データ収集', targetLv3Count: 3 },
  { id: 'sk-mfg', name: '製造業務', category: '業務知識', description: '製造現場の業務・工程の理解', targetLv3Count: 4 },
  { id: 'sk-consulting', name: 'コンサルティング', category: '進め方', description: '課題整理・構想策定・提案の進め方', targetLv3Count: 3 },
  { id: 'sk-customer', name: '顧客折衝', category: '対人', description: '顧客との合意形成・期待値調整', targetLv3Count: 4 },
  { id: 'sk-it', name: 'IT・セキュリティ', category: 'IT', description: 'システム構成・データ連携・セキュリティ', targetLv3Count: 2 },
]

// 仕様書 15 のスキルマップ（K H U S）
const LEVELS: Record<string, [number, number, number, number]> = {
  'sk-mes': [4, 2, 2, 3],
  'sk-scada': [3, 3, 4, 2],
  'sk-mfg': [4, 4, 3, 3],
  'sk-consulting': [4, 2, 3, 3],
  'sk-customer': [4, 3, 2, 4],
  'sk-it': [2, 2, 5, 2],
}

export const CUSTOMERS: Customer[] = [
  { id: 'c-b', name: 'B社', industry: '製造業' },
  { id: 'c-a', name: 'A社', industry: 'IT・SaaS' },
  { id: 'c-c', name: 'C社', industry: 'エネルギー・インフラ' },
  { id: 'c-d', name: 'D社', industry: '流通・小売' },
  { id: 'c-e', name: 'E社', industry: '製造業' },
  { id: 'c-int', name: '社内', industry: '社内' },
]

/* ------------------------------------------------------------------ */
/* WBS の定義（ツリー）                                                  */
/* ------------------------------------------------------------------ */

interface Node {
  t: string
  ty?: WbsType
  o?: string
  /** 今週月曜からの日数 */
  s?: number
  e?: number
  plan?: number
  act?: number
  etc?: number
  prog?: number
  st?: WbsStatus
  c?: string
  /** 先行タスクの WBS 番号（例: '1.2'） */
  pre?: string
  pri?: Priority
  url?: string
  /** 当初計画（再計画した場合のみ） */
  basePlan?: number
  baseEnd?: number
  /** 残りを最後に更新したのが何日前か（既定1） */
  etcAge?: number
  /** 状態を変えたのが何日前か */
  since?: number
  kids?: Node[]
}

interface ProjectDef {
  id: string
  name: string
  customerId: string
  ownerId: string
  priority: Priority
  budget?: number
  status: ProjectStatus
  description: string
  roleNeeds: RoleNeed[]
  s: number
  e: number
  opportunityId?: string
  tree: Node[]
}

const D: WbsStatus = 'done'
const W: WbsStatus = 'in_progress'
const T: WbsStatus = 'not_started'
const B: WbsStatus = 'blocked'

const ms = (t: string, day: number, st: WbsStatus = T, pre?: string): Node => ({
  t, ty: 'milestone', s: day, e: day, plan: 0, act: 0, etc: 0, prog: st === D ? 100 : 0, st, pre,
})

const PROJECTS: ProjectDef[] = [
  {
    id: 'bmes',
    name: 'B社 MES構想',
    customerId: 'c-b',
    ownerId: H,
    priority: 'high',
    budget: 2400000,
    status: 'active',
    description: 'B社の製造現場向けMES導入に向けた構想策定。現状分析 → To-Be設計 → ロードマップ策定。',
    roleNeeds: [
      { role: 'PJリード', fte: 0.3 },
      { role: 'MESコンサルタント', fte: 0.5 },
      { role: 'ITエンジニア', fte: 0.2 },
    ],
    s: -14,
    e: 39,
    tree: [
      {
        t: '現状分析',
        kids: [
          { t: 'ヒアリング', o: H, s: -14, e: -10, plan: 20, act: 20, etc: 0, prog: 100, st: D, url: 'https://drive.google.com/drive/folders/sample-hearing' },
          { t: '現場調査', o: K, s: -12, e: -5, plan: 24, act: 28, etc: 0, prog: 100, st: D, basePlan: 20, c: '工場見学が想定より長引いた（+4h）' },
          { t: 'As-Is整理', o: H, s: -5, e: 9, plan: 36, act: 24, etc: 16, prog: 70, st: W, pre: '1.2', c: '現場調査の追加メモを反映中。主サンプル（計画36 / 実績24 / 残り16 → 見込み40）', url: 'https://drive.google.com/drive/folders/sample-asis' },
          ms('ヒアリング完了', -10, D),
          ms('現状分析完了', 9, T, '1.3'),
        ],
      },
      {
        t: 'To-Be設計',
        kids: [
          { t: '課題整理', o: H, s: -3, e: 7, plan: 20, act: 12, etc: 8, prog: 60, st: W },
          {
            t: 'MES構想',
            ty: 'work_package',
            kids: [
              { t: '論点整理', o: K, s: -3, e: 18, plan: 24, act: 14, etc: 14, prog: 50, st: W, c: '構想の論点が増えており、残り時間を上方修正済み' },
              { t: '構想図作成', o: K, s: -3, e: 18, plan: 36, act: 6, etc: 34, prog: 15, st: W },
            ],
          },
          { t: 'システム構成', o: U, s: -3, e: 21, plan: 60, act: 10, etc: 40, prog: 20, st: W },
          { t: 'データ連携設計', o: H, s: 7, e: 18, plan: 18, act: 0, etc: 32, prog: 0, st: T, pre: '2.1' },
          ms('To-Be設計レビュー', 18, T, '2.2.2'),
        ],
      },
      {
        t: 'ロードマップ策定',
        kids: [
          { t: 'ロードマップ案作成', o: K, s: 21, e: 25, plan: 12, act: 0, etc: 12, prog: 0, st: T, pre: '2.2.2' },
          { t: '概算見積・経営報告', o: H, s: 21, e: 31, plan: 16, act: 0, etc: 18, prog: 0, st: T, pre: '2.3' },
          ms('最終報告', 33, T, '3.2'),
        ],
      },
    ],
  },
  {
    id: 'asaas',
    name: 'A社 SaaS導入',
    customerId: 'c-a',
    ownerId: S,
    priority: 'medium',
    budget: 1800000,
    status: 'active',
    description: 'A社へのSaaS導入。環境構築・データ移行・研修・本番切替まで。',
    roleNeeds: [{ role: 'PJリード', fte: 0.3 }, { role: 'ITエンジニア', fte: 0.4 }],
    s: -28,
    e: 25,
    opportunityId: 'o-a0',
    tree: [
      {
        t: '導入準備',
        kids: [
          { t: '要件整理', o: S, s: -28, e: -17, plan: 16, act: 14, etc: 0, prog: 100, st: D },
          { t: 'アカウント設計', o: U, s: -21, e: -10, plan: 12, act: 10, etc: 0, prog: 100, st: D },
          ms('要件確定', -17, D),
        ],
      },
      {
        t: '環境構築',
        kids: [
          { t: 'テナント設定', o: S, s: -14, e: 7, plan: 40, act: 22, etc: 14, prog: 70, st: W },
          { t: 'データ移行', o: U, s: 7, e: 25, plan: 32, act: 0, etc: 30, prog: 0, st: T, pre: '2.1' },
          { t: 'SSO連携', o: K, s: 0, e: 11, plan: 20, act: 4, etc: 18, prog: 20, st: W },
          { t: '受入テスト', o: S, s: 7, e: 18, plan: 30, act: 0, etc: 30, prog: 0, st: T, pre: '2.1' },
          ms('環境構築完了', 11, T, '2.3'),
        ],
      },
      {
        t: '展開',
        kids: [
          { t: '運用設計', o: H, s: 0, e: 18, plan: 44, act: 6, etc: 42, prog: 15, st: W },
          { t: 'ユーザー研修', o: S, s: 21, e: 25, plan: 16, act: 0, etc: 16, prog: 0, st: T },
          ms('本番切替', 25, T, '3.2'),
        ],
      },
    ],
  },
  {
    id: 'cscada',
    name: 'C社 SCADA',
    customerId: 'c-c',
    ownerId: K,
    priority: 'high',
    budget: 2000000,
    status: 'active',
    description: 'C社設備の監視（SCADA）データを活用した異常検知PoC。センサー選定から現場実証まで。',
    roleNeeds: [{ role: 'PJリード', fte: 0.3 }, { role: 'SCADAエンジニア', fte: 0.6 }],
    s: -35,
    e: 28,
    tree: [
      {
        t: '現状調査',
        kids: [
          { t: '設備台帳整理', o: U, s: -35, e: -21, plan: 24, act: 30, etc: 0, prog: 100, st: D },
          { t: '保全業務ヒアリング', o: S, s: -30, e: -17, plan: 20, act: 22, etc: 0, prog: 100, st: D },
          ms('設備台帳整理完了', -21, D),
        ],
      },
      {
        t: 'PoC構築',
        kids: [
          { t: 'センサー選定', o: K, s: -21, e: -4, plan: 30, act: 36, etc: 12, prog: 80, st: W, basePlan: 24, baseEnd: -10, c: '候補の再評価が発生し期限超過' },
          { t: 'データ収集基盤', o: U, s: -14, e: 7, plan: 40, act: 28, etc: 14, prog: 45, st: B, since: 3, c: 'センサー納品遅延のため停止中。納期回答待ち', pri: 'high' },
          { t: '異常検知モデル', o: S, s: -7, e: 18, plan: 48, act: 6, etc: 52, prog: 10, st: W, etcAge: 9 },
          ms('PoC中間報告', 14, T, '2.2'),
        ],
      },
      {
        t: '現場検証',
        kids: [
          { t: '現場実証', o: K, s: 7, e: 25, plan: 56, act: 0, etc: 66, prog: 0, st: T, pre: '2.2' },
          { t: '効果測定・報告', o: H, s: 21, e: 28, plan: 24, act: 0, etc: 24, prog: 0, st: T },
          ms('現場実証完了', 25, T, '3.1'),
        ],
      },
    ],
  },
  {
    id: 'gtm',
    name: '新商材GTM',
    customerId: 'c-int',
    ownerId: S,
    priority: 'medium',
    status: 'active',
    description: '新商材の市場投入（GTM）。市場調査・価格設計・営業資料・ローンチ。',
    roleNeeds: [{ role: '営業・企画', fte: 0.4 }],
    s: -7,
    e: 25,
    tree: [
      {
        t: '市場調査',
        kids: [
          { t: '競合・市場整理', o: S, s: -7, e: -3, plan: 12, act: 12, etc: 0, prog: 100, st: D },
          { t: 'ターゲット仮説', o: H, s: -5, e: 7, plan: 8, act: 5, etc: 3, prog: 70, st: W },
          ms('市場調査完了', 7, T, '1.2'),
        ],
      },
      {
        t: '商品設計・ローンチ',
        kids: [
          { t: 'パッケージ・価格案', o: K, s: 14, e: 18, plan: 11, act: 0, etc: 11, prog: 0, st: T },
          { t: '営業資料作成', o: U, s: 14, e: 25, plan: 30, act: 0, etc: 30, prog: 0, st: T },
          { t: 'LP・告知準備', o: S, s: 14, e: 25, plan: 25, act: 0, etc: 25, prog: 0, st: T },
          ms('ローンチ', 25, T, '2.2'),
        ],
      },
    ],
  },
  {
    id: 'aold',
    name: 'A社 業務診断',
    customerId: 'c-a',
    ownerId: K,
    priority: 'low',
    budget: 1200000,
    status: 'completed',
    description: 'A社の業務診断（完了済み）。経験・完了記録のサンプル。',
    roleNeeds: [],
    s: -140,
    e: -60,
    tree: [],
  },
]

/** 工数入力コメントの例（ダミー） */
const ENTRY_COMMENTS = ['打合せ・内容整理', '資料作成', 'レビュー・修正対応', '', '調査・検討', '顧客確認対応']

/** act(h) を [start, min(end, today)] の稼働日へ 0.5h 刻みで均等に分けて TimeEntry 化する */
function spreadEntries(
  wbsId: string,
  projectId: string,
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
      userId,
      projectId,
      wbsId,
      date: toISO(d),
      hours: u / 2,
      comment: ENTRY_COMMENTS[seq.n % ENTRY_COMMENTS.length],
    })
  })
  return out
}

const stamp = (d: Date, hour = 10) => {
  const x = new Date(d)
  x.setHours(hour, 0, 0, 0)
  return x.toISOString()
}

export function createSeed(today: Date): AppData {
  const mon = weekStartOf(today)
  const at = (offset: number) => toISO(addDays(mon, offset))
  const ago = (n: number) => toISO(addDays(today, -n))

  const wbs: WbsItem[] = []
  const timeEntries: TimeEntry[] = []
  const seq = { n: 0 }

  for (const p of PROJECTS) {
    const idOf = (path: number[]) => `${p.id}-${path.join('-')}`
    const codeToId = new Map<string, string>()
    const collect = (nodes: Node[], path: number[]) =>
      nodes.forEach((n, i) => {
        const pp = [...path, i + 1]
        codeToId.set(pp.join('.'), idOf(pp))
        if (n.kids) collect(n.kids, pp)
      })
    collect(p.tree, [])

    const build = (n: Node, path: number[], parentId: string | null, depth: number): { start: number; end: number } => {
      const id = idOf(path)
      if (n.kids) {
        const ranges = n.kids.map((k, i) => build(k, [...path, i + 1], id, depth + 1))
        const start = Math.min(...ranges.map((r) => r.start))
        const end = Math.max(...ranges.map((r) => r.end))
        wbs.push({
          id, projectId: p.id, parentId,
          type: n.ty ?? (depth === 0 ? 'phase' : 'work_package'),
          title: n.t, ownerId: null,
          startDate: at(start), endDate: at(end),
          planHours: 0, etcHours: 0, progress: 0, status: 'in_progress', priority: 'medium',
          baselinePlanHours: 0, baselineStart: at(start), baselineEnd: at(end),
          statusChangedAt: ago(7), etcUpdatedAt: ago(1),
        })
        // 親は子の後に push されるので順序を入れ替える（親が先に来るように）
        const self = wbs.pop()!
        const firstChild = wbs.findIndex((w) => w.parentId === id)
        wbs.splice(firstChild < 0 ? wbs.length : firstChild, 0, self)
        return { start, end }
      }
      const type: WbsType = n.ty ?? 'task'
      const item: WbsItem = {
        id, projectId: p.id, parentId, type, title: n.t, ownerId: n.o ?? (type === 'milestone' ? p.ownerId : null),
        startDate: at(n.s ?? 0), endDate: at(n.e ?? 0),
        planHours: n.plan ?? 0, etcHours: n.etc ?? 0, progress: n.prog ?? 0, status: n.st ?? T,
        priority: n.pri ?? 'medium',
        predecessorId: n.pre ? codeToId.get(n.pre) : undefined,
        deliverableUrl: n.url, comment: n.c,
        baselinePlanHours: n.basePlan ?? n.plan ?? 0,
        baselineStart: at(n.s ?? 0),
        baselineEnd: at(n.baseEnd ?? n.e ?? 0),
        statusChangedAt: n.since !== undefined ? ago(n.since) : n.st === D ? at(n.e ?? 0) : ago(4),
        etcUpdatedAt: ago(n.etcAge ?? 1),
      }
      wbs.push(item)
      if (n.o && (n.act ?? 0) > 0) timeEntries.push(...spreadEntries(id, p.id, n.o, item.startDate, item.endDate, n.act!, today, seq))
      return { start: n.s ?? 0, end: n.e ?? 0 }
    }
    p.tree.forEach((n, i) => build(n, [i + 1], null, 0))
  }

  const projects: Project[] = PROJECTS.map((p) => ({
    id: p.id, customerId: p.customerId, name: p.name, ownerId: p.ownerId, status: p.status,
    startDate: at(p.s), endDate: at(p.e), priority: p.priority, health: null, budget: p.budget,
    description: p.description, roleNeeds: p.roleNeeds, opportunityId: p.opportunityId,
  }))

  const risks: Risk[] = [
    { id: 'r-b1', projectId: 'bmes', wbsId: 'bmes-2-2', kind: 'risk', severity: 'low', probability: 'medium', title: '構想の論点増加によるMES構想の工数膨張', ownerId: K, status: 'mitigating', createdAt: ago(10) },
    { id: 'r-b2', projectId: 'bmes', kind: 'issue', severity: 'low', probability: 'high', title: 'ヒアリング対象部署の追加依頼（スコープ拡大）', ownerId: H, status: 'open', createdAt: ago(5) },
    { id: 'r-c1', projectId: 'cscada', wbsId: 'cscada-2-2', kind: 'risk', severity: 'high', probability: 'high', title: 'センサー納品遅延でPoC全体の日程に影響', ownerId: K, status: 'open', createdAt: ago(6) },
    { id: 'r-c2', projectId: 'cscada', kind: 'risk', severity: 'medium', probability: 'medium', title: '現場担当者の確保（検証期間）', ownerId: K, status: 'mitigating', createdAt: ago(12) },
    { id: 'r-a1', projectId: 'asaas', kind: 'risk', severity: 'low', probability: 'medium', title: '旧システムのデータ品質（欠損）', ownerId: U, status: 'mitigating', createdAt: ago(20) },
  ]

  /* ---- スキル・育成 ---- */
  const userSkills: UserSkill[] = []
  const evidence: Record<string, string> = {
    'u-h:sk-mes': 'B社 MES構想で現状分析を担当（上司確認済み）',
    'u-h:sk-scada': 'C社 SCADAで現場ヒアリングを担当',
    'u-k:sk-mes': '複数のMES構想を主導',
    'u-u:sk-it': 'システム構成・セキュリティ設計の専門責任者',
    'u-s:sk-customer': '顧客折衝を多数経験',
  }
  const USERS_ORDER = [K, H, U, S]
  for (const [skillId, lv] of Object.entries(LEVELS)) {
    lv.forEach((level, i) => {
      const uid = USERS_ORDER[i]
      userSkills.push({
        userId: uid, skillId, level,
        evidence: evidence[`${uid}:${skillId}`] ?? '',
        updatedAt: uid === H && skillId === 'sk-mes' ? ago(20) : ago(60 + i * 7),
        confirmedBy: level >= 3 ? K : undefined,
      })
    })
  }

  const growthFocus: GrowthFocus[] = [
    { id: 'g-1', userId: H, by: 'self', text: '構想コンサルを自分で回せるようになる', skillId: 'sk-consulting', role: 'MESコンサルタント' },
    { id: 'g-2', userId: H, by: 'manager', text: 'MESの知識を深め、構想の主担当を任せられる状態にする', skillId: 'sk-mes' },
    { id: 'g-3', userId: U, by: 'manager', text: 'SCADA・MES領域へ広げ、技術リードを任せる', skillId: 'sk-mes', role: 'ITエンジニア' },
    { id: 'g-4', userId: S, by: 'self', text: 'コンサルティングの進め方を身につけ、PJリードを経験する', skillId: 'sk-consulting', role: 'PJリード' },
    { id: 'g-5', userId: K, by: 'manager', text: '後進の育成と、新しい顧客攻略モデルの確立' },
  ]

  /* ---- 受注見込み ---- */
  const dem = (role: string, hours: number, skillIds: string[] = []): RoleDemand => ({ role, hours, skillIds })
  const opp = (o: Partial<Opportunity> & Pick<Opportunity, 'id' | 'customerId' | 'title' | 'ownerId' | 'stage' | 'probability' | 'demands'>, s: number, e: number): Opportunity => ({
    startDate: at(s), endDate: at(e), nextAction: '', skills: [], scores: {}, evalComment: '', createdAt: ago(30), ...o,
  })
  const stageOf = (st: OppStage) => st
  const opportunities: Opportunity[] = [
    opp({
      id: 'o-a', customerId: 'c-a', title: 'A社 運用高度化', ownerId: S, stage: stageOf('consultation'), probability: 20,
      nextAction: '現行運用の課題をヒアリングする',
      demands: [dem('PJリード', 120, ['sk-consulting']), dem('ITエンジニア', 200, ['sk-it'])],
      skills: [{ skillId: 'sk-consulting', requiredLevel: 3 }, { skillId: 'sk-it', requiredLevel: 3 }],
    }, 70, 150),
    opp({
      id: 'o-d', customerId: 'c-d', title: 'D社 需給予測PoC', ownerId: S, stage: stageOf('explore'), probability: 30,
      nextAction: '予測対象データの有無を確認',
      demands: [dem('ITエンジニア', 100, ['sk-it']), dem('PJリード', 60, ['sk-consulting'])],
      skills: [{ skillId: 'sk-it', requiredLevel: 3 }, { skillId: 'sk-consulting', requiredLevel: 2 }],
    }, 56, 112),
    opp({
      id: 'o-b', customerId: 'c-b', title: 'B社 MES本導入（フェーズ2）', ownerId: H, stage: stageOf('candidate'), probability: 50,
      nextAction: '現状分析の結果を踏まえ、概算見積を提示',
      scores: { customerValue: 4, ltv: 4, strategic: 4, feasibility: 3 },
      demands: [
        dem('PJリード', 144, ['sk-consulting', 'sk-customer']),
        dem('MESコンサルタント', 240, ['sk-mes', 'sk-mfg']),
        dem('ITエンジニア', 96, ['sk-it']),
      ],
      skills: [
        { skillId: 'sk-mes', requiredLevel: 3 }, { skillId: 'sk-mfg', requiredLevel: 3 },
        { skillId: 'sk-consulting', requiredLevel: 3 }, { skillId: 'sk-customer', requiredLevel: 3 }, { skillId: 'sk-it', requiredLevel: 2 },
      ],
    }, 28, 112),
    opp({
      id: 'o-c', customerId: 'c-c', title: 'C社 SCADA横展開（他拠点）', ownerId: K, stage: stageOf('evaluation'), probability: 70,
      nextAction: 'PoC中間報告で他拠点展開の意向を確認',
      decisionDue: at(7),
      scores: { customerValue: 4, ltv: 4, strategic: 3, ripple: 5, winning: 3, capability: 4, feasibility: 2, risk: 3 },
      evalComment: '横展開の波及は大きいが、SCADAエンジニアの確保が課題。',
      demands: [dem('PJリード', 160, ['sk-consulting']), dem('SCADAエンジニア', 320, ['sk-scada']), dem('ITエンジニア', 160, ['sk-it'])],
      skills: [{ skillId: 'sk-scada', requiredLevel: 3 }, { skillId: 'sk-consulting', requiredLevel: 3 }, { skillId: 'sk-it', requiredLevel: 3 }],
    }, 21, 105),
    opp({
      id: 'o-e', customerId: 'c-e', title: 'E社 保全DX', ownerId: K, stage: stageOf('approval_wait'), probability: 90,
      nextAction: '社内承認後に契約・キックオフ日程を確定',
      decisionDue: at(3),
      scores: { customerValue: 5, ltv: 4, strategic: 4, ripple: 3, winning: 4, capability: 4, feasibility: 4, risk: 4 },
      evalComment: '体制の目処が立っており、PJ化を推奨。',
      demands: [dem('PJリード', 80, ['sk-consulting']), dem('SCADAエンジニア', 160, ['sk-scada']), dem('ITエンジニア', 80, ['sk-it'])],
      skills: [{ skillId: 'sk-scada', requiredLevel: 3 }, { skillId: 'sk-consulting', requiredLevel: 3 }],
    }, 14, 70),
    opp({
      id: 'o-a0', customerId: 'c-a', title: 'A社 SaaS導入（PoC）', ownerId: S, stage: stageOf('converted'), probability: 100,
      nextAction: '', convertedProjectId: 'asaas', convertedAt: ago(3), createdAt: ago(60),
      demands: [dem('PJリード', 80), dem('ITエンジニア', 160)],
      scores: { customerValue: 4, ltv: 4, strategic: 3, ripple: 3, winning: 4, capability: 4, feasibility: 4, risk: 4 },
    }, -28, 25),
  ]

  /* ---- 配置（E社に仮アサイン済み。B社は未配置 = 配置計画のデモ用） ---- */
  const assignments: Assignment[] = []
  const oppE = opportunities.find((o) => o.id === 'o-e')!
  const weeksOfE: string[] = []
  for (let d = weekStartOf(parseDate(oppE.startDate)); d <= parseDate(oppE.endDate); d = addDays(d, 7)) weeksOfE.push(toISO(d))
  const addBatch = (batch: string, userId: string, role: string, hpw: number, reason: string) =>
    weeksOfE.forEach((w, i) =>
      assignments.push({
        id: `as-${batch}-${i}`, targetType: 'opportunity', targetId: 'o-e', userId, role, weekStart: w,
        plannedHours: hpw, status: 'tentative', batchId: batch, reason,
      }),
    )
  addBatch('seed-e1', H, 'PJリード', 10, '現場経験を活かし、PJリードを経験してもらう（育成）')
  addBatch('seed-e2', U, 'ITエンジニア', 10, '技術リードとして継続')

  /* ---- 稼働（休暇・研修・固定業務） ---- */
  const capacities: Capacity[] = [
    { userId: U, weekStart: at(7), unavailableHours: 8, note: '社外研修' },
    { userId: H, weekStart: at(14), unavailableHours: 8, note: '休暇' },
    { userId: S, weekStart: at(21), unavailableHours: 8, note: '固定業務（月次報告）' },
  ]

  /* ---- 経験・完了記録 ---- */
  const exp = (
    id: string, userId: string, projectId: string, role: string, summary: string, skillIds: string[],
    status: Experience['status'], s: number, e: number, created: number,
  ): Experience => ({ id, userId, projectId, role, summary, skillIds, status, startDate: at(s), endDate: at(e), createdAt: ago(created) })
  const experiences: Experience[] = [
    exp('e-1', H, 'aold', 'コンサルタント', '業務診断の現場ヒアリングと課題整理', ['sk-consulting', 'sk-mfg'], 'confirmed', -140, -60, 60),
    exp('e-2', K, 'aold', 'PJリード', '業務診断を主導し、MES構想の相談につなげた', ['sk-consulting', 'sk-customer'], 'confirmed', -140, -60, 60),
    exp('e-3', S, 'aold', '営業・企画', '診断結果の提案・合意形成を担当', ['sk-customer'], 'confirmed', -140, -60, 60),
    exp('e-4', K, 'cscada', 'PJリード', 'PoC全体の推進とセンサー選定', ['sk-scada', 'sk-consulting'], 'confirmed', -35, 28, 30),
    exp('e-5', H, 'cscada', 'メンバー', '保全業務ヒアリング・効果測定の計画', ['sk-scada', 'sk-mfg'], 'confirmed', -35, 28, 30),
    exp('e-6', U, 'cscada', 'ITエンジニア', '設備台帳整理・データ収集基盤の設計', ['sk-scada', 'sk-it'], 'confirmed', -35, 28, 30),
    exp('e-7', S, 'cscada', 'メンバー', '保全業務ヒアリング・異常検知モデル', ['sk-scada'], 'confirmed', -30, 18, 30),
    exp('e-8', S, 'gtm', '営業・企画', '新商材の市場整理・LP企画', ['sk-customer'], 'confirmed', -7, 25, 7),
    exp('e-9', H, 'bmes', 'コンサルタント', '現状分析（ヒアリング・As-Is整理）を担当', ['sk-mes', 'sk-mfg'], 'candidate', -14, 39, 3),
    exp('e-10', K, 'bmes', 'MESコンサルタント', '現場調査と構想の主導', ['sk-mes'], 'confirmed', -14, 39, 14),
    exp('e-11', U, 'asaas', 'ITエンジニア', 'アカウント設計・データ移行', ['sk-it'], 'confirmed', -28, 25, 25),
  ]

  const closes: ProjectClose[] = [
    {
      projectId: 'aold',
      outcome: '業務診断レポートを納品し、MES構想（B社）の相談につながった。',
      valueText: '売上120万円。次の案件（MES構想）の起点になった。',
      revenue: 1200000,
      lessons: '初回ヒアリングで現場の担当者を巻き込むと、課題の精度が上がった。',
      reusableAssets: 'ヒアリング質問票テンプレート / 業務診断レポートの雛形',
      members: [
        { userId: K, role: 'PJリード', summary: '診断を主導し、顧客の経営層と合意形成', skillIds: ['sk-consulting', 'sk-customer'], nextRecommendation: '構想フェーズのPJリード' },
        { userId: H, role: 'コンサルタント', summary: '現場ヒアリングと課題整理', skillIds: ['sk-consulting', 'sk-mfg'], nextRecommendation: '構想コンサルを主担当で' },
        { userId: S, role: '営業・企画', summary: '提案・合意形成', skillIds: ['sk-customer'], nextRecommendation: '顧客折衝の幅を広げる案件' },
      ],
      status: 'closed',
      closedAt: at(-60),
    },
  ]

  /* ---- 更新履歴・レビュー ---- */
  const log = (n: number, hour: number, userId: string, entityType: ActivityLog['entityType'], entityId: string, projectId: string | undefined, action: string, summary: string): ActivityLog => ({
    id: `log-seed-${seq.n++}`, entityType, entityId, projectId, userId, action, summary, timestamp: stamp(addDays(today, -n), hour),
  })
  const activity: ActivityLog[] = [
    log(0, 9, H, 'wbs', 'bmes-1-3', 'bmes', 'update', 'As-Is整理の残りを 20h → 16h に更新'),
    log(1, 17, K, 'wbs', 'bmes-2-2-1', 'bmes', 'update', '論点整理の残りを 10h → 14h に更新（論点が増加）'),
    log(2, 11, U, 'wbs', 'cscada-2-2', 'cscada', 'update', 'データ収集基盤の状態を「進行中」→「停止中」に変更'),
    log(3, 10, S, 'opportunity', 'o-a0', undefined, 'convert', 'A社 SaaS導入（PoC）をプロジェクト化'),
    log(4, 15, K, 'opportunity', 'o-e', undefined, 'move', 'E社 保全DX を「評価中」→「PJ化待ち」へ移動'),
    log(5, 13, H, 'risk', 'r-b2', 'bmes', 'create', 'リスク・課題を追加: ヒアリング対象部署の追加依頼'),
    log(6, 16, K, 'project', 'cscada', 'cscada', 'update', 'C社 SCADAの受注額を設定'),
  ]
  const reviewNotes: ReviewNote[] = [
    { id: 'rn-1', weekStart: toISO(addDays(mon, -7)), text: 'C社 SCADA: センサー納品の代替ベンダーを打診する（K）。E社は来週中にPJ化判断。', authorId: K, createdAt: stamp(addDays(mon, -3), 18) },
  ]

  return {
    users: USERS.map((u) => ({ ...u })),
    skills: SKILLS.map((s) => ({ ...s })),
    userSkills,
    growthFocus,
    customers: CUSTOMERS.map((c) => ({ ...c })),
    opportunities,
    projects,
    wbs,
    timeEntries,
    assignments,
    allocationOverrides: [],
    capacities,
    risks,
    experiences,
    closes,
    activity,
    reviewNotes,
    settings: {
      ...DEFAULT_SETTINGS,
      mission: '今週の重点: B社 MES構想の現状分析を完了し、C社 SCADAの停止要因（センサー納品）を解消する。',
      matchWeights: { ...DEFAULT_SETTINGS.matchWeights },
      roles: [...DEFAULT_SETTINGS.roles],
    },
    currentUserId: K,
    seededOn: toISO(today),
  }
}
