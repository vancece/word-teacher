import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Form, Input, Button, Alert } from 'antd'
import { UserOutlined, LockOutlined, TeamOutlined, BarChartOutlined, BookOutlined, SettingOutlined } from '@ant-design/icons'
import './LoginPage.scss'

interface LoginFormValues {
  username: string
  password: string
}

export default function LoginPage() {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const handleSubmit = async (values: LoginFormValues) => {
    setError('')
    setIsLoading(true)

    try {
      await login(values.username, values.password)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || '登录失败')
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
    <div className="login-page" style={bgStyle}>
      <div className="login-container">
        {/* 左侧介绍区域 */}
        <div className="intro-section">
          <div className="intro-content">
            <div className="brand">
              <img src={`${import.meta.env.BASE_URL}logo-200.png`} alt="Echo Kid" className="brand-logo" />
              <h1>Echo Kid</h1>
            </div>
            <p className="tagline">教师管理后台</p>
            <p className="description">轻松管理学生、发布任务、追踪学习进度</p>

            <div className="features">
              <div className="feature-item">
                <div className="feature-icon">
                  <TeamOutlined />
                </div>
                <div className="feature-text">
                  <h3>学生管理</h3>
                  <p>批量导入学生，分班管理</p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">
                  <BookOutlined />
                </div>
                <div className="feature-text">
                  <h3>任务发布</h3>
                  <p>创建练习任务，设置截止时间</p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">
                  <BarChartOutlined />
                </div>
                <div className="feature-text">
                  <h3>数据统计</h3>
                  <p>查看班级学习报告和排行</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧登录区域 */}
        <div className="login-section">
          <div className="login-card">
            <div className="login-header">
              <SettingOutlined className="header-icon" />
              <h2>教师登录</h2>
              <p>欢迎回来，开始管理您的班级</p>
            </div>

            {error && (
              <Alert
                message={error}
                type="error"
                showIcon
                closable
                onClose={() => setError('')}
                className="error-alert"
              />
            )}

            <Form
              form={form}
              name="login"
              onFinish={handleSubmit}
              autoComplete="off"
              layout="vertical"
              size="large"
            >
              <Form.Item
                name="username"
                rules={[{ required: true, message: '请输入账号' }]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="请输入教师账号"
                  styles={{
                    root: {
                      height: 48,
                      borderRadius: 12,
                      border: '2px solid #e2e8f0',
                      background: '#f8fafc',
                      fontSize: 14,
                      padding: '0 14px',
                    },
                  }}
                />
              </Form.Item>

              <Form.Item
                name="password"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="请输入密码"
                  styles={{
                    root: {
                      height: 48,
                      borderRadius: 12,
                      border: '2px solid #e2e8f0',
                      background: '#f8fafc',
                      fontSize: 14,
                      padding: '0 14px',
                    },
                  }}
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={isLoading}
                  block
                  style={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    border: 'none',
                    height: 46,
                    fontSize: 15,
                    fontWeight: 600,
                    borderRadius: 12,
                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                  }}
                >
                  登录后台
                </Button>
              </Form.Item>
            </Form>

            <p className="login-hint">如需账号请联系管理员</p>
          </div>
        </div>
      </div>

      <footer className="login-footer">
        <span>Word Teacher Admin</span>
      </footer>
    </div>
  )
}

