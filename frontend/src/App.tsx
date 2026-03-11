import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.scss'
import Header from './components/Header'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import DialoguePage from './pages/DialoguePage'
import EvaluationPage from './pages/EvaluationPage'
import LoginPage from './pages/LoginPage'
import SceneListPage from './pages/SceneListPage'
import ReadAloudListPage from './pages/ReadAloudListPage'
import ReadAloudPage from './pages/ReadAloudPage'
import ReadAloudEvaluationPage from './pages/ReadAloudEvaluationPage'
import ProfilePage from './pages/ProfilePage'

// 登录页路由守卫（已登录则跳转首页）
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  return (
    <>
      <Header />
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <SceneListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scenes/:sceneId"
          element={
            <ProtectedRoute>
              <DialoguePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/evaluation"
          element={
            <ProtectedRoute>
              <EvaluationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/read-aloud"
          element={
            <ProtectedRoute>
              <ReadAloudListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/read-aloud/:sceneId"
          element={
            <ProtectedRoute>
              <ReadAloudPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/read-aloud-evaluation"
          element={
            <ProtectedRoute>
              <ReadAloudEvaluationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

function App() {
  // 从环境变量获取基础路径
  const basePath = import.meta.env.VITE_BASE_PATH || ''

  return (
    <BrowserRouter basename={basePath}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
