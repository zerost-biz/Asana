import { ClipboardCheck, FileSpreadsheet, Filter, FolderKanban, Gauge, House, Network, Plus, ShieldCheck, UserCheck, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { GlossaryButton } from './GlossaryDialog'
import { useProjectDialog } from './ProjectDialogHost'
import { cx } from './cx'

export function Sidebar() {
  const { derived, can } = useApp()
  const { openCreate } = useProjectDialog()
  const link = ({ isActive }: { isActive: boolean }) => cx('nav__item', isActive && 'is-active')
  const live = derived.summaries.filter((s) => s.project.status !== 'archived')

  return (
    <nav className="sidebar" aria-label="メインナビゲーション">
      <div className="nav">
        <NavLink to="/" end className={link}>
          <House size={18} />
          <span>ホーム</span>
        </NavLink>

        <NavLink to="/pipeline" className={link}>
          <Filter size={18} />
          <span>受注見込み</span>
        </NavLink>

        <div className="nav__row">
          <NavLink to="/projects" end className={link}>
            <FolderKanban size={18} />
            <span>プロジェクト</span>
          </NavLink>
          {can('project.create') && (
            <button type="button" className="nav__add" onClick={openCreate} title="プロジェクトを追加" aria-label="プロジェクトを追加">
              <Plus size={16} />
            </button>
          )}
        </div>
        <div className="nav__sub">
          {live.map((s) => (
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

        <NavLink to="/workload" className={link}>
          <Gauge size={18} />
          <span>稼働状況</span>
        </NavLink>
        <NavLink to="/assignments" className={link}>
          <Network size={18} />
          <span>配置</span>
        </NavLink>
        <NavLink to="/people" className={link}>
          <Users size={18} />
          <span>メンバー</span>
        </NavLink>
        <NavLink to="/my-work" className={link}>
          <UserCheck size={18} />
          <span>自分の作業</span>
        </NavLink>
        <NavLink to="/review" className={link}>
          <ClipboardCheck size={18} />
          <span>週次レビュー</span>
        </NavLink>
        {can('report.export') && (
          <NavLink to="/reports" className={link}>
            <FileSpreadsheet size={18} />
            <span>レポート</span>
          </NavLink>
        )}
        {can('admin.access') && (
          <NavLink to="/admin" className={link}>
            <ShieldCheck size={18} />
            <span>管理</span>
          </NavLink>
        )}
      </div>

      <div className="sidebar__foot">
        <GlossaryButton />
        <div className="sidebar__note">
          <strong>試作版</strong>
          <span>入力内容はこのブラウザに自動保存されます</span>
        </div>
      </div>
    </nav>
  )
}
