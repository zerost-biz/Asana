import { FolderKanban, ListChecks, Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'

/** プロジェクト名・タスク名の簡易検索（選択すると該当PJ/タスクを開く） */
export function SearchBox() {
  const { data, derived } = useApp()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const query = q.trim().toLowerCase()
  const results = useMemo(() => {
    if (!query) return { projects: [], tasks: [] }
    const projects = data.projects.filter((p) => p.name.toLowerCase().includes(query)).slice(0, 4)
    const tasks = derived.leaves
      .filter((l) => l.title.toLowerCase().includes(query))
      .slice(0, 6)
    return { projects, tasks }
  }, [query, data.projects, derived.leaves])

  const go = (to: string) => {
    navigate(to)
    setQ('')
    inputRef.current?.blur()
  }

  const show = focused && query.length > 0
  const empty = results.projects.length + results.tasks.length === 0

  return (
    <div className="search">
      <Search size={16} className="search__icon" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => e.key === 'Escape' && (setQ(''), inputRef.current?.blur())}
        placeholder="プロジェクト・タスクを検索"
        aria-label="検索"
      />
      {show && (
        <div className="search__panel" onMouseDown={(e) => e.preventDefault()}>
          {empty && <div className="search__empty">「{q}」に一致する項目はありません</div>}
          {results.projects.map((p) => (
            <button key={p.id} type="button" className="search__item" onClick={() => go(`/projects/${p.id}`)}>
              <FolderKanban size={15} />
              <span>{p.name}</span>
              <em>プロジェクト</em>
            </button>
          ))}
          {results.tasks.map((t) => (
            <button key={t.id} type="button" className="search__item" onClick={() => go(`/projects/${t.projectId}?task=${t.id}`)}>
              <ListChecks size={15} />
              <span>
                {derived.numbers.get(t.id)} {t.title}
              </span>
              <em>{derived.summaryById.get(t.projectId)?.shortName}</em>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
