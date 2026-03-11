import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Target, Play, Loader2, RefreshCw, MessageCircle, BookOpen, Mic, Sparkles } from 'lucide-react'
import { sceneApi, readAloudApi, type Scene, type ReadAloudScene } from '../api'
import './SceneListPage.scss'

type Mode = 'dialogue' | 'read-aloud'

export default function SceneListPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('dialogue')
  const [scenes, setScenes] = useState<Scene[]>([])
  const [readAloudScenes, setReadAloudScenes] = useState<ReadAloudScene[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadAllScenes()
  }, [])

  const loadAllScenes = async () => {
    try {
      setIsLoading(true)
      const [dialogueRes, readAloudRes] = await Promise.all([
        sceneApi.list(),
        readAloudApi.getScenes(),
      ])

      if (dialogueRes.success && dialogueRes.data) {
        setScenes(dialogueRes.data)
      }
      setReadAloudScenes(readAloudRes || [])
    } catch (err) {
      setError('加载场景失败，请刷新重试')
      console.error('Failed to load scenes:', err)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <main className="app-shell">
        <div className="loading-state">
          <Loader2 size={32} className="spin" />
          <p>加载中...</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="app-shell">
        <div className="error-state">
          <p>{error}</p>
          <button className="primary-btn" onClick={loadAllScenes}>
            <RefreshCw size={16} />
            重试
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="header-card">
        <div className="header-content">
          <div className="brand-logo">
            <img src={`${import.meta.env.BASE_URL}logo-200.png`} alt="Echo Kid" className="logo-image" />
          </div>
          <div className="header-text">
            <h1 className="brand-title">Echo Kid</h1>
            <p className="brand-slogan">
              <Target size={14} />
              AI 英语口语训练
            </p>
            <p className="header-description">
              AI 陪你练口语，轻松开口说英语！
            </p>
          </div>
        </div>
      </header>

      {/* 模式选择 */}
      <section className="mode-selector">
        <div
          className={`mode-card ${mode === 'dialogue' ? 'active' : ''}`}
          onClick={() => setMode('dialogue')}
        >
          <div className="icon-wrapper">
            <MessageCircle size={28} />
          </div>
          <h3>AI 对话练习</h3>
          <p>和 AI 老师趣味聊英语</p>
          <span className="count">{scenes.length} 个场景</span>
        </div>
        <div
          className={`mode-card ${mode === 'read-aloud' ? 'active' : ''}`}
          onClick={() => setMode('read-aloud')}
        >
          <div className="icon-wrapper">
            <BookOpen size={28} />
          </div>
          <h3>英语跟读</h3>
          <p>朗读句子，纠正发音</p>
          <span className="count">{readAloudScenes.length} 个场景</span>
        </div>
      </section>

      {/* AI 对话场景列表 */}
      {mode === 'dialogue' && (
        <section className="scene-grid">
          {scenes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Sparkles size={48} />
              </div>
              <h3>暂无对话场景</h3>
              <p>老师正在准备精彩的对话场景，敬请期待！</p>
              <div className="empty-hint">
                <MessageCircle size={16} />
                <span>即将上线更多有趣的英语对话</span>
              </div>
            </div>
          ) : (
            scenes.map((scene) => (
              <article
                key={scene.id}
                className="scene-card has-cover"
                onClick={() => navigate(`/scenes/${scene.id}`)}
              >
                {/* 封面图区域 */}
                <div className="cover-wrapper">
                  {scene.coverImage ? (
                    <img src={scene.coverImage} alt={scene.name} className="cover-image" />
                  ) : (
                    <div className="cover-placeholder">
                      <MessageCircle size={36} />
                    </div>
                  )}
                </div>
                {/* 信息区域 */}
                <div className="scene-meta">
                  <h2>{scene.name}</h2>
                  <p>{scene.description}</p>
                  <div className="tags">
                    <span>{scene.grade}</span>
                  </div>
                  <p className="vocab">关键词：{scene.vocabulary.join(', ')}</p>
                </div>
                <div className="play-hint">
                  <Play size={20} />
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {/* 英语跟读场景列表 */}
      {mode === 'read-aloud' && (
        <section className="scene-grid read-aloud-grid">
          {readAloudScenes.length === 0 ? (
            <div className="empty-state read-aloud-empty">
              <div className="empty-icon">
                <Mic size={48} />
              </div>
              <h3>暂无跟读场景</h3>
              <p>老师正在录制标准发音，敬请期待！</p>
              <div className="empty-hint">
                <BookOpen size={16} />
                <span>即将上线更多跟读练习</span>
              </div>
            </div>
          ) : (
            readAloudScenes.map((scene) => (
              <article
                key={scene.id}
                className={`scene-card read-aloud-card ${scene.coverImage ? 'has-cover' : ''}`}
                onClick={() => navigate(`/read-aloud/${scene.id}`)}
              >
                {/* 封面图区域 */}
                <div className="cover-wrapper">
                  {scene.coverImage ? (
                    <img src={scene.coverImage} alt={scene.name} className="cover-image" />
                  ) : (
                    <div className="cover-placeholder read-aloud-placeholder">
                      <Mic size={36} />
                    </div>
                  )}
                </div>
                <div className="scene-meta">
                  <h2>{scene.name}</h2>
                  <p>{scene.description}</p>
                  <div className="tags">
                    <span>{scene.grade}</span>
                    <span>{scene.sentenceCount || scene.sentences?.length || 0} 句</span>
                  </div>
                </div>
                <div className="play-hint">
                  <Play size={20} />
                </div>
              </article>
            ))
          )}
        </section>
      )}
    </main>
  )
}
