import { Card } from '../components/Card'
import { PageHeader } from '../components/PageHeader'
import { ProjectHealthTable } from '../components/ProjectHealthTable'
import { useApp } from '../store/AppContext'

export function ProjectsPage() {
  const { derived } = useApp()
  return (
    <div className="page">
      <PageHeader title="Projects" sub={`${derived.summaries.length}件のプロジェクト。行をクリックしてWBSを開きます`} />
      <Card title="Project Health" flush>
        <ProjectHealthTable />
      </Card>
    </div>
  )
}
