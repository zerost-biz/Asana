import { PageHeader } from '../components/PageHeader'
import { WorkloadPanel } from '../components/WorkloadPanel'

export function WorkloadPage() {
  return (
    <div className="page">
      <PageHeader title="稼働状況" sub="人 × 週の負荷（予定時間 ÷ 稼働可能時間）。セルをクリックすると内訳が右に開きます" />
      <WorkloadPanel editableCapacity />
    </div>
  )
}
