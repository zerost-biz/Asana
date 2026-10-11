import { CircleHelp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cx } from './cx'

interface Term {
  word: string
  /** 仕様書・開発側での呼び名 */
  alias?: string
  desc: string
}

const GROUPS: { title: string; terms: Term[] }[] = [
  {
    title: '作業時間',
    terms: [
      { word: '時間の表記（h）', desc: '「時間」の記号です。36h ＝ 36時間。' },
      { word: '計画', alias: 'PLAN', desc: '最初に見積もった作業時間。' },
      { word: '実績', alias: 'ACT', desc: 'これまでに「自分の作業」で記録された作業時間の合計。' },
      {
        word: '残り',
        alias: 'ETC',
        desc: '完了まで、あと何時間かかるか。担当者が自分の見立てで入力します。進捗の％から自動で計算はしません。',
      },
      { word: '見込み', alias: 'EAC', desc: '実績 + 残り。このまま進んだ場合の、完了までの合計時間です。' },
      { word: '差異', desc: '見込み − 計画。プラスなら、計画より時間がかかりそう（超過見込み）という意味です。' },
      {
        word: '工数消化率',
        desc: '実績 ÷ 計画。進捗（％）より消化率が高いときは、見積もりが足りない可能性があります。',
      },
    ],
  },
  {
    title: '人の負荷',
    terms: [
      { word: '標準稼働', alias: 'Base Capacity', desc: 'その人が1週間に働ける時間（初期値は40時間）。「管理」で人ごとに変えられます。' },
      { word: '稼働可能', alias: 'Available', desc: '標準稼働 − 休暇・研修・固定業務など使えない時間。稼働状況の画面で週ごとに調整できます。' },
      { word: '確定', alias: 'Committed', desc: 'すでに決まっている予定。未完了の作業の「残り」を開始日〜終了日の平日に均等に割り振った時間 ＋ 確定した配置。' },
      { word: '受注見込み分', alias: 'Expected', desc: '受注前の案件の必要工数 × 確度（％）。まだ決まっていない将来の負荷の目安です。' },
      { word: '負荷率', alias: 'Utilization', desc: '確定 ÷ 稼働可能。85%未満＝余裕 / 85〜100%＝注意 / 100%超＝過負荷（赤）。しきい値は「管理」で変更できます。' },
      { word: '受注見込みを含む負荷率', alias: 'Forecast', desc: '（確定 ＋ 受注見込み分）÷ 稼働可能。受注前の案件まで含めて、先の人手不足・過負荷を早く見つけるための数字です。' },
      { word: '未配置の需要', desc: '案件やプロジェクトで必要な役割のうち、まだ誰にも割り当てていない時間（確度で重み付け）。' },
    ],
  },
  {
    title: '受注見込み・配置',
    terms: [
      { word: '受注見込み', alias: 'Pipeline', desc: 'まだプロジェクトになっていない案件（相談 → 探索 → PJ候補 → 評価中 → PJ化待ち）。' },
      { word: '確度', alias: 'Probability', desc: '受注できる見込み（％）。段階ごとの標準は 20 / 30 / 50 / 70 / 90%。' },
      { word: '人月', desc: '1人が1か月働く量。1人月 ＝ 160時間として計算します。' },
      { word: 'PJ化', desc: '案件をプロジェクトにすること。評価（8つの軸）は判断材料で、可否は人が決めます。' },
      { word: '仮配置', alias: 'Tentative', desc: '案件やプロジェクトに、人を仮に割り当てること。課長が「確定」すると本配置になります。' },
      { word: '適合度', alias: 'Match', desc: '配置の推薦の目安（0〜100）。スキル40% ＋ 空き30% ＋ 経験15% ＋ 育成10% ＋ 継続性5%（重みは変更可）。' },
    ],
  },
  {
    title: 'スキル・経験',
    terms: [
      { word: 'スキルレベル', desc: '1=基礎 / 2=支援あり / 3=自走 / 4=指導 / 5=専門責任者。レベル3以上を「自走」と呼びます。' },
      { word: '目標人数', desc: 'レベル3以上で確保したい人数。足りないスキルはスキルマップで強調され、育成の候補が出ます。' },
      { word: '経験', alias: 'Experience', desc: 'プロジェクトでの役割と成果の記録。完了時に候補が自動で作られ、本人・リーダーが確認して確定します。' },
      { word: '育成テーマ', desc: '本人や上司が決めた「次に経験したいこと」。配置の推薦（育成適合）に使います。' },
    ],
  },
  {
    title: 'お金',
    terms: [
      { word: '時間単価', desc: '1時間あたりの人件費（円）。「管理 → メンバー」で変更できます（管理者のみ）。' },
      { word: '人件費', desc: '作業時間 × 時間単価。実績は入力した人の単価、計画と残りは担当者の単価で計算します。' },
      { word: '粗利', desc: '受注額 − 見込みの人件費。粗利率 ＝ 粗利 ÷ 受注額（目安は10%以上）。' },
    ],
  },
  {
    title: '社内オーダー・レポート',
    terms: [
      { word: '社内オーダー', alias: '内部オーダー', desc: 'プロジェクトごとに登録する、作業時間・人件費の計上先（オーダー番号）。番号は全プロジェクトで重複しません。' },
      { word: '終了（オーダー）', desc: '終了にすると新しい入力では選べなくなりますが、過去の集計は残ります。' },
      { word: '15日締め・末締め', desc: '月を 1日〜15日（15日締め）と 16日〜月末（末締め）に分けた集計期間。作業時間は「作業日」で振り分けます。' },
      { word: 'オーダー未設定', desc: 'オーダーが決まっていない作業時間。レポートでは「（未設定）」として残り、あとからまとめて割り当てられます。' },
    ],
  },
  {
    title: '状態',
    terms: [
      { word: '順調 / 注意 / 危険', desc: 'プロジェクトの状態。時間の超過・遅延・停止中・重大なリスクから自動で判定します。' },
      { word: '停止中', alias: 'blocked', desc: '何かの待ちなどで、進められなくなっている作業。' },
      { word: '遅延', desc: '終了日を過ぎても、まだ完了していない作業。' },
      { word: 'マイルストーン', desc: '節目となる日付（工数のない目印）。達成すると「最近の成果」に載ります。' },
      { word: '先行タスク', alias: 'Predecessor', desc: 'これが終わってから始める作業。日程が重なると警告します。' },
      { word: '作業項目', alias: 'WBS', desc: 'プロジェクトの作業を、フェーズ → 作業パッケージ → タスクの順に細かく分けた一覧。' },
      { word: '権限', desc: '管理者 / 課長 / リーダー / 担当メンバー / 閲覧者。右上のユーザー切替で、見え方と操作できる範囲を確認できます。' },
    ],
  },
]

export function GlossaryDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal modal--wide" role="dialog" aria-label="用語の説明" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal__title">用語の説明</h3>
        <p className="modal__lead">画面に出てくる言葉の意味です。薄い文字は、仕様書や開発資料での呼び名です。</p>
        <div className="glossary">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h4>{g.title}</h4>
              <dl>
                {g.terms.map((t) => (
                  <div key={t.word}>
                    <dt>
                      {t.word}
                      {t.alias && <small>{t.alias}</small>}
                    </dt>
                    <dd>{t.desc}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="modal__foot">
          <button type="button" className="btn btn--primary" onClick={onClose} autoFocus>
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

/** 「用語の説明」を開くボタン（アイコンのみ / テキスト付き） */
export function GlossaryButton({ variant = 'text', className }: { variant?: 'text' | 'icon'; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          className={cx('icon-btn icon-btn--sm', className)}
          onClick={() => setOpen(true)}
          title="用語の説明（計画・実績・残り・見込み など）"
          aria-label="用語の説明"
        >
          <CircleHelp size={16} />
        </button>
      ) : (
        <button type="button" className={cx('glossary-btn', className)} onClick={() => setOpen(true)}>
          <CircleHelp size={15} />
          用語の説明
        </button>
      )}
      {open && <GlossaryDialog onClose={() => setOpen(false)} />}
    </>
  )
}
