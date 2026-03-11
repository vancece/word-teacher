import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Lock, LogIn, Mic, BookOpen, Trophy, Sparkles } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import './LoginPage.scss'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const [loginForm, setLoginForm] = useState({ studentNo: '', password: '' })

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await login(loginForm)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查学号和密码')
    } finally {
      setIsLoading(false)
    }
  }

  const bgStyle = {
    backgroundImage: `url(${import.meta.env.BASE_URL}login-bg.jpg)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };

  return (
    <main className="login-page" style={bgStyle}>
      <div className="login-container">
        {/* 左侧介绍区域 */}
        <div className="intro-section">
          <div className="intro-content">
            <div className="brand">
              <img src={`${import.meta.env.BASE_URL}logo-200.png`} alt="Echo Kid" className="brand-logo" />
              <h1>Echo Kid</h1>
            </div>
            <p className="tagline">让每个孩子都能自信开口说英语</p>

            <div className="features">
              <div className="feature-item">
                <div className="feature-icon">
                  <Mic size={20} />
                </div>
                <div className="feature-text">
                  <h3>AI 对话练习</h3>
                  <p>智能语音交互，模拟真实对话场景</p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">
                  <BookOpen size={20} />
                </div>
                <div className="feature-text">
                  <h3>跟读训练</h3>
                  <p>标准发音示范，纠正口语发音</p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">
                  <Trophy size={20} />
                </div>
                <div className="feature-text">
                  <h3>学习报告</h3>
                  <p>详细评分反馈，见证每一次进步</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧登录卡片 */}
        <div className="login-section">
          <div className="login-card">
            <div className="login-header">
              <Sparkles className="header-icon" size={24} />
              <h2>学生登录</h2>
              <p>欢迎回来，继续你的英语学习之旅！</p>
            </div>

            {error && <div className="error-message">{error}</div>}

            <form onSubmit={handleLogin} className="login-form">
              <div className="input-group">
                <div className="input-icon">
                  <User size={18} />
                </div>
                <input
                  id="studentNo"
                  type="text"
                  placeholder="请输入学号"
                  value={loginForm.studentNo}
                  onChange={(e) => setLoginForm({ ...loginForm, studentNo: e.target.value })}
                  required
                />
              </div>
              <div className="input-group">
                <div className="input-icon">
                  <Lock size={18} />
                </div>
                <input
                  id="password"
                  type="password"
                  placeholder="请输入密码"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  required
                />
              </div>
              <button type="submit" className="submit-btn" disabled={isLoading}>
                {isLoading ? (
                  <span className="loading-text">登录中...</span>
                ) : (
                  <>
                    <LogIn size={18} />
                    <span>开始学习</span>
                  </>
                )}
              </button>
            </form>

            <p className="login-hint">账号由老师创建，忘记密码请联系老师</p>
          </div>
        </div>
      </div>

      <footer className="login-footer">
        <span>Word Teacher</span>
      </footer>
    </main>
  )
}

