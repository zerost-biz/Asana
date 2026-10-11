import { NavLink } from 'react-router-dom'
import { cx } from './cx'

/** メンバー画面の上部タブ（メンバー一覧 / スキルマップ） */
export function PeopleTabs() {
  const link = ({ isActive }: { isActive: boolean }) => cx('tabs__tab', isActive && 'is-active')
  return (
    <div className="tabs tabs--page" role="tablist">
      <NavLink to="/people" end className={link} role="tab">
        メンバー一覧
      </NavLink>
      <NavLink to="/people/skills" className={link} role="tab">
        スキルマップ
      </NavLink>
    </div>
  )
}
