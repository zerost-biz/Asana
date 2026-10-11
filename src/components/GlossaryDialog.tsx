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
      { word: '稼働可能', desc: 'その人が1週間に働ける時間（初期値は40時間）。' },
      { word: '予定', desc: '未完了の作業の「残り」を、開始日〜終了日の平日に均等に割り振った時間。' },
      { word: '負荷率', desc: '予定 ÷ 稼働可能。85%未満＝余裕 / 85〜100%＝注意 / 100%超＝過負荷（赤）。' },
    ],
  },
  {
    title: 'お金',
    terms: [
      { word: '時間単価', desc: '1時間あたりの人件費（円）。「設定 → メンバーと単価」で変更できます。' },
      { word: '人件費', desc: '作業時間 × 時間単価。実績は入力した人の単価、計画と残りは担当者の単価で計算します。' },
      { word: '粗利', desc: '受注額 − 見込みの人件費。粗利率 ＝ 粗利 ÷ 受注額（目安は10%以上）。' },
    ],
  },
  {
    title: '状態',
    terms: [
      { word: '順調 / 注意 / 危険', desc: 'プロジェクトの状態。時間の超過・遅延・停止中・重大なリスクから自動で判定します。' },
      { word: '停止中', alias: 'blocked', desc: '何かの待ちなどで、進められなくなっている作業。' },
      { word: '遅延', desc: '終了日を過ぎても、まだ完了していない作業。' },
      { word: '作業項目', alias: 'WBS', desc: 'プロジェクトの作業を、フェーズ → タスクの順に細かく分けた一覧。' },
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
