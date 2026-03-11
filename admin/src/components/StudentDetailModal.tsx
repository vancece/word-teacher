import { useState, useEffect } from 'react'
import { X, Mic2, MessageSquare, TrendingUp } from 'lucide-react'
import { adminApi } from '../api'
import './StudentDetailModal.scss'

interface Props {
  studentId: number
  onClose: () => void
}

interface StudentDetail {
  student: {
    id: number
    username: string
    name: string
    className?: string
    createdAt: string
  }
  readAloudRecords: Array<{
    id: number
    totalScore?: number
    completedCount: number
    totalCount: number
    createdAt: string
    scene?: { name: string }
  }>
  practiceRecords: Array<{
    id: number
    totalScore?: number
    roundsCompleted?: number
    createdAt: string
    scene?: { name: string }
  }>
}

export default function StudentDetailModal({ studentId, onClose }: Props) {
  const [data, setData] = useState<StudentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadStudent()
  }, [studentId])

  const loadStudent = async () => {
    try {
      const result = await adminApi.getStudentDetail(studentId)
      setData(result)
    } catch (err) {
      console.error('Failed to load student:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // 计算进步趋势
  const getProgressTrend = () => {
    if (!data?.readAloudRecords || data.readAloudRecords.length < 2) return null
    const scores = data.readAloudRecords
      .filter(r => r.totalScore != null)
      .map(r => r.totalScore!)
    if (scores.length < 2) return null
    const recent = scores.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, scores.length)
    const older = scores.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, scores.length)
    return recent - older
  }

  const trend = getProgressTrend()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>
          <X size={24} />
        </button>

        {isLoading ? (
          <div className="loading">加载中...</div>
        ) : data ? (
          <>
            <div className="student-header">
              <div className="avatar">{data.student.name[0]}</div>
              <div className="info">
                <h2>{data.student.name}</h2>
                <p>学号: {data.student.username} | 班级: {data.student.className || '-'}</p>
              </div>
            </div>

            <div className="stats-row">
              <div className="stat-item">
                <Mic2 size={20} />
                <span className="value">{data.readAloudRecords.length}</span>
                <span className="label">跟读练习</span>
              </div>
              <div className="stat-item">
                <MessageSquare size={20} />
                <span className="value">{data.practiceRecords.length}</span>
                <span className="label">对话练习</span>
              </div>
              {trend !== null && (
                <div className={`stat-item ${trend >= 0 ? 'positive' : 'negative'}`}>
                  <TrendingUp size={20} />
                  <span className="value">{trend >= 0 ? '+' : ''}{trend.toFixed(1)}</span>
                  <span className="label">进步趋势</span>
                </div>
              )}
            </div>

            <div className="records-section">
              <h3><MessageSquare size={16} /> 最近对话练习</h3>
              {data.practiceRecords.length === 0 ? (
                <p className="empty">暂无记录</p>
              ) : (
                <div className="record-list">
                  {data.practiceRecords.slice(0, 10).map((record) => (
                    <div key={record.id} className="record-item">
                      <span className="scene">{record.scene?.name || '未知场景'}</span>
                      <span className="score">{record.totalScore ?? '-'}分</span>
                      <span className="date">
                        {new Date(record.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="records-section">
              <h3><Mic2 size={16} /> 最近跟读练习</h3>
              {data.readAloudRecords.length === 0 ? (
                <p className="empty">暂无记录</p>
              ) : (
                <div className="record-list">
                  {data.readAloudRecords.slice(0, 10).map((record) => (
                    <div key={record.id} className="record-item">
                      <span className="scene">{record.scene?.name || '未知场景'}</span>
                      <span className="score">{record.totalScore ?? '-'}分</span>
                      <span className="date">
                        {new Date(record.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="error">加载失败</div>
        )}
      </div>
    </div>
  )
}

