import { useState, useEffect, useCallback, useRef } from 'react'
import { playCorrect, playWrong, playClick, playLevelUp, playCombo } from '../word-shooter/sounds'
import { startSpellBgm, stopSpellBgm } from './spellBgm'
import type { WordItem } from '../word-shooter/config'
import customer1 from '/game-assets/spell/customer-1.png'
import customer2 from '/game-assets/spell/customer-2.png'
import customer3 from '/game-assets/spell/customer-3.png'
import customer4 from '/game-assets/spell/customer-4.png'
import customer5 from '/game-assets/spell/customer-5.png'
import customer6 from '/game-assets/spell/customer-6.png'
import customer7 from '/game-assets/spell/customer-7.png'
import customer8 from '/game-assets/spell/customer-8.png'
import './SpellGame.scss'

interface SpellGameProps {
  words: WordItem[]
  onGameEnd: (result: { score: number; correct: number; total: number }) => void
  onReport?: (result: { score: number; correct: number; total: number; wrongWords: { english: string; chinese: string }[] }) => void
}

interface LetterTile {
  char: string
  id: number
  used: boolean
}

const CUSTOMER_IMAGES = [customer1, customer2, customer3, customer4, customer5, customer6, customer7, customer8]

const HAPPY_REPLIES = [
  '太好吃了！谢谢！😋',
  '完美！就是这个味道！🤩',
  '哇塞，手艺真棒！👏',
  '太香了！下次还来！😍',
  '绝了！五星好评！⭐',
  '好吃到飞起！🚀',
  '这就是幸福的味道！🥰',
  '老板手艺一绝啊！👨‍🍳',
  '满分满分！太赞了！💯',
  '我要推荐给朋友们！🎉',
  '从没吃过这么好的！😭',
  '真的太棒了吧！❤️',
  '简直是人间美味！✨',
  '每一口都是享受！😊',
  '果然没白排队！🙌',
  '太感动了好好吃！🥹',
  '明天我还来！❤️‍🔥',
  '必须给个大大的赞！👍',
  '吃完心情超好！🌈',
  '神仙味道！爱了爱了！💕',
]

const ANGRY_REPLIES = [
  '这不是我要的！走了！💢',
  '搞什么啊！太难吃了！😤',
  '差评！再也不来了！💢',
  '我要投诉！🤬',
  '这也能叫食物？！😡',
  '浪费我的时间！💢',
  '做错了也好意思端出来？😠',
  '我等了半天就这？！💢',
  '太失望了！哼！😤',
  '什么水平啊这是！🙄💢',
  '气死我了！退钱！💢',
  '这跟我点的完全不一样！😡',
  '不会做就别开店！💢',
  '我朋友推荐的？骗人！😤',
  '差劲！一星都不想给！💢',
  '再也不会来第二次了！😠',
  '白跑一趟！烦死了！💢',
  '做菜用点心好不好！😤',
  '这是什么黑暗料理！🤮💢',
  '老板你认真的吗？！😡',
]

const pickRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

export default function SpellGame({ words, onGameEnd, onReport }: SpellGameProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentWord, setCurrentWord] = useState<WordItem | null>(null)
  const [letters, setLetters] = useState<LetterTile[]>([])
  const [answer, setAnswer] = useState<LetterTile[]>([])
  const [money, setMoney] = useState(0)
  const [combo, setCombo] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [showResult, setShowResult] = useState(false)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [shake, setShake] = useState(false)
  const [custIdx, setCustIdx] = useState(0)
  const [custState, setCustState] = useState<'enter' | 'wait' | 'happy' | 'angry' | 'leave'>('enter')
  const [speechText, setSpeechText] = useState('')
  const checkingRef = useRef(false)
  const wrongWordsRef = useRef<{ english: string; chinese: string }[]>([])

  const totalWords = Math.min(words.length, 10)

  useEffect(() => {
    startSpellBgm()
    return () => { stopSpellBgm() }
  }, [])

  useEffect(() => { loadWord(0) }, [words])

  useEffect(() => {
    if (custState === 'enter') {
      const t = setTimeout(() => setCustState('wait'), 500)
      return () => clearTimeout(t)
    }
  }, [custState])

  const loadWord = (index: number) => {
    if (index >= totalWords) { stopSpellBgm(); setShowResult(true); return }
    checkingRef.current = false

    const word = words[index]
    setCurrentWord(word)
    setCurrentIndex(index)
    setAnswer([])
    setFeedback(null)

    let newIdx = Math.floor(Math.random() * CUSTOMER_IMAGES.length)
    while (newIdx === custIdx && CUSTOMER_IMAGES.length > 1) newIdx = Math.floor(Math.random() * CUSTOMER_IMAGES.length)
    setCustIdx(newIdx)
    setCustState('enter')

    const wordLetters = word.english.split('')
    const extraCount = word.english.length <= 4 ? 2 : 1
    const extras = 'abcdefghijklmnopqrstuvwxyz'
    for (let i = 0; i < extraCount; i++) {
      let rand = extras[Math.floor(Math.random() * extras.length)]
      while (wordLetters.includes(rand)) rand = extras[Math.floor(Math.random() * extras.length)]
      wordLetters.push(rand)
    }
    for (let i = wordLetters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[wordLetters[i], wordLetters[j]] = [wordLetters[j], wordLetters[i]]
    }
    setLetters(wordLetters.map((char, idx) => ({ char, id: idx, used: false })))
  }

  const handleLetterClick = useCallback((tile: LetterTile) => {
    if (tile.used || feedback) return
    playClick()
    setLetters(prev => prev.map(l => l.id === tile.id ? { ...l, used: true } : l))
    setAnswer(prev => {
      const newAnswer = [...prev, tile]
      if (currentWord && newAnswer.length === currentWord.english.length) {
        const spelled = newAnswer.map(t => t.char).join('')
        setTimeout(() => checkAnswer(spelled), 300)
      }
      return newAnswer
    })
  }, [currentWord, feedback])

  const handleAnswerClick = useCallback((tile: LetterTile, index: number) => {
    if (feedback) return
    playClick()
    setAnswer(prev => prev.filter((_, i) => i !== index))
    setLetters(prev => prev.map(l => l.id === tile.id ? { ...l, used: false } : l))
  }, [feedback])

  const checkAnswer = (spelled: string) => {
    if (!currentWord || checkingRef.current) return
    checkingRef.current = true
    if (spelled === currentWord.english) {
      const newCombo = combo + 1
      setCombo(newCombo)
      setCorrect(c => c + 1)
      const earn = 10 + Math.min(newCombo, 5) * 2
      setMoney(m => m + earn)
      setFeedback('correct')
      setCustState('happy')
      setSpeechText(pickRandom(HAPPY_REPLIES))
      if (newCombo >= 3) playCombo(newCombo)
      else playCorrect()
      setTimeout(() => {
        setCustState('leave')
        setTimeout(() => loadWord(currentIndex + 1), 500)
      }, 1200)
    } else {
      setCombo(0)
      setFeedback('wrong')
      setShake(true)
      setCustState('angry')
      setSpeechText(pickRandom(ANGRY_REPLIES))
      wrongWordsRef.current.push({ english: currentWord.english, chinese: currentWord.chinese })
      playWrong()
      setTimeout(() => {
        setCustState('leave')
        setTimeout(() => {
          setShake(false)
          setFeedback(null)
          setAnswer([])
          setLetters(prev => prev.map(l => ({ ...l, used: false })))
          loadWord(currentIndex + 1)
        }, 400)
      }, 1000)
    }
  }

  const handleSkip = () => {
    setCombo(0)
    setCustState('leave')
    setTimeout(() => loadWord(currentIndex + 1), 400)
  }

  const hasPlayedResult = useRef(false)
  useEffect(() => {
    if (showResult && !hasPlayedResult.current) {
      hasPlayedResult.current = true
      playLevelUp()
      onReport?.({ score: money, correct, total: totalWords, wrongWords: wrongWordsRef.current })
    }
  }, [showResult])

  if (showResult) {
    const finalCorrect = Math.min(correct, totalWords)
    const stars = finalCorrect >= totalWords ? 3 : finalCorrect >= totalWords * 0.7 ? 2 : finalCorrect >= totalWords * 0.4 ? 1 : 0
    return (
      <div className="spell-truck-result">
        <div className="result-card">
          <h2>营业结束</h2>
          <div className="stars">
            {[0, 1, 2].map(i => (
              <svg key={i} className={`star ${i < stars ? 'on' : ''}`} viewBox="0 0 24 24" width="36" height="36">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            ))}
          </div>
          <div className="stats">
            <div><span className="num">{finalCorrect}/{totalWords}</span><span className="lbl">成功出餐</span></div>
            <div><span className="num">{money}元</span><span className="lbl">总收入</span></div>
          </div>
          <button className="done-btn" onClick={() => onGameEnd({ score: money, correct: finalCorrect, total: totalWords })}>
            收工回家
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="spell-truck">
      <div className="truck-bg" />

      {/* 顾客区域 - 人物底部对齐桌面顶部 */}
      <div className="customer-zone">
        <div className={`customer ${custState}`}>
          <div className="speech">
            {custState === 'happy' && <span>{speechText}</span>}
            {custState === 'angry' && <span>{speechText}</span>}
            {(custState === 'wait' || custState === 'enter') && (
              <span>请给我一份：<strong>{currentWord?.chinese}</strong></span>
            )}
          </div>
          <img
            className="customer-img"
            src={CUSTOMER_IMAGES[custIdx]}
            alt="customer"
          />
        </div>
      </div>

      {/* HUD */}
      <div className="truck-hud">
        <span className="hud-money">当前收益：{money}元</span>
        <span className="hud-progress">{currentIndex + 1} / {totalWords}</span>
        {combo >= 2 && <span className="hud-combo">{combo}x连击</span>}
      </div>

      {/* 台面答案区 */}
      <div className="cooking-area">
        <div className="area-arrow answer-arrow">▼</div>
        <div className={`answer-plate ${feedback || ''} ${shake ? 'shake' : ''}`}>
          {currentWord?.english.split('').map((_, i) => (
            <div key={i} className={`letter-slot ${answer[i] ? 'filled' : ''}`}>
              <span onClick={() => answer[i] && handleAnswerClick(answer[i], i)}>
                {answer[i]?.char || ''}
              </span>
            </div>
          ))}
        </div>
        {feedback === 'correct' && <div className="feedback-msg good">出餐成功！ {currentWord?.english}</div>}
        {feedback === 'wrong' && <div className="feedback-msg bad">做错了！顾客走了</div>}
      </div>

      {/* 字母按钮 */}
      <div className="letter-bar">
        <div className="area-arrow letter-arrow">▼ 点击选字母 ▼</div>
        <div className="letter-buttons">
          {letters.map(tile => (
            <button
              key={tile.id}
              className={`ltr-btn ${tile.used ? 'used' : ''}`}
              onClick={() => handleLetterClick(tile)}
              disabled={tile.used || !!feedback}
            >
              {tile.char}
            </button>
          ))}
        </div>

      </div>
    </div>
  )
}
