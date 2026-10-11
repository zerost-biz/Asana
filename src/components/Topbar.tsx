import { Bell, ChevronRight, RotateCcw, Settings, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useMatch, useNavigate } from 'react-router-dom'
import { ROLE_LABEL } from '../domain/types'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { ConfirmDialog } from './ConfirmDialog'
import { GlossaryButton } from './GlossaryDialog'
import { Popover } from './Popover'
import { SearchBox } from './SearchBox'
import { useToast } from './Toast'
import { cx } from './cx'

export function Topbar() {
  const { data, derived, actions, can } = useApp()
  const { toast } = useToast()
  const navigate = useNavigate()
  const match = useMatch('/projects/:projectId/*')
  const project = match?.params.projectId ? derived.projectById.get(match.params.projectId) : undefined
  const me = derived.userById.get(data.currentUserId)
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="Project Delivery OS ホーム">
        <span className="brand__logo">
          <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
            <path d="M9 21.5V10.5M9 10.5h9.5a3.5 3.5 0 0 1 0 7H9" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="22.5" cy="22" r="2.3" fill="#fff" />
          </svg>
        </span>
        <span className="brand__name">Project Delivery OS</span>
      </Link>

      <div className="topbar__crumb">
        {project && (
          <>
            <ChevronRight size={16} className="topbar__sep" />
            <span className="topbar__project">{project.name}</span>
          </>
        )}
      </div>

      <SearchBox />

      <div className="topbar__right">
        <Popover
          align="right"
          trigger={({ toggle, open }) => (
            <button type="button" className={cx('icon-btn', 'bell', open && 'is-active')} onClick={toggle} aria-label={`通知 ${derived.alerts.length}件`}>
              <Bell size={18} />
              {derived.alerts.length > 0 && (
                <span className={cx('bell__badge', derived.alerts.some((a) => a.tone === 'critical') && 'is-critical')}>
                  {derived.alerts.length > 99 ? '99+' : derived.alerts.length}
                </span>
              )}
            </button>
          )}
        >
          {(close) => (
            <div className="menu menu--wide" role="dialog" aria-label="通知">
              <div className="menu__title">通知（{derived.alerts.length}件）</div>
              {derived.alerts.length === 0 && <div className="menu__note">通知はありません</div>}
              <ul className="alerts">
                {derived.alerts.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className={cx('alerts__item', `alerts__item--${a.tone}`)}
                      onClick={() => {
                        close()
                        navigate(a.to)
                      }}
                    >
                      <strong>{a.title}</strong>
                      <span>{a.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Popover>

        <Popover
          align="right"
          trigger={({ toggle, open }) => (
            <button type="button" className={cx('icon-btn', open && 'is-active')} onClick={toggle} aria-label="設定">
              <Settings size={18} />
            </button>
          )}
        >
          {(close) => (
            <div className="menu">
              <div className="menu__title">設定</div>
              {can('admin.access') && (
                <button
                  type="button"
                  className="menu__item"
                  onClick={() => {
                    close()
                    navigate('/admin')
                  }}
                >
                  <ShieldCheck size={16} />
                  管理（メンバー・単価・スキル・設定）
                </button>
              )}
              <button
                type="button"
                className="menu__item"
                onClick={() => {
                  close()
                  setConfirmReset(true)
                }}
              >
                <RotateCcw size={16} />
                デモデータを初期化
              </button>
              <div className="menu__row">
                <GlossaryButton />
              </div>
              <div className="menu__note">
                変更内容はこのブラウザの中に自動で保存されています。初期化するとサンプルデータに戻ります。
              </div>
            </div>
          )}
        </Popover>

        <Popover
          align="right"
          trigger={({ toggle, open }) => (
            <button type="button" className={cx('user-chip', open && 'is-active')} onClick={toggle} aria-label="ユーザー切替">
              <Avatar user={me} size="md" />
              <span className="user-chip__name">{me?.name}</span>
            </button>
          )}
        >
          {(close) => (
            <div className="menu">
              <div className="menu__title">操作ユーザー（権限が切り替わります）</div>
              {data.users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={cx('menu__item', u.id === data.currentUserId && 'is-selected')}
                  onClick={() => {
                    actions.setCurrentUser(u.id)
                    close()
                  }}
                >
                  <Avatar user={u} size="sm" />
                  <span className="menu__who">
                    {u.name}
                    <small>{ROLE_LABEL[u.role]}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Popover>
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="デモデータを初期化しますか？"
          confirmLabel="初期化する"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            actions.resetDemo()
            setConfirmReset(false)
            toast('デモデータを初期化しました', 'info')
          }}
        >
          作業項目・作業時間の記録・残り・進捗・日付など、これまでの変更はすべて破棄され、サンプルデータへ戻ります。
        </ConfirmDialog>
      )}
    </header>
  )
}
