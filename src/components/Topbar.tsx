import { ChevronRight, RotateCcw, Settings } from 'lucide-react'
import { useState } from 'react'
import { Link, useMatch } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { Avatar } from './Avatar'
import { ConfirmDialog } from './ConfirmDialog'
import { Popover } from './Popover'
import { SearchBox } from './SearchBox'
import { useToast } from './Toast'
import { cx } from './cx'

export function Topbar() {
  const { data, derived, actions } = useApp()
  const { toast } = useToast()
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
            <button type="button" className={cx('icon-btn', open && 'is-active')} onClick={toggle} aria-label="設定">
              <Settings size={18} />
            </button>
          )}
        >
          {(close) => (
            <div className="menu">
              <div className="menu__title">設定</div>
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
              <div className="menu__note">
                変更内容はこのブラウザの localStorage に保存されています。初期化するとサンプルデータに戻ります。
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
              <div className="menu__title">操作ユーザー（My Work の対象）</div>
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
                  {u.name}
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
          WBS・工数入力（TimeEntry）・ETC・進捗・日付など、これまでの変更はすべて破棄され、サンプルデータへ戻ります。
        </ConfirmDialog>
      )}
    </header>
  )
}
