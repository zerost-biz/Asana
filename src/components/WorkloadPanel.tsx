import { useSearchParams } from 'react-router-dom'
import { usePref } from '../hooks/usePref'
import { sliceMatrix } from '../domain/workload'
import { useApp } from '../store/AppContext'
import { WorkloadDrawer } from './WorkloadDrawer'
import { LoadLegend, WorkloadGrid } from './WorkloadGrid'
import { cx } from './cx'

const WEEK_CHOICES = ['4', '8', '12'] as const

/**
 * 稼働状況（グリッド + セル詳細ドロワー）。稼働状況ページとプロジェクトの稼働状況タブで共用。
 * 開いているセルは ?cell=<userId>:<weekIndex> で保持する。
 */
export function WorkloadPanel({ projectId, editableCapacity }: { projectId?: string; editableCapacity?: boolean }) {
  const { derived } = useApp()
  const [params, setParams] = useSearchParams()
  const [weeksStr, setWeeksStr] = usePref<'4' | '8' | '12'>('wl-weeks', '4', WEEK_CHOICES)
  const [mode, setMode] = usePref<'committed' | 'forecast'>('wl-mode', 'forecast', ['committed', 'forecast'])
  const forecast = mode === 'forecast'
  const matrix = sliceMatrix(derived.workloadAll, Number(weeksStr))

  const cell = params.get('cell')
  const [userId, weekStr] = cell ? cell.split(':') : [null, null]
  const weekIndex = weekStr !== null ? Number(weekStr) : NaN
  const valid = !!userId && Number.isInteger(weekIndex) && weekIndex >= 0 && weekIndex < derived.weeksAll.length && derived.userById.has(userId)

  const select = (uid: string, wi: number) =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.set('cell', `${uid}:${wi}`)
        return n
      },
      { replace: true },
    )
  const close = () =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('cell')
        return n
      },
      { replace: true },
    )

  return (
    <section className={cx('wlpanel', valid && 'has-drawer')}>
      <div className="wlpanel__bar">
        <div className="wlpanel__left">
          <div className="unit-toggle" role="radiogroup" aria-label="負荷の見方">
            <button
              type="button"
              role="radio"
              aria-checked={!forecast}
              className={cx(!forecast && 'is-on')}
              onClick={() => setMode('committed')}
              title="確定している作業（WBSの残り時間・確定配置）だけで負荷率を出します"
            >
              確定のみ
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={forecast}
              className={cx(forecast && 'is-on')}
              onClick={() => setMode('forecast')}
              title="受注見込みの案件・仮配置（確度で重み付け）も含めた先行的な負荷率を出します"
            >
              受注見込みを含む
            </button>
          </div>
          <div className="unit-toggle" role="radiogroup" aria-label="表示する週数">
            {WEEK_CHOICES.map((w) => (
              <button key={w} type="button" role="radio" aria-checked={weeksStr === w} className={cx(weeksStr === w && 'is-on')} onClick={() => setWeeksStr(w)}>
                {w}週
              </button>
            ))}
          </div>
          <LoadLegend />
        </div>
        {projectId ? (
          <span className="wlpanel__note">このプロジェクトに担当タスクを持つメンバーの、全プロジェクト合算の負荷です</span>
        ) : (
          <span className="wlpanel__note">
            負荷率 = {forecast ? '（確定 ＋ 受注見込み分）' : '確定'} ÷ 稼働可能（標準稼働 − 休暇・研修など）。受注見込み分 = 受注見込み案件の工数 × 確度
          </span>
        )}
      </div>
      <div className="card card--wl">
        <WorkloadGrid
          matrix={matrix}
          forecast={forecast}
          selectedKey={valid ? cell : null}
          onSelect={select}
          projectId={projectId}
          editableCapacity={editableCapacity}
        />
      </div>
      {valid && userId && <WorkloadDrawer matrix={derived.workloadAll} forecast={forecast} userId={userId} weekIndex={weekIndex} onClose={close} />}
    </section>
  )
}
