import { useState, useEffect, useRef, useCallback } from 'react'
import Phaser from 'phaser'
import { ArrowLeft, Crosshair, Layers, PenLine, ChevronRight, Star, Sparkles, BookOpen, Loader2, Pickaxe } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ShooterScene, type GameResult, type WordPack, fetchWordPacks } from '../games/word-shooter'
import { stopBgm, playClick } from '../games/word-shooter/sounds'
import MatchGame from '../games/word-match/MatchGame'
import SpellGame from '../games/word-spell/SpellGame'
import { MinerScene, type MinerGameResult } from '../games/word-miner'
import { MinerBgm } from '../games/word-miner/minerBgm'
import { wordGameApi } from '../api/word-game'
import './WordGamePage.scss'

type Stage = 'menu' | 'packs' | 'playing' | 'result'
type GameType = 'shooter' | 'match' | 'spell' | 'miner'

interface GameInfo {
  type: GameType
  icon: React.ReactNode
  title: string
  desc: string
  color: string
  gradient: string
}

const GAMES: GameInfo[] = [
  { type: 'shooter', icon: <Crosshair size={24} />, title: '保卫城堡', desc: '射击入侵的单词保卫城堡', color: '#ff6b6b', gradient: 'linear-gradient(135deg, #ff6b6b, #ee5a24)' },
  { type: 'match', icon: <Layers size={24} />, title: '翻牌配对', desc: '翻牌匹配英文和中文', color: '#6c63ff', gradient: 'linear-gradient(135deg, #6c63ff, #5a4fcf)' },
  { type: 'spell', icon: <PenLine size={24} />, title: '美食餐车', desc: '顾客点单，拼出食材', color: '#48c6ef', gradient: 'linear-gradient(135deg, #48c6ef, #6f86d6)' },
  { type: 'miner', icon: <Pickaxe size={24} />, title: '黄金矿工', desc: '抓取矿石翻译单词', color: '#ff8f00', gradient: 'linear-gradient(135deg, #ff8f00, #ff6f00)' },
]

export default function WordGamePage() {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>('menu')
  const [selectedGame, setSelectedGame] = useState<GameType>('shooter')
  const [selectedPack, setSelectedPack] = useState<WordPack | null>(null)
  const [gameResult, setGameResult] = useState<any>(null)
  const [wordPacks, setWordPacks] = useState<WordPack[]>([])
  const [isLoadingPacks, setIsLoadingPacks] = useState(false)
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const selectedPackRef = useRef<WordPack | null>(null)

  // 保持 ref 与 state 同步
  useEffect(() => {
    selectedPackRef.current = selectedPack
  }, [selectedPack])

  const handleBack = () => {
    stopBgm()
    if (gameRef.current) {
      gameRef.current.destroy(true)
      gameRef.current = null
    }
    navigate('/')
  }

  useEffect(() => {
    return () => {
      stopBgm()
      if (gameRef.current) {
        gameRef.current.destroy(true)
        gameRef.current = null
      }
    }
  }, [])

  const handleShooterReport = useCallback((result: GameResult) => {
    const pack = selectedPackRef.current
    if (pack) {
      const wrongList = result.wrongWords.length > 0
        ? result.wrongWords.map(w => `${w.english}(${w.correct}对${w.wrong}错)`).join('、')
        : '无'
      const accuracy = result.totalWords > 0
        ? Math.round((result.wordsCleared / result.totalWords) * 100)
        : 0
      const summary = [
        `**结果** ${result.isWin ? '胜利' : '失败'}`,
        `**正确率** ${accuracy}%（击破 ${result.wordsCleared}/${result.totalWords} 词）`,
        `**最大连击** ${result.maxCombo}x`,
        `**用时** ${Math.floor(result.duration / 60)}分${result.duration % 60}秒`,
        `**不熟悉的单词** ${wrongList}`,
      ].join('\n\n')

      wordGameApi.reportResult({
        gameType: 'shooter',
        packName: pack.name,
        score: result.score,
        summary,
      }).catch(() => { /* 静默失败 */ })
    }
  }, [])

  const handleShooterEnd = useCallback((result: GameResult) => {
    setGameResult(result)
    setStage('result')
    if (gameRef.current) {
      gameRef.current.destroy(true)
      gameRef.current = null
    }
  }, [])

  const handleMinerReport = useCallback((result: MinerGameResult) => {
    const pack = selectedPackRef.current
    if (pack) {
      const accuracy = (result.wordsCorrect + result.wordsWrong) > 0
        ? Math.round((result.wordsCorrect / (result.wordsCorrect + result.wordsWrong)) * 100)
        : 0
      const mins = Math.floor(result.time / 60)
      const secs = result.time % 60
      const summary = [
        `**正确率** ${accuracy}%（正确 ${result.wordsCorrect} / 错误 ${result.wordsWrong}）`,
        `**最大连击** ${result.maxCombo}x`,
        `**用时** ${mins}分${secs}秒`,
      ].join('\n\n')

      wordGameApi.reportResult({
        gameType: 'miner',
        packName: pack.name,
        score: result.score,
        summary,
      }).catch(() => {})
    }
  }, [])

  const handleMinerEnd = useCallback((result: MinerGameResult) => {
    setGameResult(result)
    setStage('result')
    if (gameRef.current) {
      gameRef.current.destroy(true)
      gameRef.current = null
    }
  }, [])

  const startShooter = () => {
    if (!gameContainerRef.current || !selectedPack) return
    const container = gameContainerRef.current
    const dpr = window.devicePixelRatio || 1
    const width = container.clientWidth
    const height = container.clientHeight

    if (!width || !height) return // 防止容器未挂载时尺寸为0

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: width * dpr,
      height: height * dpr,
      parent: container,
      backgroundColor: '#e8f4fd',
      scene: [], // 不自动注册任何场景
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: {
        antialias: true,
        pixelArt: false,
      },
    })

    // 手动添加场景并启动，确保 init(data) 能接收参数
    game.scene.add('ShooterScene', ShooterScene, true, {
      words: selectedPack.words,
      onGameEnd: handleShooterEnd,
      onReport: handleShooterReport,
    })

    gameRef.current = game
  }

  const startMiner = () => {
    if (!gameContainerRef.current || !selectedPack) return
    const container = gameContainerRef.current
    const dpr = window.devicePixelRatio || 1
    const width = container.clientWidth
    const height = container.clientHeight

    if (!width || !height) return

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: width * dpr,
      height: height * dpr,
      parent: container,
      backgroundColor: '#5c4a1e',
      scene: [],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: {
        antialias: true,
        pixelArt: false,
      },
    })

    game.scene.add('MinerScene', MinerScene, true, {
      words: selectedPack.words,
      onGameEnd: handleMinerEnd,
      onReport: handleMinerReport,
    })

    gameRef.current = game
  }

  useEffect(() => {
    if (stage === 'playing' && (selectedGame === 'shooter' || selectedGame === 'miner')) {
      const raf = requestAnimationFrame(() => {
        if (gameContainerRef.current) {
          if (selectedGame === 'shooter') startShooter()
          else startMiner()
        }
      })
      return () => {
        cancelAnimationFrame(raf)
        if (gameRef.current) {
          gameRef.current.destroy(true)
          gameRef.current = null
        }
        MinerBgm.stop()
      }
    }
    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true)
        gameRef.current = null
      }
      MinerBgm.stop()
    }
  }, [stage, selectedGame, selectedPack])

  const selectGame = async (type: GameType) => {
    playClick()
    setSelectedGame(type)
    setStage('packs')
    setIsLoadingPacks(true)
    try {
      const packs = await fetchWordPacks(type)
      setWordPacks(packs)
    } catch {
      setWordPacks([])
    } finally {
      setIsLoadingPacks(false)
    }
  }

  const selectPack = (pack: WordPack) => {
    playClick()
    setSelectedPack(pack)
    setStage('playing')
  }

  const renderMenu = () => (
    <div className="game-menu">
      <div className="menu-header">
        <button className="back-btn" onClick={handleBack}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1>单词乐园</h1>
          <p className="menu-subtitle">选一个你喜欢的游戏开始练习吧</p>
        </div>
      </div>

      <div className="game-list">
        {GAMES.map(game => (
          <div
            key={game.type}
            className="game-item"
            onClick={() => selectGame(game.type)}
            style={{ '--accent': game.color, '--gradient': game.gradient } as React.CSSProperties}
          >
            <div className="game-icon">{game.icon}</div>
            <div className="game-info">
              <h3>{game.title}</h3>
              <p>{game.desc}</p>
            </div>
            <div className="game-go"><ChevronRight size={18} /></div>
          </div>
        ))}
      </div>
    </div>
  )

  const renderPacks = () => (
    <div className="game-packs">
      <div className="packs-header">
        <button className="back-btn" onClick={() => { playClick(); setStage('menu') }}>
          <ArrowLeft size={20} />
        </button>
        <h2>{GAMES.find(g => g.type === selectedGame)?.title}</h2>
      </div>
      <p className="packs-subtitle">选一个词包开始挑战</p>

      {isLoadingPacks ? (
        <div className="packs-loading">
          <Loader2 size={24} className="spin" />
          <span>加载词包中...</span>
        </div>
      ) : wordPacks.length === 0 ? (
        <div className="packs-empty">暂无可用词包</div>
      ) : (
        <div className="pack-list">
          {wordPacks.map((pack) => (
            <div key={pack.id} className="pack-item" onClick={() => selectPack(pack)}>
              <div className="pack-icon"><BookOpen size={20} /></div>
              <div className="pack-info">
                <h3>{pack.name}</h3>
                <span>{pack.words.length} 个单词</span>
              </div>
              <div className="pack-go">开始</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderPlaying = () => (
    <div className="game-playing">
      {selectedGame === 'shooter' && (
        <>
          <button className="floating-quit-btn" onClick={() => {
            stopBgm()
            if (gameRef.current) { gameRef.current.destroy(true); gameRef.current = null }
            setStage('menu')
          }}>
            <ArrowLeft size={16} /> 退出
          </button>
          <div className="game-container" ref={gameContainerRef} />
        </>
      )}
      {selectedGame === 'miner' && (
        <>
          <button className="floating-quit-btn" onClick={() => {
            if (gameRef.current) { gameRef.current.destroy(true); gameRef.current = null }
            setStage('menu')
          }}>
            <ArrowLeft size={16} /> 退出
          </button>
          <div className="game-container" ref={gameContainerRef} />
        </>
      )}
      {selectedGame === 'match' && selectedPack && (
        <div className="react-game-wrapper match-wrapper">
          <button className="floating-quit-btn light" onClick={() => setStage('menu')}>
            <ArrowLeft size={16} /> 退出
          </button>
          <MatchGame
            words={selectedPack.words}
            onGameEnd={(result) => {
              setGameResult(result)
              setStage('result')
            }}
            onReport={(result) => {
              const pack = selectedPackRef.current
              if (pack) {
                const mins = Math.floor(result.time / 60)
                const secs = result.time % 60
                const summary = [
                  `**翻牌次数** ${result.moves}次`,
                  `**用时** ${mins}分${secs}秒`,
                  `**配对数** ${pack.words.length}对`,
                  `**效率** 平均每对${(result.moves / pack.words.length).toFixed(1)}次翻牌`,
                ].join('\n\n')
                wordGameApi.reportResult({
                  gameType: 'match',
                  packName: pack.name,
                  score: result.score,
                  summary,
                }).catch(() => {})
              }
            }}
          />
        </div>
      )}
      {selectedGame === 'spell' && selectedPack && (
        <div className="react-game-wrapper spell-wrapper">
          <button className="floating-quit-btn" onClick={() => setStage('menu')}>
            <ArrowLeft size={16} /> 退出
          </button>
          <SpellGame
            words={selectedPack.words}
            onGameEnd={(result) => {
              setGameResult(result)
              setStage('result')
            }}
            onReport={(result) => {
              const pack = selectedPackRef.current
              if (pack) {
                const finalCorrect = Math.min(result.correct, result.total)
                const finalWrong = result.total - finalCorrect
                const accuracy = result.total > 0 ? Math.round((finalCorrect / result.total) * 100) : 0
                const wrongList = result.wrongWords.length > 0
                  ? result.wrongWords.map(w => `${w.english}(${w.chinese})`).join('、')
                  : '无'
                const summary = [
                  `**正确率** ${accuracy}%（${finalCorrect}/${result.total}）`,
                  `**拼写正确** ${finalCorrect} 词`,
                  `**拼写错误** ${finalWrong} 词`,
                  `**拼错的单词** ${wrongList}`,
                ].join('\n\n')
                wordGameApi.reportResult({
                  gameType: 'spell',
                  packName: pack.name,
                  score: result.score,
                  summary,
                }).catch(() => {})
              }
            }}
          />
        </div>
      )}
    </div>
  )

  const renderResult = () => (
    <div className="game-result">
      <div className="result-stars">
        {[0, 1, 2].map(i => (
          <Star key={i} size={36} className={`star ${(gameResult?.score || 0) > (i + 1) * 30 ? 'filled' : ''}`} />
        ))}
      </div>
      <div className="result-card">
        <div className="result-icon"><Sparkles size={40} /></div>
        <h2>挑战完成！</h2>
        <div className="result-score">{gameResult?.score || 0} 分</div>
        <div className="result-actions">
          <button className="btn-primary" onClick={() => {
            playClick()
            setStage('playing')
            setGameResult(null)
          }}>再来一局</button>
          <button className="btn-secondary" onClick={() => {
            playClick()
            setStage('packs')
            setGameResult(null)
          }}>换个词包</button>
          <button className="btn-ghost" onClick={() => {
            playClick()
            setStage('menu')
            setGameResult(null)
          }}>换个游戏</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="word-game-page">
      {stage === 'menu' && renderMenu()}
      {stage === 'packs' && renderPacks()}
      {stage === 'playing' && renderPlaying()}
      {stage === 'result' && renderResult()}
    </div>
  )
}
