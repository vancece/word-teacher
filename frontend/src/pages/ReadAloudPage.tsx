import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, Square } from 'lucide-react'
import { readAloudApi, type ReadAloudSentence, type SentenceEvaluation } from '../api'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { clientLogger } from '../utils/client-logger'
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
  const [audioCache, setAudioCache] = useState<(string | null)[]>([])
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
        setAudioCache(new Array(response.scene.sentences.length).fill(null))
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
      // 停止录音，缓存音频
      const audioBase64 = await audioRecorder.stopRecording()
      console.log('[ReadAloudPage] Audio base64 length:', audioBase64?.length || 0)
      if (audioBase64 && audioBase64.length > 100) {
        clientLogger.info('recording_complete', {
          sentenceIndex: currentIndex,
          audioLength: audioBase64.length,
          sceneId,
        })
        await handleRecordingComplete(audioBase64)
      } else {
        clientLogger.warn('recording_too_short', {
          sentenceIndex: currentIndex,
          audioLength: audioBase64?.length || 0,
          sceneId,
        })
        console.error('[ReadAloudPage] Audio too short or empty')
      }
    } else {
      // 开始录音
      clientLogger.info('recording_start', { sentenceIndex: currentIndex, sceneId })
      await audioRecorder.startRecording()
    }
  }

  // 录音完成：缓存音频，最后一句时触发批量评测
  const handleRecordingComplete = async (audioBase64: string) => {
    // 缓存当前句子的录音
    const newCache = [...audioCache]
    newCache[currentIndex] = audioBase64
    setAudioCache(newCache)

    console.log(`[ReadAloudPage] 缓存第${currentIndex + 1}句录音 (${audioBase64.length} chars)`)

    const isLastSentence = currentIndex === sentences.length - 1
    if (isLastSentence) {
      // 所有句子录完，批量提交评测
      await submitBatchEvaluation(newCache)
    } else {
      // 自动跳到下一句
      setCurrentIndex(currentIndex + 1)
    }
  }

  // 批量提交评测
  const submitBatchEvaluation = async (cachedAudios: (string | null)[]) => {
    try {
      setIsEvaluating(true)

      // 组装批量请求数据
      const batchSentences = sentences.map((sentence, i) => ({
        text: sentence.english,
        audioBase64: cachedAudios[i] || '',
      }))

      const startTime = Date.now()
      clientLogger.info('batch_eval_start', {
        sentenceCount: batchSentences.length,
        sceneId,
        recordId,
      })

      console.log(`[ReadAloudPage] 批量提交 ${batchSentences.length} 句评测...`)

      const response = await readAloudApi.evaluateBatch({ sentences: batchSentences })
      const batchResults = response.data.results
      const elapsed = Date.now() - startTime

      clientLogger.info('batch_eval_success', {
        sentenceCount: batchResults.length,
        elapsed,
        avgAccuracy: Math.round(batchResults.reduce((s, r) => s + (r.accuracy || 0), 0) / batchResults.length),
        sceneId,
      })

      // 填充结果
      const newResults = [...results]
      batchResults.forEach((evalResult, i) => {
        newResults[i] = evalResult
        console.log(`[ReadAloudPage] 第${i + 1}句: 准确度=${evalResult.accuracy}%, 流利度=${evalResult.fluency}, 完整度=${evalResult.completeness}`)
      })
      setResults(newResults)

      // 调用整体评分
      await performFinalScoring(newResults)
    } catch (err: any) {
      const errorMsg = err?.message || String(err)
      clientLogger.error('batch_eval_failed', {
        error: errorMsg,
        sentenceCount: sentences.length,
        sceneId,
      })
      console.error('[ReadAloudPage] Batch evaluation failed, falling back to per-sentence:', err)
      // 降级：逐句评测
      clientLogger.warn('batch_eval_fallback_start', { sentenceCount: sentences.length })
      await fallbackPerSentenceEvaluation(cachedAudios)
    } finally {
      setIsEvaluating(false)
    }
  }

  // 降级方案：逐句评测
  const fallbackPerSentenceEvaluation = async (cachedAudios: (string | null)[]) => {
    const newResults = [...results]

    for (let i = 0; i < sentences.length; i++) {
      const audio = cachedAudios[i]
      if (!audio) continue

      try {
        const response = await readAloudApi.evaluate({
          recordId: recordId || undefined,
          sentenceIndex: i,
          originalSentence: sentences[i].english,
          audioBase64: audio,
        })
        newResults[i] = response.data
      } catch (evalErr) {
        console.error(`[ReadAloudPage] 第${i + 1}句降级评测失败:`, evalErr)
      }
    }

    setResults(newResults)
    await performFinalScoring(newResults)
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
        fluency: finalResults[i]?.fluency,
        completeness: finalResults[i]?.completeness,
        suggestedScore: finalResults[i]?.suggestedScore,
        evaluationMethod: finalResults[i]?.evaluationMethod,
        words: finalResults[i]?.words?.map(w => ({
          word: w.text,
          accuracy: w.accuracy || 0,
          fluency: w.fluency || 0,
          matchTag: w.matchTag || w.status,
          phoneInfos: w.phoneInfos?.map(p => ({
            phone: p.phone,
            accuracy: p.accuracy,
            detectedStress: p.detectedStress,
            referencePhone: p.referencePhone,
          })),
        })),
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

  // 计算已录制数量（用 audioCache 而非 results，因为批量评测前 results 全为 null）
  const completedCount = audioCache.filter(a => a !== null).length

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
                recorded={audioCache[index] !== null}
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
                <span className="btn-text">正在评测所有句子...</span>
              </>
            ) : audioRecorder.isRecording ? (
              <>
                <Square size={20} />
                <span className="btn-text">点击停止</span>
              </>
            ) : (
              <>
                <span className="btn-text">
                  {currentIndex === sentences.length - 1 && audioCache[currentIndex]
                    ? '录完了，点击重录本句'
                    : `请朗读第${currentIndex + 1}句`}
                </span>
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  )
}

