import { LogOut, User } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './Header.scss'

export default function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { student, isAuthenticated, logout } = useAuth()

  // 未登录或在登录页时不显示
  if (!isAuthenticated || location.pathname === '/login') {
    return null
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const goHome = () => {
    navigate('/')
  }

  const goProfile = () => {
    navigate('/profile')
  }

  return (
    <header className="app-header">
      <div className="header-left" onClick={goHome}>
        <div className="logo">
          <img src={`${import.meta.env.BASE_URL}logo-200.png`} alt="Echo Kid" />
        </div>
        <div className="brand">
          <h1 className="app-title">Echo Kid</h1>
          <span className="app-slogan">AI 英语口语训练</span>
        </div>
      </div>

      <div className="header-right">
        <div className="user-badge" onClick={goProfile} style={{ cursor: 'pointer' }}>
          <div className="user-avatar">
            <User size={18} />
          </div>
          <div className="user-info">
            <span className="user-name">{student?.name || '同学'}</span>
            <span className="user-role">
              学生{student?.className && ` · ${student.className}`}
            </span>
          </div>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          <LogOut size={16} />
          <span>退出</span>
        </button>
      </div>
    </header>
  )
}

