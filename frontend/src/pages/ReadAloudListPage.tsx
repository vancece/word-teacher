import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, BookOpen, Loader2 } from 'lucide-react'
import { readAloudApi, type ReadAloudScene } from '../api'
import './ReadAloudListPage.scss'

export default function ReadAloudListPage() {
  const navigate = useNavigate()
  const [scenes, setScenes] = useState<ReadAloudScene[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchScenes = async () => {
      try {
        setIsLoading(true)
        const data = await readAloudApi.getScenes()
        setScenes(data)
      } catch (err) {
        console.error('Failed to fetch scenes:', err)
        setError('加载失败，请重试')
      } finally {
        setIsLoading(false)
      }
    }
    fetchScenes()
  }, [])

  if (isLoading) {
    return (
      <div className="read-aloud-list loading">
        <Loader2 className="spin" size={48} />
        <p>正在加载...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="read-aloud-list error">
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>重试</button>
      </div>
    )
  }

  return (
    <div className="read-aloud-list">
      <header className="page-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={20} />
        </button>
        <h1>英语跟读</h1>
      </header>

      <main className="page-content">
        <p className="intro">选择一个场景，跟着朗读句子，AI 会评估你的发音哦！</p>

        {scenes.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={64} />
            <p>暂无跟读场景</p>
          </div>
        ) : (
          <div className="scene-grid">
            {scenes.map(scene => (
              <div
                key={scene.id}
                className="scene-card"
                onClick={() => navigate(`/read-aloud/${scene.id}`)}
              >
                {scene.coverImage ? (
                  <img src={scene.coverImage} alt={scene.name} className="cover" />
                ) : (
                  <div className="cover placeholder">
                    <BookOpen size={40} />
                  </div>
                )}
                <div className="info">
                  <h3>{scene.name}</h3>
                  <p className="description">{scene.description}</p>
                  <div className="meta">
                    <span className="grade">{scene.grade}</span>
                    <span className="count">{scene.sentenceCount || 0} 句</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

