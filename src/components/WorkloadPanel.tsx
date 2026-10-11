import { useSearchParams } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { WorkloadDrawer } from './WorkloadDrawer'
import { LoadLegend, WorkloadGrid } from './WorkloadGrid'
import { cx } from './cx'

/**
 * Workload（グリッド + セル詳細ドロワー）。Workload ページとプロジェクトの Workload タブで共用。
 * 開いているセルは ?cell=<userId>:<weekIndex> で保持する。
 */
export function WorkloadPanel({ projectId, editableCapacity }: { projectId?: string; editableCapacity?: boolean }) {
  const { derived } = useApp()
  const [params, setParams] = useSearchParams()
  const cell = params.get('cell')
  const [userId, weekStr] = cell ? cell.split(':') : [null, null]
  const weekIndex = weekStr !== null ? Number(weekStr) : NaN
  const valid = !!userId && Number.isInteger(weekIndex) && weekIndex >= 0 && weekIndex < derived.weeks.length && derived.userById.has(userId)

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
        <LoadLegend />
        {projectId && <span className="wlpanel__note">このプロジェクトに担当タスクを持つメンバーの、全プロジェクト合算の負荷です</span>}
      </div>
      <div className="card card--wl">
        <WorkloadGrid
          matrix={derived.workload}
          selectedKey={valid ? cell : null}
          onSelect={select}
          projectId={projectId}
          editableCapacity={editableCapacity}
        />
      </div>
      {valid && userId && <WorkloadDrawer matrix={derived.workload} userId={userId} weekIndex={weekIndex} onClose={close} />}
    </section>
  )
}
