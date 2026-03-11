import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Star, Mic2, MessageSquare, Calendar, TrendingUp, Award, ChevronRight, Loader2, Sparkles, RefreshCw } from 'lucide-react'
import { authApi, type ProfileResponse, type LearningRecord } from '../api'
import { useAuth } from '../contexts/AuthContext'
import './ProfilePage.scss'

interface AISummary {
  strengths: string[]
  weaknesses: string[]
  overallComment: string
  suggestions: string[]
}

// 将分数转换为星星数 (0-5)
const scoreToStars = (score: number | null): number => {
  if (score === null || score === undefined) return 0
  return Math.round((score / 100) * 5)
}

// 渲染星星
const StarRating = ({ score, size = 16 }: { score: number | null; size?: number }) => {
  const stars = scoreToStars(score)
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={size}
          className={i <= stars ? 'filled' : 'empty'}
          fill={i <= stars ? '#fbbf24' : 'none'}
        />
      ))}
    </div>
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { student } = useAuth()
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [records, setRecords] = useState<LearningRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'dialogue' | 'readAloud'>('all')
  const [summary, setSummary] = useState<AISummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    loadHistory()
  }, [activeTab])

  const loadData = async () => {
    try {
      const res = await authApi.getProfile()
      if (res.success && res.data) {
        setProfile(res.data)
      }
    } catch (err) {
      console.error('Failed to load profile:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadHistory = async () => {
    try {
      const params: { type?: 'dialogue' | 'readAloud'; pageSize: number } = { pageSize: 50 }
      if (activeTab !== 'all') {
        params.type = activeTab
      }
      const res = await authApi.getLearningHistory(params)
      if (res.success && res.data) {
        setRecords(res.data.items)
      }
    } catch (err) {
      console.error('Failed to load history:', err)
    }
  }

  const loadSummary = async () => {
    try {
      setSummaryLoading(true)
      const res = await authApi.getMySummary()
      if (res.success && res.data) {
        setSummary(res.data)
      }
    } catch (err) {
      console.error('Failed to load summary:', err)
    } finally {
      setSummaryLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="profile-page loading">
        <Loader2 className="spinner" size={32} />
        <p>加载中...</p>
      </div>
    )
  }

  const stats = profile?.stats

  return (
    <div className="profile-page">
      {/* 用户信息卡片 */}
      <div className="profile-card">
        <div className="avatar">
          <User size={40} />
        </div>
        <div className="user-info">
          <h2>{student?.name || '同学'}</h2>
          <p className="class-name">{profile?.user.className || '未分配班级'}</p>
          <p className="join-date">
            <Calendar size={14} />
            加入于 {new Date(profile?.user.createdAt || '').toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* 学习统计 */}
      <div className="stats-section">
        <h3><TrendingUp size={18} /> 学习统计</h3>
        <div className="stats-grid">
          <div className="stat-card dialogue">
            <MessageSquare size={24} />
            <div className="stat-info">
              <span className="label">对话练习</span>
              <span className="value">{stats?.practiceCount || 0} 次</span>
              <div className="score-row">
                <span>平均</span>
                <StarRating score={stats?.practiceAvgScore || null} />
              </div>
            </div>
          </div>
          <div className="stat-card readAloud">
            <Mic2 size={24} />
            <div className="stat-info">
              <span className="label">跟读练习</span>
              <span className="value">{stats?.readAloudCount || 0} 次</span>
              <div className="score-row">
                <span>平均</span>
                <StarRating score={stats?.readAloudAvgScore || null} />
              </div>
            </div>
          </div>
        </div>

        {/* 最佳成绩 */}
        {(stats?.practiceMaxScore || stats?.readAloudMaxScore) && (
          <div className="best-scores">
            <Award size={18} />
            <span>最佳成绩：</span>
            {stats?.practiceMaxScore && (
              <span className="best-item">对话 <StarRating score={stats.practiceMaxScore} size={14} /></span>
            )}
            {stats?.readAloudMaxScore && (
              <span className="best-item">跟读 <StarRating score={stats.readAloudMaxScore} size={14} /></span>
            )}
          </div>
        )}
      </div>

      {/* AI 学习总结 */}
      <div className="summary-section">
        <div className="summary-header">
          <h3><Sparkles size={18} /> AI 学习评价</h3>
          <button
            className="refresh-btn"
            onClick={loadSummary}
            disabled={summaryLoading}
          >
            {summaryLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            {summary ? '刷新' : '获取评价'}
          </button>
        </div>

        {summaryLoading ? (
          <div className="summary-loading">
            <Loader2 className="spin" size={24} />
            <p>AI 正在分析你的学习情况...</p>
          </div>
        ) : summary ? (
          <div className="summary-content">
            <div className="summary-comment">{summary.overallComment}</div>

            {summary.strengths.length > 0 && (
              <div className="summary-item strengths">
                <h4>✨ 你的亮点</h4>
                <ul>
                  {summary.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}

            {summary.weaknesses.length > 0 && (
              <div className="summary-item weaknesses">
                <h4>💪 可以加强</h4>
                <ul>
                  {summary.weaknesses.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}

            {summary.suggestions.length > 0 && (
              <div className="summary-item suggestions">
                <h4>💡 建议</h4>
                <ul>
                  {summary.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="summary-empty">
            <Sparkles size={32} />
            <p>点击上方按钮，让 AI 老师给你一份学习评价吧！</p>
          </div>
        )}
      </div>

      {/* 学习历史 */}
      <div className="history-section">
        <h3>📚 学习历史</h3>
        <div className="tabs">
          <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>全部</button>
          <button className={activeTab === 'dialogue' ? 'active' : ''} onClick={() => setActiveTab('dialogue')}>对话</button>
          <button className={activeTab === 'readAloud' ? 'active' : ''} onClick={() => setActiveTab('readAloud')}>跟读</button>
        </div>

        <div className="records-list">
          {records.length === 0 ? (
            <div className="empty-state">
              <p>暂无学习记录</p>
              <button onClick={() => navigate('/')}>开始学习</button>
            </div>
          ) : (
            records.map(record => (
              <div key={`${record.type}-${record.id}`} className={`record-item ${record.type}`}>
                <div className="record-icon">
                  {record.type === 'dialogue' ? <MessageSquare size={20} /> : <Mic2 size={20} />}
                </div>
                <div className="record-info">
                  <h4>{record.sceneName}</h4>
                  <div className="record-meta">
                    <span className="type-badge">{record.type === 'dialogue' ? '对话' : '跟读'}</span>
                    <span className="date">{new Date(record.createdAt).toLocaleDateString()}</span>
                    <span className={`status ${record.status.toLowerCase()}`}>
                      {record.status === 'COMPLETED' ? '已完成' : '未完成'}
                    </span>
                  </div>
                </div>
                <div className="record-score">
                  {record.status === 'COMPLETED' && record.totalScore !== null ? (
                    <StarRating score={record.totalScore} size={14} />
                  ) : (
                    <span className="no-score">-</span>
                  )}
                </div>
                <ChevronRight size={18} className="arrow" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

