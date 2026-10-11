import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * タスクドロワーの開閉状態を URL の ?task= に持たせる。
 *   ?task=<wbsId>              : 編集
 *   ?task=new[&parent=<wbsId>] : 新規作成
 * List / Timeline / Dashboard など複数ビューで同じドロワーを共有でき、
 * 他画面（Dashboard の判断カード等）から特定タスクを開いた状態で遷移できる。
 */
export function useTaskParam() {
  const [params, setParams] = useSearchParams()
  const task = params.get('task')
  const parent = params.get('parent')

  const open = useCallback(
    (id: string) => {
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.set('task', id)
          n.delete('parent')
          return n
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const openNew = useCallback(
    (parentId?: string | null) => {
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.set('task', 'new')
          if (parentId) n.set('parent', parentId)
          else n.delete('parent')
          return n
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const close = useCallback(() => {
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('task')
        n.delete('parent')
        return n
      },
      { replace: true },
    )
  }, [setParams])

  return { task, parent, open, openNew, close }
}
