import { FolderKanban, Gauge, House, Plus, UserCheck } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { useProjectDialog } from './ProjectDialogHost'
import { cx } from './cx'

export function Sidebar() {
  const { derived } = useApp()
  const { openCreate } = useProjectDialog()
  const link = ({ isActive }: { isActive: boolean }) => cx('nav__item', isActive && 'is-active')

  return (
    <nav className="sidebar" aria-label="メインナビゲーション">
      <div className="nav">
        <NavLink to="/" end className={link}>
          <House size={18} />
          <span>Home</span>
        </NavLink>

        <div className="nav__row">
          <NavLink to="/projects" end className={link}>
            <FolderKanban size={18} />
            <span>Projects</span>
          </NavLink>
          <button type="button" className="nav__add" onClick={openCreate} title="プロジェクトを追加" aria-label="プロジェクトを追加">
            <Plus size={16} />
          </button>
        </div>
        <div className="nav__sub">
          {derived.summaries.map((s) => (
            <NavLink
              key={s.project.id}
              to={`/projects/${s.project.id}`}
              className={({ isActive }) => cx('nav__subitem', isActive && 'is-active')}
            >
              <span className={cx('dot', `dot--${s.health.health.toLowerCase()}`)} />
              <span className="nav__subname">{s.project.name}</span>
            </NavLink>
          ))}
        </div>

        <NavLink to="/my-work" className={link}>
          <UserCheck size={18} />
          <span>My Work</span>
        </NavLink>
        <NavLink to="/workload" className={link}>
          <Gauge size={18} />
          <span>Workload</span>
        </NavLink>
      </div>

      <div className="sidebar__foot">
        <div className="sidebar__note">
          <strong>Prototype</strong>
          <span>入力内容はこのブラウザに自動保存されます</span>
        </div>
      </div>
    </nav>
  )
}
