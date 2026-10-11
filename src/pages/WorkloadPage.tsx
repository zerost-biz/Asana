import { PageHeader } from '../components/PageHeader'
import { WorkloadPanel } from '../components/WorkloadPanel'

export function WorkloadPage() {
  return (
    <div className="page">
      <PageHeader
        title="稼働状況"
        sub="人 × 週の負荷（予定時間 ÷ 稼働可能時間）。確定した作業に加え、受注見込みの案件も含めて、将来の人手不足・過負荷を早めに見つけます。セルをクリックすると内訳が右に開きます"
      />
      <WorkloadPanel editableCapacity />
    </div>
  )
}
