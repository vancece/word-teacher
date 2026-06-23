import { CheckCircle2, Circle } from 'lucide-react'
import { type ReadAloudSentence, type SentenceEvaluation } from '../api'
import './SentenceCard.scss'

interface Props {
  sentence: ReadAloudSentence
  index: number
  isActive: boolean
  result?: SentenceEvaluation | null
  recorded?: boolean
}

export default function SentenceCard({
  sentence,
  index,
  isActive,
  result,
  recorded,
}: Props) {
  const renderWords = () => {
    if (!result?.words) {
      return <span className="sentence-text">{sentence.english}</span>
    }

    return (
      <span className="sentence-text evaluated">
        {result.words.map((word, idx) => (
          <span
            key={idx}
            className={`word ${word.status}`}
            title={word.accuracy !== undefined ? `准确度: ${Math.round(word.accuracy)}` : undefined}
          >
            {word.text}{' '}
          </span>
        ))}
      </span>
    )
  }

  return (
    <div className={`sentence-card ${isActive ? 'active' : ''} ${result ? 'completed' : ''} ${recorded && !result ? 'recorded' : ''}`}>
      <div className="card-left">
        <div className="index-badge">
          {result ? <CheckCircle2 size={16} /> : recorded ? <CheckCircle2 size={16} /> : <Circle size={16} />}
        </div>
        <div className="sentence-content">
          <div className="english-section">{renderWords()}</div>
          <div className="chinese-section">{sentence.chinese}</div>
        </div>
      </div>

      <div className="card-right">
        {result ? (
          <div className="result-box">
            <span className={`score ${result.accuracy >= 80 ? 'high' : result.accuracy >= 60 ? 'medium' : 'low'}`}>
              {result.accuracy}
            </span>
            <span className="feedback">{result.feedback}</span>
            {result.fluency !== undefined && result.fluency > 0 && (
              <span className="metrics">
                流利{Math.round(result.fluency)}
                {result.completeness !== undefined && result.completeness > 0 && ` · 完整${Math.round(result.completeness)}`}
              </span>
            )}
          </div>
        ) : isActive ? (
          <span className="waiting">等待朗读</span>
        ) : recorded ? (
          <span className="recorded-badge">已录制 ✓</span>
        ) : null}
      </div>
    </div>
  )
}
