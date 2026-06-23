import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard,
  Mic2,
  BookOpen,
  LogOut,
  TrendingUp,
  School,
  Users,
  Shield,
  Gamepad2,
  Trophy,
  Sparkles,
  Wrench,
  ScrollText,
  GitCommit,
} from 'lucide-react'
import './Layout.scss'

interface NavItem {
  path: string
  icon: typeof LayoutDashboard
  label: string
  adminOnly?: boolean  // 管理员专属标记
}

export default function Layout() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // 基础菜单项
  const baseNavItems: NavItem[] = [
    { path: '/dashboard', icon: LayoutDashboard, label: '仪表盘' },
    { path: '/assistant', icon: Sparkles, label: '牛马小妹' },
  ]

  // 管理员专属菜单
  const adminOnlyItems: NavItem[] = [
    { path: '/teachers', icon: Users, label: '教师管理', adminOnly: true },
  ]

  // 通用菜单项
  const commonNavItems: NavItem[] = [
    { path: '/classes', icon: School, label: '班级管理' },
    { path: '/learning-records', icon: BookOpen, label: '学习记录' },
    { path: '/game-records', icon: Trophy, label: '游戏记录' },
    { path: '/scenes', icon: Mic2, label: '场景管理' },
    { path: '/word-packs', icon: Gamepad2, label: '游戏管理' },
    { path: '/progress', icon: TrendingUp, label: '进步情况' },
  ]

  // 管理员底部菜单
  const adminBottomItems: NavItem[] = [
    { path: '/logs', icon: ScrollText, label: '系统日志', adminOnly: true },
    { path: '/devtools', icon: Wrench, label: '开发调试', adminOnly: true },
  ]

  // 所有用户可见的底部菜单
  const bottomItems: NavItem[] = [
    { path: '/changelog', icon: GitCommit, label: '更新日志' },
  ]

  // 根据权限组合菜单
  const navItems: NavItem[] = [
    ...baseNavItems,
    ...(isAdmin ? adminOnlyItems : []),
    ...commonNavItems.filter(item => !item.adminOnly || isAdmin),
    ...(isAdmin ? adminBottomItems : []),
    ...bottomItems,
  ]

  // 检查是否在班级相关页面（包括学生管理子页面）
  const isClassesActive = location.pathname.startsWith('/classes')

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src={`${import.meta.env.BASE_URL}logo-200.jpg`} alt="Echo Kid" width={32} height={32} style={{ borderRadius: '6px' }} />
          <h1>Echo Kid</h1>
        </div>
        
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => {
                // 班级管理页面特殊处理：子页面也高亮
                const active = item.path === '/classes' ? isClassesActive : isActive
                return `nav-item ${active ? 'active' : ''}`
              }}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.adminOnly && (
                <span className="admin-badge" title="管理员专属">
                  <Shield size={12} />
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="avatar">{user?.name?.[0] || 'T'}</div>
            <div className="user-details">
              <span className="name">{user?.name}</span>
              <span className={`role ${isAdmin ? 'is-admin' : ''}`}>
                {isAdmin && <Shield size={12} style={{ marginRight: 4 }} />}
                {isAdmin ? '管理员' : '教师'}
              </span>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

