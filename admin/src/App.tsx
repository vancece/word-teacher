import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import TeachersPage from './pages/TeachersPage'
import ClassesPage from './pages/classes'
import ClassStudentsPage from './pages/classes/StudentsPage'
import LearningRecordsPage from './pages/LearningRecordsPage'
import ScenesPage from './pages/ScenesPage'
import ProgressPage from './pages/ProgressPage'
import WordPacksPage from './pages/WordPacksPage'
import WordGameRecordsPage from './pages/WordGameRecordsPage'
import AssistantPage from './pages/AssistantPage'
import DevToolsPage from './pages/DevToolsPage'


function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="teachers" element={<TeachersPage />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="classes/:classId/students" element={<ClassStudentsPage />} />
            <Route path="learning-records" element={<LearningRecordsPage />} />
            <Route path="read-aloud-records" element={<Navigate to="/learning-records" replace />} />
            <Route path="scenes" element={<ScenesPage />} />
            <Route path="word-packs" element={<WordPacksPage />} />
            <Route path="game-records" element={<WordGameRecordsPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="devtools" element={<DevToolsPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}

export default App

