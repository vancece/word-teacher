import { useState, useEffect } from 'react'
import { X, Mic2, Clock, Star, CheckCircle, AlertCircle, ThumbsUp, Lightbulb } from 'lucide-react'
import { adminApi, type ReadAloudRecordDetail } from '../api/admin'
import './ReadAloudDetailModal.scss'

interface Props {
  studentId: number
  recordId: number
  studentName: string
  onClose: () => void
}

export default function ReadAloudDetailModal({ studentId, recordId, studentName, onClose }: Props) {
  const [data, setData] = useState<ReadAloudRecordDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDetail()
  }, [recordId])

  const loadDetail = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const result = await adminApi.getReadAloudRecordDetail(studentId, recordId)
      setData(result)
    } catch (err: any) {
      console.error('Failed to load read-aloud record:', err)
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

  const renderStars = (score: number | null) => {
    if (score == null) return '-'
    return '★'.repeat(score) + '☆'.repeat(5 - score)
  }

  return (
    <div className="readaloud-detail-overlay" onClick={onClose}>
      <div className="readaloud-detail-content" onClick={(e) => e.stopPropagation()}>
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
                  <Mic2 size={20} />
                  {data.scene?.name || '跟读练习'}
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
                  <span className="score-value">{renderStars(data.totalScore)}</span>
                  <span className="score-num">{data.totalScore}/5</span>
                </div>
                <div className="sub-scores">
                  {data.intonationScore != null && (
                    <div className="sub-score-item">
                      <span className="label">语音语调</span>
                      <span className="value">{renderStars(data.intonationScore)}</span>
                    </div>
                  )}
                  {data.fluencyScore != null && (
                    <div className="sub-score-item">
                      <span className="label">流利连贯</span>
                      <span className="value">{renderStars(data.fluencyScore)}</span>
                    </div>
                  )}
                  {data.accuracyScore != null && (
                    <div className="sub-score-item">
                      <span className="label">准确完整</span>
                      <span className="value">{renderStars(data.accuracyScore)}</span>
                    </div>
                  )}
                  {data.expressionScore != null && (
                    <div className="sub-score-item">
                      <span className="label">情感表现</span>
                      <span className="value">{renderStars(data.expressionScore)}</span>
                    </div>
                  )}
                </div>
                <div className="extra-info">
                  <span>
                    <CheckCircle size={14} />
                    {data.completedCount}/{data.totalCount} 句
                  </span>
                  {data.durationSeconds != null && (
                    <span><Clock size={14} /> {formatDuration(data.durationSeconds)}</span>
                  )}
                </div>
              </div>
            )}

            {/* AI 反馈 */}
            {data.feedback && (
              <div className="feedback-section">
                <h4>AI 评语</h4>
                <p>{data.feedback}</p>
              </div>
            )}

            {/* 亮点和建议 */}
            {(data.strengths?.length || data.improvements?.length) ? (
              <div className="tips-section">
                {data.strengths && data.strengths.length > 0 && (
                  <div className="tip-group strengths">
                    <h4><ThumbsUp size={14} /> 亮点</h4>
                    <ul>
                      {data.strengths.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {data.improvements && data.improvements.length > 0 && (
                  <div className="tip-group improvements">
                    <h4><Lightbulb size={14} /> 建议</h4>
                    <ul>
                      {data.improvements.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}

            {/* 每句详情 */}
            {data.sentenceResults && data.sentenceResults.length > 0 && (
              <div className="sentences-section">
                <h4>逐句详情</h4>
                <div className="sentence-list">
                  {data.sentenceResults.map((s, i) => (
                    <div key={i} className="sentence-item">
                      <div className="sentence-header">
                        <span className="index">#{i + 1}</span>
                        {s.accuracy != null && (
                          <span className={`accuracy ${s.accuracy >= 80 ? 'good' : s.accuracy >= 60 ? 'fair' : 'poor'}`}>
                            {s.accuracy >= 80 ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                            {s.accuracy}%
                          </span>
                        )}
                      </div>
                      <div className="sentence-body">
                        <div className="english">{s.english}</div>
                        {s.chinese && <div className="chinese">{s.chinese}</div>}
                        {s.spokenText && (
                          <div className="spoken">
                            <span className="spoken-label">学生说：</span>
                            {s.spokenText}
                          </div>
                        )}
                        {s.feedback && <div className="sentence-feedback">{s.feedback}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
