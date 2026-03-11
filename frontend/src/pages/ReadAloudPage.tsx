import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, Square } from 'lucide-react'
import { readAloudApi, type ReadAloudSentence, type SentenceEvaluation } from '../api'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import BackButton from '../components/BackButton'
import SentenceCard from '../components/SentenceCard'
import './ReadAloudPage.scss'

export default function ReadAloudPage() {
  const { sceneId } = useParams()
  const navigate = useNavigate()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [recordId, setRecordId] = useState<number | null>(null)
  const [sceneName, setSceneName] = useState('')
  const [sentences, setSentences] = useState<ReadAloudSentence[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [results, setResults] = useState<(SentenceEvaluation | null)[]>([])
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [isScoring, setIsScoring] = useState(false)

  const audioRecorder = useAudioRecorder()
  const listRef = useRef<HTMLDivElement>(null)

  // 初始化
  useEffect(() => {
    if (!sceneId) return

    const init = async () => {
      try {
        setIsLoading(true)
        const response = await readAloudApi.start(sceneId)
        setRecordId(response.recordId)
        setSceneName(response.scene.name)
        setSentences(response.scene.sentences)
        setResults(new Array(response.scene.sentences.length).fill(null))
      } catch (err) {
        console.error('Failed to start read-aloud:', err)
        setError('加载失败，请重试')
      } finally {
        setIsLoading(false)
      }
    }

    init()
  }, [sceneId])

  // 当前句子变化时，滚动到可见区域
  useEffect(() => {
    const activeCard = listRef.current?.querySelector('.sentence-card.active')
    activeCard?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentIndex])

  // 处理录音按钮点击
  const handleRecordClick = async () => {
    if (audioRecorder.isRecording) {
      // 停止录音并评估
      const audioBase64 = await audioRecorder.stopRecording()
      console.log('[ReadAloudPage] Audio base64 length:', audioBase64?.length || 0)
      if (audioBase64 && audioBase64.length > 100) {
        await evaluatePronunciation(audioBase64)
      } else {
        console.error('[ReadAloudPage] Audio too short or empty')
      }
    } else {
      // 开始录音
      await audioRecorder.startRecording()
    }
  }

  // 评估发音
  const evaluatePronunciation = async (audioBase64: string) => {
    try {
      setIsEvaluating(true)
      const currentSentence = sentences[currentIndex]

      const response = await readAloudApi.evaluate({
        recordId: recordId || undefined,
        sentenceIndex: currentIndex,
        originalSentence: currentSentence.english,
        audioBase64,
      })

      // 保存结果
      const newResults = [...results]
      newResults[currentIndex] = response.data
      setResults(newResults)

      // 检查是否完成所有句子
      const isLastSentence = currentIndex === sentences.length - 1
      if (isLastSentence) {
        // 完成所有句子，调用整体评分
        await performFinalScoring(newResults)
      } else {
        // 自动跳到下一句
        setCurrentIndex(currentIndex + 1)
      }
    } catch (err) {
      console.error('Evaluation failed:', err)
    } finally {
      setIsEvaluating(false)
    }
  }

  // 整体评分并跳转
  const performFinalScoring = async (finalResults: (SentenceEvaluation | null)[]) => {
    try {
      setIsScoring(true)

      // 构建评分请求数据
      const scoringData = sentences.map((sentence, i) => ({
        english: sentence.english,
        chinese: sentence.chinese,
        spokenText: finalResults[i]?.spokenText || '',
        accuracy: finalResults[i]?.accuracy || 0,
      }))

      const response = await readAloudApi.score({
        recordId: recordId ?? undefined,
        sceneId,
        sceneName,
        sentences: scoringData,
      })

      // 跳转到跟读评分页面
      navigate('/read-aloud-evaluation', {
        state: {
          evaluation: response.data,
          sceneName,
          sceneId,
        },
      })
    } catch (err) {
      console.error('Scoring failed:', err)
      // 评分失败也跳转，使用本地计算的分数（100分制）
      const avgAccuracy = Math.round(finalResults.reduce((sum, r) => sum + (r?.accuracy || 0), 0) / finalResults.length)
      navigate('/read-aloud-evaluation', {
        state: {
          evaluation: {
            totalScore: avgAccuracy,
            intonationScore: avgAccuracy,
            fluencyScore: avgAccuracy,
            accuracyScore: avgAccuracy,
            expressionScore: avgAccuracy,
            feedback: avgAccuracy >= 80 ? '太棒了！继续保持！' : '练习完成！继续加油！',
            strengths: ['完成了所有句子的练习'],
            improvements: ['多多练习，发音会越来越好'],
          },
          sceneName,
          sceneId,
        },
      })
    } finally {
      setIsScoring(false)
    }
  }

  // 计算已完成数量
  const completedCount = results.filter(r => r !== null).length

  if (isLoading) {
    return (
      <div className="read-aloud-page loading">
        <Loader2 className="spin" size={48} />
        <p>正在加载...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="read-aloud-page error">
        <p>{error}</p>
        <button onClick={() => navigate(-1)}>返回</button>
      </div>
    )
  }

  return (
    <div className="read-aloud-page">
      <div className="main-card">
        {/* 卡片头部 */}
        <header className="card-header">
          <BackButton />
          <h1>{sceneName}</h1>
          <span className="progress">{completedCount} / {sentences.length}</span>
        </header>

        {/* 句子列表区域 */}
        <div className="sentence-list-container" ref={listRef}>
          {/* 句子列表 */}
          <div className="sentence-list">
            {sentences.map((sentence, index) => (
              <SentenceCard
                key={sentence.id}
                sentence={sentence}
                index={index}
                isActive={index === currentIndex}
                result={results[index]}
              />
            ))}
          </div>
        </div>

        {/* 底部录音区域 */}
        <footer className="record-footer">
          <button
            className={`record-btn ${audioRecorder.isRecording ? 'recording' : ''}`}
            onClick={handleRecordClick}
            disabled={isEvaluating || isScoring}
          >
            {isScoring ? (
              <>
                <Loader2 className="spin" size={20} />
                <span className="btn-text">正在生成评分...</span>
              </>
            ) : isEvaluating ? (
              <>
                <Loader2 className="spin" size={20} />
                <span className="btn-text">评估中...</span>
              </>
            ) : audioRecorder.isRecording ? (
              <>
                <Square size={20} />
                <span className="btn-text">点击停止</span>
              </>
            ) : (
              <>
                <span className="btn-text">请朗读第{currentIndex + 1}句</span>
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  )
}

