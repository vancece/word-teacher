import { CheckCircle2, Circle } from 'lucide-react'
import { type ReadAloudSentence, type SentenceEvaluation } from '../api'
import './SentenceCard.scss'

interface Props {
  sentence: ReadAloudSentence
  index: number
  isActive: boolean
  result?: SentenceEvaluation | null
}

export default function SentenceCard({
  sentence,
  index,
  isActive,
  result,
}: Props) {
  // 渲染单词（带颜色）
  const renderWords = () => {
    if (!result?.words) {
      return <span className="sentence-text">{sentence.english}</span>
    }

    return (
      <span className="sentence-text evaluated">
        {result.words.map((word, idx) => (
          <span key={idx} className={`word ${word.status}`}>
            {word.text}{' '}
          </span>
        ))}
      </span>
    )
  }

  return (
    <div className={`sentence-card ${isActive ? 'active' : ''} ${result ? 'completed' : ''}`}>
      {/* 左侧：序号和句子 */}
      <div className="card-left">
        <div className="index-badge">
          {result ? <CheckCircle2 size={16} /> : <Circle size={16} />}
        </div>
        <div className="sentence-content">
          <div className="english-section">{renderWords()}</div>
          <div className="chinese-section">{sentence.chinese}</div>
        </div>
      </div>

      {/* 右侧：评分结果 */}
      <div className="card-right">
        {result ? (
          <div className="result-box">
            <span className={`score ${result.accuracy >= 80 ? 'high' : result.accuracy >= 60 ? 'medium' : 'low'}`}>
              {result.accuracy}
            </span>
            <span className="feedback">{result.feedback}</span>
          </div>
        ) : (
          isActive && <span className="waiting">等待朗读</span>
        )}
      </div>
    </div>
  )
}

