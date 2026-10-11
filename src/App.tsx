import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { MyWorkPage } from './pages/MyWorkPage'
import { NotFoundPage } from './pages/NotFoundPage'
import {
  ProjectDashboardView,
  ProjectListView,
  ProjectPage,
  ProjectTimelineView,
  ProjectWorkloadView,
} from './pages/ProjectPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { WorkloadPage } from './pages/WorkloadPage'
import { AppProvider } from './store/AppContext'

// 単一HTMLビルド（--mode single）では URL に依存しないメモリルーターを使う
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : BrowserRouter

export default function App() {
  return (
    <Router>
      <AppProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:projectId" element={<ProjectPage />}>
              <Route index element={<ProjectListView />} />
              <Route path="timeline" element={<ProjectTimelineView />} />
              <Route path="dashboard" element={<ProjectDashboardView />} />
              <Route path="workload" element={<ProjectWorkloadView />} />
            </Route>
            <Route path="my-work" element={<MyWorkPage />} />
            <Route path="workload" element={<WorkloadPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AppProvider>
    </Router>
  )
}
