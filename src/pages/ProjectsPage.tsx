import { FolderPlus, Plus } from 'lucide-react'
import { Card } from '../components/Card'
import { PageHeader } from '../components/PageHeader'
import { useProjectDialog } from '../components/ProjectDialogHost'
import { ProjectHealthTable } from '../components/ProjectHealthTable'
import { useApp } from '../store/AppContext'

export function ProjectsPage() {
  const { derived } = useApp()
  const { openCreate } = useProjectDialog()
  const count = derived.summaries.length
  return (
    <div className="page">
      <PageHeader
        title="プロジェクト"
        sub={count > 0 ? `${count}件のプロジェクト。行をクリックすると作業項目を開きます` : 'まだプロジェクトがありません'}
        right={
          <button type="button" className="btn btn--primary" onClick={openCreate}>
            <Plus size={16} />
            プロジェクトを追加
          </button>
        }
      />
      {count === 0 ? (
        <div className="empty empty--big">
          <FolderPlus size={28} />
          <p>最初のプロジェクトを追加しましょう。標準の作業テンプレートから、すぐに始められます。</p>
          <button type="button" className="btn btn--primary" onClick={openCreate}>
            プロジェクトを追加
          </button>
        </div>
      ) : (
        <Card title="プロジェクトの状態" flush>
          <ProjectHealthTable />
        </Card>
      )}
    </div>
  )
}
