import { useState, useEffect, useCallback, useRef } from 'react'
import { playCorrect, playWrong, playClick, playLevelUp, playGameOver } from '../word-shooter/sounds'
import { startMatchBgm, stopMatchBgm } from './matchBgm'
import type { WordItem } from '../word-shooter/config'
import './MatchGame.scss'

interface Card {
  id: string
  content: string
  type: 'english' | 'chinese'
  word: WordItem
  isFlipped: boolean
  isMatched: boolean
}

interface MatchGameProps {
  words: WordItem[]
  onGameEnd: (result: { score: number; time: number; moves: number }) => void
  onReport?: (result: { score: number; time: number; moves: number }) => void
}

export default function MatchGame({ words, onGameEnd, onReport }: MatchGameProps) {
  const [cards, setCards] = useState<Card[]>([])
  const [flippedCards, setFlippedCards] = useState<string[]>([])
  const [moves, setMoves] = useState(0)
  const [matches, setMatches] = useState(0)
  const [score, setScore] = useState(0)
  const [startTime] = useState(Date.now())
  const [combo, setCombo] = useState(0)
  const [isLocked, setIsLocked] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const totalPairs = useRef(0)

  useEffect(() => {
    initGame()
    startMatchBgm()
    return () => { stopMatchBgm() }
  }, [words])

  const initGame = () => {
    // 取 6 对（12 张卡）
    const selected = words.slice(0, 6)
    totalPairs.current = selected.length

    const cardList: Card[] = []
    selected.forEach((word, idx) => {
      cardList.push({
        id: `en-${idx}`,
        content: word.english,
        type: 'english',
        word,
        isFlipped: false,
        isMatched: false,
      })
      cardList.push({
        id: `cn-${idx}`,
        content: word.chinese,
        type: 'chinese',
        word,
        isFlipped: false,
        isMatched: false,
      })
    })

    // 洗牌
    for (let i = cardList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[cardList[i], cardList[j]] = [cardList[j], cardList[i]]
    }

    setCards(cardList)
    setFlippedCards([])
    setMoves(0)
    setMatches(0)
    setScore(0)
    setCombo(0)
    setIsLocked(false)
    setShowComplete(false)
  }

  const handleCardClick = useCallback((cardId: string) => {
    if (isLocked) return

    const card = cards.find(c => c.id === cardId)
    if (!card || card.isFlipped || card.isMatched) return

    playClick()

    const newFlipped = [...flippedCards, cardId]
    setFlippedCards(newFlipped)
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, isFlipped: true } : c))

    if (newFlipped.length === 2) {
      setIsLocked(true)
      setMoves(m => m + 1)

      const [firstId, secondId] = newFlipped
      const first = cards.find(c => c.id === firstId)!
      const second = cards.find(c => c.id === secondId)!

      // 检查是否同一个单词的英文+中文
      const isMatch = first.word.english === second.word.english && first.type !== second.type

      if (isMatch) {
        setTimeout(() => {
          playCorrect()
          const newCombo = combo + 1
          setCombo(newCombo)
          const points = 20 + newCombo * 5
          setScore(s => s + points)
          setMatches(m => {
            const newMatches = m + 1
            if (newMatches >= totalPairs.current) {
              setTimeout(() => {
                stopMatchBgm()
                playLevelUp()
                setShowComplete(true)
                const elapsed = Math.round((Date.now() - startTime) / 1000)
                onReport?.({ score: score + points, time: elapsed, moves: moves + 1 })
              }, 500)
            }
            return newMatches
          })
          setCards(prev => prev.map(c =>
            c.id === firstId || c.id === secondId ? { ...c, isMatched: true } : c
          ))
          setFlippedCards([])
          setIsLocked(false)
        }, 400)
      } else {
        setTimeout(() => {
          playWrong()
          setCombo(0)
          setCards(prev => prev.map(c =>
            c.id === firstId || c.id === secondId ? { ...c, isFlipped: false } : c
          ))
          setFlippedCards([])
          setIsLocked(false)
        }, 800)
      }
    }
  }, [cards, flippedCards, isLocked, combo])

  const handleComplete = () => {
    const elapsed = Math.round((Date.now() - startTime) / 1000)
    stopMatchBgm()
    playGameOver()
    onGameEnd({ score, time: elapsed, moves })
  }

  return (
    <div className="match-game">
      <div className="match-hud">
        <div className="hud-item">
          <span className="label">得分</span>
          <span className="value">{score}</span>
        </div>
        <div className="hud-item">
          <span className="label">步数</span>
          <span className="value">{moves}</span>
        </div>
        <div className="hud-item">
          <span className="label">配对</span>
          <span className="value">{matches}/{totalPairs.current}</span>
        </div>
        {combo >= 2 && (
          <div className="hud-combo">{combo}x 连击</div>
        )}
      </div>

      <div className="card-grid">
        {cards.map(card => (
          <div
            key={card.id}
            className={`match-card ${card.isFlipped ? 'flipped' : ''} ${card.isMatched ? 'matched' : ''}`}
            onClick={() => handleCardClick(card.id)}
          >
            <div className="card-inner">
              <div className={`card-front ${card.type}`}>
                <img
                  src={card.type === 'english' ? `${import.meta.env.BASE_URL}game-assets/card-back-en.svg` : `${import.meta.env.BASE_URL}game-assets/card-back-cn.svg`}
                  alt=""
                  className="card-back-img"
                />
              </div>
              <div className={`card-back ${card.type}`}>
                <span>{card.content}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showComplete && (
        <div className="match-complete-overlay">
          <div className="complete-card">
            <h2>全部配对成功！</h2>
            <div className="complete-stats">
              <p>得分: <strong>{score}</strong></p>
              <p>步数: <strong>{moves}</strong></p>
              <p>用时: <strong>{Math.round((Date.now() - startTime) / 1000)}秒</strong></p>
            </div>
            <button className="complete-btn" onClick={handleComplete}>
              完成
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
