import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AdminPage } from './pages/AdminPage'
import { AssignmentsPage } from './pages/AssignmentsPage'
import { DashboardPage } from './pages/DashboardPage'
import { EvaluationPage } from './pages/EvaluationPage'
import { MyWorkPage } from './pages/MyWorkPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OpportunityPage } from './pages/OpportunityPage'
import { PipelinePage } from './pages/PipelinePage'
import {
  ProjectCloseRoute,
  ProjectDashboardView,
  ProjectListView,
  ProjectOverviewView,
  ProjectPage,
  ProjectRisksView,
  ProjectTimelineView,
  ProjectWorkloadView,
} from './pages/ProjectPage'
import { PeoplePage } from './pages/PeoplePage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ReviewPage } from './pages/ReviewPage'
import { SkillMatrixPage } from './pages/SkillMatrixPage'
import { TalentProfilePage } from './pages/TalentProfilePage'
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
            <Route path="pipeline" element={<PipelinePage />} />
            <Route path="pipeline/:oppId" element={<OpportunityPage />} />
            <Route path="pipeline/:oppId/evaluation" element={<EvaluationPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:projectId" element={<ProjectPage />}>
              <Route index element={<ProjectOverviewView />} />
              <Route path="wbs" element={<ProjectListView />} />
              <Route path="timeline" element={<ProjectTimelineView />} />
              <Route path="dashboard" element={<ProjectDashboardView />} />
              <Route path="workload" element={<ProjectWorkloadView />} />
              <Route path="risks" element={<ProjectRisksView />} />
              <Route path="close" element={<ProjectCloseRoute />} />
            </Route>
            <Route path="my-work" element={<MyWorkPage />} />
            <Route path="workload" element={<WorkloadPage />} />
            <Route path="assignments" element={<AssignmentsPage />} />
            <Route path="people" element={<PeoplePage />} />
            <Route path="people/skills" element={<SkillMatrixPage />} />
            <Route path="people/:userId" element={<TalentProfilePage />} />
            <Route path="review" element={<ReviewPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AppProvider>
    </Router>
  )
}
