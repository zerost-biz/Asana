import { PageHeader } from '../components/PageHeader'
import { WorkloadPanel } from '../components/WorkloadPanel'

export function WorkloadPage() {
  return (
    <div className="page">
      <PageHeader title="Workload" sub="人 × 週の負荷（Planned Hours ÷ Available Hours）。セルをクリックすると内訳が右に開きます" />
      <WorkloadPanel editableCapacity />
    </div>
  )
}
