import { Box, Diamond, FolderTree, SquareCheck } from 'lucide-react'
import type { WbsType } from '../domain/types'
import { WBS_TYPE_LABEL } from '../domain/types'

/** 作業項目の種別アイコン（フェーズ / 作業パッケージ / タスク / マイルストーン） */
export function WbsTypeIcon({ type, size = 14 }: { type: WbsType; size?: number }) {
  const props = { size, className: `wtype wtype--${type}`, 'aria-label': WBS_TYPE_LABEL[type] }
  switch (type) {
    case 'phase':
      return <FolderTree {...props} />
    case 'work_package':
      return <Box {...props} />
    case 'milestone':
      return <Diamond {...props} />
    default:
      return <SquareCheck {...props} />
  }
}
