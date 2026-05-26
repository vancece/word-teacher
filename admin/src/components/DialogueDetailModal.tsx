import { useState, useEffect } from 'react'
import { X, Bot, User, Clock, Star, MessageSquare } from 'lucide-react'
import { adminApi, type PracticeRecordDetail } from '../api/admin'
import './DialogueDetailModal.scss'

interface Props {
  studentId: number
  recordId: number
  studentName: string
  onClose: () => void
}

export default function DialogueDetailModal({ studentId, recordId, studentName, onClose }: Props) {
  const [data, setData] = useState<PracticeRecordDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDetail()
  }, [recordId])

  const loadDetail = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const result = await adminApi.getPracticeRecordDetail(studentId, recordId)
      setData(result)
    } catch (err: any) {
      console.error('Failed to load practice record:', err)
      setError(err?.message || '加载失败')
    } finally {
      setIsLoading(false)
    }
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-'
    const min = Math.floor(seconds / 60)
    const sec = seconds % 60
    return `${min}分${sec}秒`
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="dialogue-detail-overlay" onClick={onClose}>
      <div className="dialogue-detail-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>
          <X size={24} />
        </button>

        {isLoading ? (
          <div className="loading">加载中...</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : data ? (
          <>
            {/* 头部信息 */}
            <div className="detail-header">
              <div className="header-main">
                <h2>
                  <MessageSquare size={20} />
                  {data.scene?.name || '对话练习'}
                </h2>
                <p className="meta">
                  {studentName} · {new Date(data.createdAt).toLocaleString('zh-CN')}
                </p>
              </div>
            </div>

            {/* 评分区域 */}
            {data.totalScore != null && (
              <div className="scores-section">
                <div className="total-score">
                  <Star size={18} />
                  <span className="score-value">{data.totalScore}</span>
                  <span className="score-label">总分</span>
                </div>
                <div className="sub-scores">
                  {data.pronunciationScore != null && (
                    <div className="sub-score-item">
                      <span className="label">发音</span>
                      <span className="value">{data.pronunciationScore}</span>
                    </div>
                  )}
                  {data.fluencyScore != null && (
                    <div className="sub-score-item">
                      <span className="label">流利度</span>
                      <span className="value">{data.fluencyScore}</span>
                    </div>
                  )}
                  {data.grammarScore != null && (
                    <div className="sub-score-item">
                      <span className="label">语法</span>
                      <span className="value">{data.grammarScore}</span>
                    </div>
                  )}
                </div>
                <div className="extra-info">
                  {data.roundsCompleted != null && (
                    <span><MessageSquare size={14} /> {data.roundsCompleted} 轮对话</span>
                  )}
                  {data.durationSeconds != null && (
                    <span><Clock size={14} /> {formatDuration(data.durationSeconds)}</span>
                  )}
                </div>
              </div>
            )}

            {/* AI 反馈 */}
            {data.feedbackText && (
              <div className="feedback-section">
                <h4>AI 评价</h4>
                <p>{data.feedbackText}</p>
              </div>
            )}

            {/* 对话历史 */}
            <div className="dialogue-section">
              <h4>对话详情</h4>
              {data.dialogueHistory && data.dialogueHistory.length > 0 ? (
                <div className="dialogue-messages">
                  {data.dialogueHistory.map((msg) => (
                    <div key={msg.id} className={`message-bubble ${msg.role}`}>
                      <div className="avatar">
                        {msg.role === 'ai' ? <Bot size={16} /> : <User size={16} />}
                      </div>
                      <div className="bubble-content">
                        <div className="bubble-text">{msg.text}</div>
                        {msg.translation && (
                          <div className="bubble-translation">{msg.translation}</div>
                        )}
                        <div className="bubble-time">{formatTime(msg.timestamp)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">暂无对话记录</p>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
