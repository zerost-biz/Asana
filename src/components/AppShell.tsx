import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { ToastProvider } from './Toast'

export function AppShell() {
  return (
    <ToastProvider>
      <div className="app">
        <Topbar />
        <div className="app__body">
          <Sidebar />
          <main className="app__main">
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
