import { Outlet, useParams } from 'react-router-dom'
import { ProjectDashboard } from '../components/ProjectDashboard'
import { ProjectCloseView } from '../components/ProjectCloseView'
import { ProjectHeader } from '../components/ProjectHeader'
import { ProjectOverview } from '../components/ProjectOverview'
import { RisksView } from '../components/RisksView'
import { TaskDrawer } from '../components/TaskDrawer'
import { TimelineView } from '../components/TimelineView'
import { WbsTable } from '../components/WbsTable'
import { WorkloadPanel } from '../components/WorkloadPanel'
import { cx } from '../components/cx'
import { useTaskParam } from '../hooks/useTaskParam'
import { useApp } from '../store/AppContext'
import { NotFoundPage } from './NotFoundPage'

/** プロジェクト画面の共通レイアウト（ヘッダー + タブ + ビュー + タスクドロワー） */
export function ProjectPage() {
  const { projectId = '' } = useParams()
  const { derived } = useApp()
  const drawer = useTaskParam()
  const summary = derived.summaryById.get(projectId)

  if (!summary) return <NotFoundPage message="このプロジェクトは見つかりません" />

  return (
    <div className="page page--project">
      <ProjectHeader summary={summary} />
      <div className={cx('project__body', drawer.task && 'has-drawer')}>
        <Outlet />
      </div>
      {drawer.task && (
        <TaskDrawer
          projectId={projectId}
          taskParam={drawer.task}
          parentParam={drawer.parent}
          newType={drawer.newType}
          onClose={drawer.close}
          onOpen={drawer.open}
        />
      )}
    </div>
  )
}

/** 概要タブ */
export function ProjectOverviewView() {
  const { projectId = '' } = useParams()
  return <ProjectOverview projectId={projectId} />
}

/** 完了処理（学び・経験の記録） */
export function ProjectCloseRoute() {
  const { projectId = '' } = useParams()
  return <ProjectCloseView projectId={projectId} />
}

/** リスクタブ */
export function ProjectRisksView() {
  const { projectId = '' } = useParams()
  return <RisksView projectId={projectId} />
}

/** 一覧（WBS）タブ */
export function ProjectListView() {
  const { projectId = '' } = useParams()
  const drawer = useTaskParam()
  return <WbsTable projectId={projectId} selectedId={drawer.task} onOpen={drawer.open} onAdd={drawer.openNew} />
}

/** Timeline タブ */
export function ProjectTimelineView() {
  const { projectId = '' } = useParams()
  const drawer = useTaskParam()
  return <TimelineView projectId={projectId} selectedId={drawer.task} onOpen={drawer.open} />
}

/** Dashboard タブ */
export function ProjectDashboardView() {
  const { projectId = '' } = useParams()
  return <ProjectDashboard projectId={projectId} />
}

/** Workload タブ（このPJの担当者の、全PJ合算の負荷） */
export function ProjectWorkloadView() {
  const { projectId = '' } = useParams()
  return <WorkloadPanel projectId={projectId} />
}
