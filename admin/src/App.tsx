import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import TeachersPage from './pages/TeachersPage'
import ClassesPage from './pages/classes'
import ClassStudentsPage from './pages/classes/StudentsPage'
import ReadAloudRecordsPage from './pages/ReadAloudRecordsPage'
import ScenesPage from './pages/ScenesPage'
import ProgressPage from './pages/ProgressPage'

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
            <Route path="read-aloud-records" element={<ReadAloudRecordsPage />} />
            <Route path="scenes" element={<ScenesPage />} />
            <Route path="progress" element={<ProgressPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}

export default App

