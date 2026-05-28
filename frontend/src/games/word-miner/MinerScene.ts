import Phaser from 'phaser'
import type { WordItem } from '../word-shooter/config'
import * as SFX from '../word-shooter/sounds'
import { MinerBgm } from './minerBgm'

interface Mineral {
  sprite: Phaser.GameObjects.Container
  word: WordItem
  x: number
  y: number
  type: 'gold' | 'silver' | 'diamond' | 'ruby'
  value: number
  size: number
}

export interface MinerGameResult {
  score: number
  time: number
  wordsCorrect: number
  wordsWrong: number
  maxCombo: number
  wrongWords: { english: string; chinese: string }[]
}

type GameState = 'swinging' | 'extending' | 'retracting' | 'answering'

export class MinerScene extends Phaser.Scene {
  private words: WordItem[] = []
  private minerals: Mineral[] = []
  private score = 0
  private combo = 0
  private maxCombo = 0
  private wordsCorrect = 0
  private wordsWrong = 0
  private wrongWordsList: { english: string; chinese: string }[] = []
  private round = 1
  private totalRounds = 10
  private elapsed = 0

  private hookAngle = 0
  private hookSpeed = 1
  private hookDirection = 1
  private hookLength = 0
  private maxHookLength = 0
  private hookExtendSpeed = 6
  private hookRetractSpeed = 4
  private state: GameState = 'swinging'

  private hookPivotX = 0
  private hookPivotY = 0
  private hookLine!: Phaser.GameObjects.Graphics
  private hookHead!: Phaser.GameObjects.Image
  private minerSprite!: Phaser.GameObjects.Image

  private caughtMineral: Mineral | null = null
  private scoreText!: Phaser.GameObjects.Text
  private roundText!: Phaser.GameObjects.Text
  private comboText!: Phaser.GameObjects.Text
  private answerPanel!: Phaser.GameObjects.Container
  private isGameOver = false
  private onGameEnd?: (result: MinerGameResult) => void
  private onReport?: (result: MinerGameResult) => void

  constructor() {
    super({ key: 'MinerScene' })
  }

  init(data: { words: WordItem[]; onGameEnd?: (result: MinerGameResult) => void; onReport?: (result: MinerGameResult) => void }) {
    this.words = data.words
    this.onGameEnd = data.onGameEnd
    this.onReport = data.onReport
    this.minerals = []
    this.score = 0
    this.combo = 0
    this.maxCombo = 0
    this.wordsCorrect = 0
    this.wordsWrong = 0
    this.wrongWordsList = []
    this.round = 1
    this.totalRounds = Math.min(data.words.length, 8) // 等于矿石数量
    this.elapsed = 0
    this.hookAngle = 0
    this.hookLength = 0
    this.state = 'swinging'
    this.caughtMineral = null
    this.isGameOver = false
  }

  preload() {
    this.load.svg('bg-underground', '/game-assets/miner/bg-underground.svg', { width: 1600, height: 2400 })
    this.load.image('miner-char', '/game-assets/miner/miner-character.png')
    this.load.svg('gem-gold', '/game-assets/miner/gem-gold.svg', { width: 192, height: 192 })
    this.load.svg('gem-silver', '/game-assets/miner/gem-silver.svg', { width: 160, height: 160 })
    this.load.svg('gem-diamond', '/game-assets/miner/gem-diamond.svg', { width: 176, height: 176 })
    this.load.svg('gem-ruby', '/game-assets/miner/gem-ruby.svg', { width: 160, height: 160 })
    this.load.svg('hook', '/game-assets/miner/hook.svg', { width: 96, height: 120 })
  }

  create() {
    const { width, height } = this.scale
    this.maxHookLength = height * 0.72
    this.hookPivotX = width / 2
    // 矿工站在草地边缘（背景 SVG 中草地在 ~18% 位置）
    this.hookPivotY = height * 0.20

    // 背景
    const bg = this.add.image(width / 2, height / 2, 'bg-underground')
    bg.setDisplaySize(width, height)

    // 矿工角色 - 站在地面上，脚踩草地
    const minerH = 150
    const minerW = 150
    this.minerSprite = this.add.image(width / 2, this.hookPivotY - minerH * 0.38, 'miner-char')
    this.minerSprite.setDisplaySize(minerW, minerH)

    // 钩子系统
    this.hookLine = this.add.graphics()
    this.hookHead = this.add.image(this.hookPivotX, this.hookPivotY, 'hook')
    this.hookHead.setDisplaySize(56, 70)

    // HUD
    this.createHUD(width)

    // 生成矿石
    this.spawnMinerals()

    // 答题面板
    this.answerPanel = this.add.container(width / 2, height / 2)
    this.answerPanel.setVisible(false)
    this.answerPanel.setDepth(100)

    // 点击释放钩子 / 收回钩子
    this.input.on('pointerdown', () => {
      if (this.isGameOver) return
      if (this.state === 'swinging') {
        this.state = 'extending'
        SFX.playClick()
      } else if (this.state === 'extending') {
        // 钩子正在下放时，点击可以提前收回
        this.state = 'retracting'
      }
    })

    // 提示文字
    const hint = this.add.text(width / 2, height - 30, '点击屏幕释放钩子', {
      fontSize: '18px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#a1887f',
    }).setOrigin(0.5)
    this.tweens.add({
      targets: hint,
      alpha: 0,
      delay: 3000,
      duration: 1000,
    })

    // 启动背景音乐
    MinerBgm.start()
  }

  private createHUD(width: number) {
    // HUD 顶部偏移，避开左上角退出按钮
    const hudTop = 70
    const hudH = 80
    const hudW = 200

    const hudBg = this.add.graphics()
    hudBg.fillStyle(0x000000, 0.5)
    hudBg.fillRoundedRect(12, hudTop, hudW, hudH, 16)
    hudBg.fillRoundedRect(width - hudW - 12, hudTop, hudW, hudH, 16)
    hudBg.setDepth(50)

    this.add.text(24, hudTop + 10, '💰 得分', {
      fontSize: '20px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#ffcc80',
    }).setDepth(50)
    this.scoreText = this.add.text(24, hudTop + 38, '0', {
      fontSize: '36px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#ffc107',
      fontStyle: 'bold',
    }).setDepth(50)

    this.add.text(width - hudW, hudTop + 10, '💎 剩余', {
      fontSize: '20px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#bcaaa4',
    }).setDepth(50)
    this.roundText = this.add.text(width - hudW, hudTop + 38, `${this.totalRounds}/${this.totalRounds}`, {
      fontSize: '36px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#fff',
      fontStyle: 'bold',
    }).setDepth(50)

    // 连击
    this.comboText = this.add.text(width / 2, hudTop, '', {
      fontSize: '30px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#ff5722',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(50)
  }

  private spawnMinerals() {
    this.minerals.forEach(m => m.sprite.destroy())
    this.minerals = []

    const { width, height } = this.scale
    // 矿石从地面线以下开始生成
    const groundY = height * 0.26
    const usableHeight = height - groundY - 60
    const usableWidth = width - 80

    const shuffled = Phaser.Utils.Array.Shuffle([...this.words])
    const count = Math.min(8, shuffled.length)

    const types: Array<'gold' | 'silver' | 'diamond' | 'ruby'> = ['gold', 'gold', 'silver', 'silver', 'diamond', 'ruby', 'gold', 'silver']
    const values = { gold: 30, silver: 20, diamond: 50, ruby: 40 }
    const sizes = { gold: 130, silver: 110, diamond: 120, ruby: 110 }
    const textureKeys = { gold: 'gem-gold', silver: 'gem-silver', diamond: 'gem-diamond', ruby: 'gem-ruby' }

    const cols = 3
    const rows = Math.ceil(count / cols)
    const cellW = usableWidth / cols
    const cellH = usableHeight / rows

    for (let i = 0; i < count; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = 40 + col * cellW + Phaser.Math.Between(20, cellW - 30)
      const y = groundY + 40 + row * cellH + Phaser.Math.Between(15, cellH - 25)

      const type = types[i % types.length]
      const size = sizes[type]

      const container = this.add.container(x, y)

      // 矿石图片
      const gemImage = this.add.image(0, 0, textureKeys[type])
      gemImage.setDisplaySize(size, size)
      container.add(gemImage)

      // 发光效果
      const glow = this.add.graphics()
      glow.fillStyle(type === 'gold' ? 0xffc107 : type === 'diamond' ? 0x4dd0e1 : type === 'ruby' ? 0xe53935 : 0x9e9e9e, 0.2)
      glow.fillCircle(0, 0, size * 0.65)
      container.addAt(glow, 0)

      // 单词文字（在矿石下方）
      const label = this.add.text(0, size / 2 + 20, shuffled[i].english, {
        fontSize: `${Math.min(52, Math.max(32, 440 / shuffled[i].english.length))}px`,
        fontFamily: '"SF Pro Rounded", "Nunito", sans-serif',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
        shadow: { offsetX: 1, offsetY: 2, color: '#000', blur: 4, fill: true },
      }).setOrigin(0.5)
      container.add(label)

      // 浮动动画
      this.tweens.add({
        targets: container,
        y: y + Phaser.Math.Between(-4, 4),
        duration: Phaser.Math.Between(1800, 2800),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })

      // 矿石微微旋转发光
      this.tweens.add({
        targets: gemImage,
        angle: Phaser.Math.Between(-5, 5),
        duration: Phaser.Math.Between(2000, 3000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })

      this.minerals.push({
        sprite: container,
        word: shuffled[i],
        x, y, type,
        value: values[type],
        size,
      })
    }
  }

  private showAnswerPanel(word: WordItem) {
    this.answerPanel.removeAll(true)
    const { width, height } = this.scale

    // 半透明遮罩
    const overlay = this.add.graphics()
    overlay.fillStyle(0x000000, 0.6)
    overlay.fillRect(-width / 2, -height / 2, width, height)
    this.answerPanel.add(overlay)

    // 面板背景 - 大尺寸
    const panelW = 520
    const panelH = 480
    const panel = this.add.graphics()
    panel.fillStyle(0x1e1e2e, 0.97)
    panel.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 28)
    panel.lineStyle(4, 0xffc107, 1)
    panel.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 28)
    this.answerPanel.add(panel)

    // 题目标签
    const labelBg = this.add.graphics()
    labelBg.fillStyle(0xffc107, 1)
    labelBg.fillRoundedRect(-80, -panelH / 2 + 16, 160, 44, 22)
    this.answerPanel.add(labelBg)

    const labelText = this.add.text(0, -panelH / 2 + 38, '选择翻译', {
      fontSize: '22px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#333',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    this.answerPanel.add(labelText)

    // 单词
    const wordText = this.add.text(0, -panelH / 2 + 100, word.english, {
      fontSize: '52px',
      fontFamily: '"SF Pro Rounded", "Nunito", sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    this.answerPanel.add(wordText)

    // 音标
    let optStartY = -panelH / 2 + 160
    if (word.phonetic) {
      const phoneticText = this.add.text(0, -panelH / 2 + 145, word.phonetic, {
        fontSize: '22px',
        fontFamily: 'Arial, sans-serif',
        color: '#aaaaaa',
      }).setOrigin(0.5)
      this.answerPanel.add(phoneticText)
      optStartY = -panelH / 2 + 185
    }

    // 生成选项
    const options = this.generateOptions(word)
    const btnW = 440
    const btnH = 72
    const btnGap = 16

    options.forEach((opt, i) => {
      const btnY = optStartY + i * (btnH + btnGap) + btnH / 2
      const btn = this.add.graphics()
      btn.fillStyle(0x3a3a4e, 1)
      btn.fillRoundedRect(-btnW / 2, btnY - btnH / 2, btnW, btnH, 18)
      btn.lineStyle(2, 0x555577, 1)
      btn.strokeRoundedRect(-btnW / 2, btnY - btnH / 2, btnW, btnH, 18)

      const btnText = this.add.text(0, btnY, opt.chinese, {
        fontSize: '30px',
        fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5)

      const hitArea = this.add.rectangle(0, btnY, btnW, btnH, 0x000000, 0)
        .setInteractive({ useHandCursor: true })

      hitArea.on('pointerover', () => {
        btn.clear()
        btn.fillStyle(0x4a4a60, 1)
        btn.fillRoundedRect(-btnW / 2, btnY - btnH / 2, btnW, btnH, 18)
        btn.lineStyle(3, 0xffc107, 1)
        btn.strokeRoundedRect(-btnW / 2, btnY - btnH / 2, btnW, btnH, 18)
      })

      hitArea.on('pointerout', () => {
        btn.clear()
        btn.fillStyle(0x3a3a4e, 1)
        btn.fillRoundedRect(-btnW / 2, btnY - btnH / 2, btnW, btnH, 18)
        btn.lineStyle(2, 0x555577, 1)
        btn.strokeRoundedRect(-btnW / 2, btnY - btnH / 2, btnW, btnH, 18)
      })

      hitArea.on('pointerdown', () => {
        this.handleAnswer(opt.isCorrect)
      })

      this.answerPanel.add([btn, btnText, hitArea])
    })

    this.answerPanel.setVisible(true)
    this.answerPanel.setAlpha(0)
    this.answerPanel.setScale(0.8)
    this.tweens.add({
      targets: this.answerPanel,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 250,
      ease: 'Back.easeOut',
    })
  }

  private generateOptions(correctWord: WordItem): { chinese: string; isCorrect: boolean }[] {
    const options: { chinese: string; isCorrect: boolean }[] = [
      { chinese: correctWord.chinese, isCorrect: true },
    ]

    const others = this.words.filter(w => w.english !== correctWord.english)
    const shuffled = Phaser.Utils.Array.Shuffle([...others])
    for (let i = 0; i < Math.min(2, shuffled.length); i++) {
      options.push({ chinese: shuffled[i].chinese, isCorrect: false })
    }

    while (options.length < 3) {
      options.push({ chinese: '???', isCorrect: false })
    }

    return Phaser.Utils.Array.Shuffle(options)
  }

  private handleAnswer(correct: boolean) {
    this.answerPanel.setVisible(false)

    if (correct) {
      SFX.playCorrect()
      this.combo++
      if (this.combo > this.maxCombo) this.maxCombo = this.combo
      const points = (this.caughtMineral?.value || 20) + this.combo * 5
      this.score += points
      this.wordsCorrect++

      this.showPointsEffect(points)

      if (this.combo >= 2) {
        this.comboText.setText(`🔥 ${this.combo}x 连击!`)
        this.tweens.add({
          targets: this.comboText,
          scaleX: 1.3,
          scaleY: 1.3,
          duration: 150,
          yoyo: true,
        })
      }
    } else {
      SFX.playWrong()
      this.combo = 0
      this.comboText.setText('')
      this.wordsWrong++
      if (this.caughtMineral) {
        this.wrongWordsList.push({ english: this.caughtMineral.word.english, chinese: this.caughtMineral.word.chinese })
      }
      this.cameras.main.shake(200, 0.005)
    }

    this.scoreText.setText(this.score.toString())

    if (this.caughtMineral) {
      const idx = this.minerals.indexOf(this.caughtMineral)
      if (idx >= 0) {
        // 消失动画
        this.tweens.add({
          targets: this.caughtMineral.sprite,
          scaleX: 0,
          scaleY: 0,
          alpha: 0,
          duration: 300,
          onComplete: () => {
            this.caughtMineral?.sprite.destroy()
          },
        })
        this.minerals.splice(idx, 1)
      }
      this.caughtMineral = null
    }

    this.round++
    this.roundText.setText(`${this.minerals.length}/${this.totalRounds}`)

    if (this.minerals.length === 0) {
      this.time.delayedCall(400, () => this.gameOver())
    } else {
      // 延迟一帧再恢复 swinging，防止答题按钮的 pointerdown 同帧触发钩子释放
      this.time.delayedCall(50, () => {
        this.state = 'swinging'
      })
    }
  }

  private showPointsEffect(points: number) {
    const { width } = this.scale
    const text = this.add.text(width / 2, this.hookPivotY + 10, `+${points}`, {
      fontSize: '36px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffc107',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(50)

    this.tweens.add({
      targets: text,
      y: this.hookPivotY - 30,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    })
  }

  private gameOver() {
    this.isGameOver = true
    SFX.playGameOver()
    MinerBgm.stop()

    // 游戏结束立即上报结果（不等用户点击按钮）
    const gameResult: MinerGameResult = {
      score: this.score,
      time: Math.round(this.elapsed / 1000),
      wordsCorrect: this.wordsCorrect,
      wordsWrong: this.wordsWrong,
      maxCombo: this.maxCombo,
      wrongWords: this.wrongWordsList,
    }
    this.onReport?.(gameResult)

    const { width, height } = this.scale

    const overlay = this.add.graphics()
    overlay.fillStyle(0x000000, 0.7)
    overlay.fillRect(0, 0, width, height)
    overlay.setDepth(200)

    const rW = 520
    const rH = 420
    const resultContainer = this.add.container(width / 2, height / 2).setDepth(201)

    const bg = this.add.graphics()
    bg.fillStyle(0x1e1e2e, 1)
    bg.fillRoundedRect(-rW / 2, -rH / 2, rW, rH, 28)
    bg.lineStyle(4, 0xffc107, 1)
    bg.strokeRoundedRect(-rW / 2, -rH / 2, rW, rH, 28)
    resultContainer.add(bg)

    const title = this.add.text(0, -rH / 2 + 50, '⛏️ 挖矿结束！', {
      fontSize: '42px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#fff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    resultContainer.add(title)

    const scoreLabel = this.add.text(0, -rH / 2 + 120, `💰 总分: ${this.score}`, {
      fontSize: '38px',
      color: '#ffc107',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    resultContainer.add(scoreLabel)

    const statsText = this.add.text(0, -rH / 2 + 200, `✅ 正确 ${this.wordsCorrect}  ❌ 错误 ${this.wordsWrong}\n🔥 最高连击 ${this.maxCombo}x`, {
      fontSize: '26px',
      color: '#ccc',
      align: 'center',
      lineSpacing: 14,
    }).setOrigin(0.5)
    resultContainer.add(statsText)

    // 完成按钮
    const finBtnW = 220
    const finBtnH = 68
    const finBtnY = rH / 2 - 60
    const btnBg = this.add.graphics()
    btnBg.fillStyle(0xffc107, 1)
    btnBg.fillRoundedRect(-finBtnW / 2, finBtnY - finBtnH / 2, finBtnW, finBtnH, 34)
    resultContainer.add(btnBg)

    const btnText = this.add.text(0, finBtnY, '完成', {
      fontSize: '30px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#333',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    resultContainer.add(btnText)

    const btnHit = this.add.rectangle(0, finBtnY, finBtnW, finBtnH, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
    btnHit.on('pointerdown', () => {
      MinerBgm.stop()
      this.onGameEnd?.({
        score: this.score,
        time: Math.round(this.elapsed / 1000),
        wordsCorrect: this.wordsCorrect,
        wordsWrong: this.wordsWrong,
        maxCombo: this.maxCombo,
        wrongWords: this.wrongWordsList,
      })
    })
    resultContainer.add(btnHit)

    resultContainer.setAlpha(0)
    resultContainer.setScale(0.7)
    this.tweens.add({
      targets: resultContainer,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 500,
      ease: 'Back.easeOut',
    })
  }

  update(_time: number, delta: number) {
    if (this.isGameOver) return
    this.elapsed += delta

    switch (this.state) {
      case 'swinging':
        this.hookAngle += this.hookSpeed * this.hookDirection * (delta / 16)
        if (this.hookAngle > 75) { this.hookAngle = 75; this.hookDirection = -1 }
        if (this.hookAngle < -75) { this.hookAngle = -75; this.hookDirection = 1 }
        // 待机时绳子保持一定长度，让玩家看清方向
        this.hookLength = 80
        break

      case 'extending': {
        this.hookLength += this.hookExtendSpeed * (delta / 16)
        const extTipX = this.hookPivotX + Math.sin(Phaser.Math.DegToRad(this.hookAngle)) * this.hookLength
        const extTipY = this.hookPivotY + Math.cos(Phaser.Math.DegToRad(this.hookAngle)) * this.hookLength
        const { width, height } = this.scale

        // 到达屏幕边缘才回弹（底部、左侧、右侧）
        if (extTipY >= height - 20 || extTipX <= 20 || extTipX >= width - 20) {
          this.state = 'retracting'
        } else {
          for (const mineral of this.minerals) {
            const dist = Phaser.Math.Distance.Between(extTipX, extTipY, mineral.x, mineral.y)
            if (dist < mineral.size * 0.8) {
              this.caughtMineral = mineral
              this.state = 'retracting'
              this.hookRetractSpeed = 3 // 带矿石回收更慢
              break
            }
          }
        }
        break
      }

      case 'retracting': {
        const retractSpeed = this.caughtMineral ? this.hookRetractSpeed : this.hookRetractSpeed * 2
        this.hookLength -= retractSpeed * (delta / 16)

        if (this.caughtMineral) {
          const tipX = this.hookPivotX + Math.sin(Phaser.Math.DegToRad(this.hookAngle)) * this.hookLength
          const tipY = this.hookPivotY + Math.cos(Phaser.Math.DegToRad(this.hookAngle)) * this.hookLength
          this.caughtMineral.sprite.setPosition(tipX, tipY)
          this.caughtMineral.x = tipX
          this.caughtMineral.y = tipY
        }

        if (this.hookLength <= 80) {
          this.hookLength = 80
          this.hookRetractSpeed = 4
          if (this.caughtMineral) {
            this.state = 'answering'
            SFX.playClick()
            this.showAnswerPanel(this.caughtMineral.word)
          } else {
            this.state = 'swinging'
          }
        }
        break
      }
    }

    this.updateHookVisual()
  }

  private updateHookVisual() {
    const angleRad = Phaser.Math.DegToRad(this.hookAngle)
    const tipX = this.hookPivotX + Math.sin(angleRad) * this.hookLength
    const tipY = this.hookPivotY + Math.cos(angleRad) * this.hookLength

    // 绳索
    this.hookLine.clear()
    this.hookLine.lineStyle(8, 0x8d6e63, 1)
    this.hookLine.beginPath()
    this.hookLine.moveTo(this.hookPivotX, this.hookPivotY)
    this.hookLine.lineTo(tipX, tipY)
    this.hookLine.strokePath()

    // 钩子 — 取反角度让钩子弯曲方向与绳子摆动方向一致
    this.hookHead.setPosition(tipX, tipY)
    this.hookHead.setAngle(-this.hookAngle)
  }
}
