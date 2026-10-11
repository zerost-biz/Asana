import { Info } from 'lucide-react'
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { isStorageAvailable } from '../store/persistence'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { ToastProvider } from './Toast'

export function AppShell() {
  // プレビュー用 iframe など localStorage が使えない環境では、保存されないことを明示する
  const [volatile] = useState(() => !isStorageAvailable())
  return (
    <ToastProvider>
      <div className="app">
        <Topbar />
        <div className="app__body">
          <Sidebar />
          <main className="app__main">
            {volatile && (
              <div className="banner" role="status">
                <Info size={15} />
                この表示環境ではブラウザ保存（localStorage）が使えないため、入力内容はこのページを閉じるまでの一時的なものです。保存して使うには <code>npm run dev</code> で起動してください。
              </div>
            )}
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
