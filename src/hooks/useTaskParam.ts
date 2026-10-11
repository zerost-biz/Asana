import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * タスクドロワーの開閉状態を URL の ?task= に持たせる。
 *   ?task=<wbsId>              : 編集
 *   ?task=new[&parent=<wbsId>][&type=milestone] : 新規作成
 * List / Timeline / Dashboard など複数ビューで同じドロワーを共有でき、
 * 他画面（Dashboard の判断カード等）から特定タスクを開いた状態で遷移できる。
 */
export function useTaskParam() {
  const [params, setParams] = useSearchParams()
  const task = params.get('task')
  const parent = params.get('parent')
  const newType: 'task' | 'milestone' = params.get('type') === 'milestone' ? 'milestone' : 'task'

  const open = useCallback(
    (id: string) => {
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.set('task', id)
          n.delete('parent')
          n.delete('type')
          return n
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const openNew = useCallback(
    (parentId?: string | null, type: 'task' | 'milestone' = 'task') => {
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.set('task', 'new')
          if (parentId) n.set('parent', parentId)
          else n.delete('parent')
          if (type === 'milestone') n.set('type', 'milestone')
          else n.delete('type')
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
        n.delete('type')
        return n
      },
      { replace: true },
    )
  }, [setParams])

  return { task, parent, newType, open, openNew, close }
}
