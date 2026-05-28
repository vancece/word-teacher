import Phaser from 'phaser'
import type { WordItem } from './config'
import * as SFX from './sounds'

interface Bomb {
  container: Phaser.GameObjects.Container
  word: WordItem
  speed: number
  wobbleOffset: number
  isRushing: boolean
  bombType: 'bomb' | 'poop'
}

export class ShooterScene extends Phaser.Scene {
  private words: WordItem[] = []
  private wordQueue: WordItem[] = []
  private bombs: Bomb[] = []
  private currentTarget!: WordItem
  private score = 0
  private combo = 0
  private maxCombo = 0
  private wordsCleared = 0
  private totalWords = 0

  private scoreText!: Phaser.GameObjects.Text
  private comboText!: Phaser.GameObjects.Text
  private targetText!: Phaser.GameObjects.Text

  // 魔王
  private bossContainer!: Phaser.GameObjects.Container
  private bossHp = 100
  private bossMaxHp = 100
  private bossHpBar!: Phaser.GameObjects.Graphics
  private bossHpText!: Phaser.GameObjects.Text

  // 弩箭
  private crossbowContainer!: Phaser.GameObjects.Container
  private crossbowX = 0
  private crossbowY = 0
  private pointerX = 0
  private pointerY = 0
  private isShooting = false
  private spawnsSinceNewTarget = 0

  // 城堡
  private castleContainer!: Phaser.GameObjects.Container
  private castleHp = 100
  private castleMaxHp = 100
  private castleHpBar!: Phaser.GameObjects.Graphics
  private castleHpText!: Phaser.GameObjects.Text
  private castleTopY = 0

  private spawnTimer = 0
  private spawnInterval = 1600
  private baseSpeed = 1.2
  private isGameOver = false
  private onGameEnd?: (result: GameResult) => void
  private onReport?: (result: GameResult) => void
  private elapsed = 0
  private wrongWords: Map<string, number> = new Map()  // english -> 错误次数
  private correctWords: Map<string, number> = new Map()  // english -> 正确次数
  private startTime = 0

  constructor() {
    super({ key: 'ShooterScene' })
  }

  init(data: { words: WordItem[]; onGameEnd?: (result: GameResult) => void; onReport?: (result: GameResult) => void }) {
    this.words = data.words
    this.onGameEnd = data.onGameEnd
    this.onReport = data.onReport
    this.bombs = []
    this.wordQueue = [...data.words]
    this.totalWords = data.words.length
    this.score = 0
    this.combo = 0
    this.maxCombo = 0
    this.wordsCleared = 0
    this.spawnTimer = 0
    this.isGameOver = false
    this.isShooting = false
    this.elapsed = 0
    this.wrongWords = new Map()
    this.correctWords = new Map()
    this.startTime = Date.now()

    // 血量：城堡能扛 2/3 的单词错误才死
    const wrongToKill = Math.ceil(this.totalWords * 2 / 3)
    const dmgPerHit = 15
    this.castleMaxHp = wrongToKill * dmgPerHit
    this.castleHp = this.castleMaxHp

    // 魔王血量：需要打完所有单词
    this.bossMaxHp = this.totalWords * 10
    this.bossHp = this.bossMaxHp
  }

  static loadAssets(scene: Phaser.Scene) {
    const base = import.meta.env.BASE_URL || '/'
    scene.load.image('boss', `${base}game-assets/boss.png`)
    scene.load.image('castle', `${base}game-assets/castle.png`)
    scene.load.image('shooter-bg', `${base}game-assets/shooter-bg.jpg`)
    scene.load.image('crossbow', `${base}game-assets/crossbow.png`)
  }

  preload() {
    // 资源由 LoadingScene 统一加载
  }

  create() {
    const { width, height } = this.scale

    // 背景图
    const bg = this.add.image(width / 2, height / 2, 'shooter-bg')
    bg.setDisplaySize(width, height)

    this.castleTopY = height - height * 0.2
    this.drawCastle(width, height)

    // 魔王
    this.createBoss(width)

    // 目标提示
    this.createTargetArea(width)

    // HUD
    this.createHUD(width, height)

    // 城堡血条
    this.createCastleHpBar(width, height)

    // 弩箭（城堡墙头正中）
    this.crossbowX = width / 2
    this.crossbowY = this.castleTopY + 90
    this.createCrossbow()

    // 鼠标跟踪
    this.pointerX = width / 2
    this.pointerY = height / 2
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.pointerX = p.x
      this.pointerY = p.y
    })

    this.pickNewTarget()
    SFX.startBgm()
  }

  private drawCastle(width: number, height: number) {
    this.castleContainer = this.add.container(0, 0).setDepth(5)

    // 城堡图片 (原图 1920x304)
    const castleH = height * 0.22
    const topY = height - castleH
    const castleImg = this.add.image(width / 2, height - castleH / 2, 'castle')
    castleImg.setDisplaySize(width, castleH)
    this.castleContainer.add(castleImg)

    this.castleTopY = topY
  }

  private createBoss(width: number) {
    this.bossContainer = this.add.container(width / 2, 90).setDepth(20)

    // Boss 图片
    const bossSprite = this.add.image(0, -10, 'boss')
    bossSprite.setDisplaySize(160, 160)
    this.bossContainer.add(bossSprite)

    // 魔王血条
    const hpBarW = 280
    const hpBarH = 24
    const hpY = 70

    const hpBg = this.add.graphics()
    hpBg.fillStyle(0x000000, 0.6)
    hpBg.fillRoundedRect(-hpBarW / 2 - 6, hpY - 4, hpBarW + 12, hpBarH + 8, 14)
    this.bossContainer.add(hpBg)

    this.bossHpBar = this.add.graphics()
    this.bossContainer.add(this.bossHpBar)
    this.drawBossHpBar()

    this.bossHpText = this.add.text(0, hpY + hpBarH / 2, `${this.bossHp}/${this.bossMaxHp}`, {
      fontSize: '18px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)
    this.bossContainer.add(this.bossHpText)

    const nameText = this.add.text(0, -105, '暗影龙王', {
      fontSize: '26px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#ff6b6b',
      fontStyle: 'bold',
    }).setOrigin(0.5, 1)
    this.bossContainer.add(nameText)

    // 悬浮动画
    this.tweens.add({
      targets: this.bossContainer,
      y: 98,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  private drawBossHpBar() {
    const hpBarW = 280
    const hpBarH = 24
    const hpY = 70
    const ratio = Math.max(0, this.bossHp / this.bossMaxHp)

    this.bossHpBar.clear()
    this.bossHpBar.fillStyle(0x333333, 1)
    this.bossHpBar.fillRoundedRect(-hpBarW / 2, hpY, hpBarW, hpBarH, 12)
    if (ratio > 0) {
      const color = ratio > 0.5 ? 0xcc3333 : ratio > 0.25 ? 0xff6600 : 0xff0000
      this.bossHpBar.fillStyle(color, 1)
      this.bossHpBar.fillRoundedRect(-hpBarW / 2, hpY, hpBarW * ratio, hpBarH, 12)
      // 高光
      this.bossHpBar.fillStyle(0xffffff, 0.2)
      this.bossHpBar.fillRoundedRect(-hpBarW / 2 + 2, hpY + 2, hpBarW * ratio - 4, hpBarH * 0.4, 8)
    }
  }

  private createCastleHpBar(width: number, height: number) {
    const barW = 320
    const barH = 28
    const barY = height - 36

    const bg = this.add.graphics().setDepth(50)
    bg.fillStyle(0x000000, 0.6)
    bg.fillRoundedRect(width / 2 - barW / 2 - 8, barY - 6, barW + 16, barH + 12, 16)

    this.castleHpBar = this.add.graphics().setDepth(50)
    this.drawCastleHpBar(width)

    this.castleHpText = this.add.text(width / 2, barY + barH / 2, `${this.castleHp}/${this.castleMaxHp}`, {
      fontSize: '20px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(50)

    this.add.text(width / 2, barY - 16, '城堡', {
      fontSize: '20px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#a8b2c1',
      fontStyle: 'bold',
    }).setOrigin(0.5, 1).setDepth(50)
  }

  private drawCastleHpBar(width: number) {
    const barW = 320
    const barH = 28
    const barY = this.scale.height - 36
    const ratio = Math.max(0, this.castleHp / this.castleMaxHp)

    this.castleHpBar.clear()
    this.castleHpBar.fillStyle(0x333333, 1)
    this.castleHpBar.fillRoundedRect(width / 2 - barW / 2, barY, barW, barH, 14)
    if (ratio > 0) {
      const color = ratio > 0.5 ? 0x22c55e : ratio > 0.25 ? 0xeab308 : 0xef4444
      this.castleHpBar.fillStyle(color, 1)
      this.castleHpBar.fillRoundedRect(width / 2 - barW / 2, barY, barW * ratio, barH, 14)
      this.castleHpBar.fillStyle(0xffffff, 0.2)
      this.castleHpBar.fillRoundedRect(width / 2 - barW / 2 + 2, barY + 2, barW * ratio - 4, barH * 0.4, 10)
    }
  }

  private createCrossbow() {
    const container = this.add.container(this.crossbowX, this.crossbowY).setDepth(40)
    const sprite = this.add.image(0, 0, 'crossbow')
    sprite.setDisplaySize(120, 90)
    container.add(sprite)
    container.setScale(1.6)
    this.crossbowContainer = container
  }

  private shootArrowAt(target: Phaser.GameObjects.Container, word: WordItem) {
    const dx = target.x - this.crossbowX
    const dy = target.y - this.crossbowY
    const angleRad = Math.atan2(dx, -dy)
    const angleDeg = angleRad * (180 / Math.PI)

    // 弩箭转向
    this.tweens.add({
      targets: this.crossbowContainer,
      angle: angleDeg,
      duration: 60,
    })

    // 绘制箭矢
    const arrowG = this.add.graphics().setDepth(35)
    arrowG.fillStyle(0x8b6914, 1)
    arrowG.fillRect(-2, -65, 4, 65)
    arrowG.fillStyle(0xc0c0c0, 1)
    arrowG.beginPath()
    arrowG.moveTo(0, -82)
    arrowG.lineTo(-8, -63)
    arrowG.lineTo(8, -63)
    arrowG.closePath()
    arrowG.fillPath()
    arrowG.fillStyle(0xe63946, 0.9)
    arrowG.beginPath()
    arrowG.moveTo(-7, 0)
    arrowG.lineTo(-2, -18)
    arrowG.lineTo(-2, 0)
    arrowG.closePath()
    arrowG.fillPath()
    arrowG.beginPath()
    arrowG.moveTo(7, 0)
    arrowG.lineTo(2, -18)
    arrowG.lineTo(2, 0)
    arrowG.closePath()
    arrowG.fillPath()

    arrowG.setPosition(this.crossbowX, this.crossbowY - 50)
    arrowG.setAngle(angleDeg)

    SFX.playClick()

    const dist = Phaser.Math.Distance.Between(this.crossbowX, this.crossbowY, target.x, target.y)
    const duration = Math.max(100, Math.min(350, dist * 0.35))

    this.tweens.add({
      targets: arrowG,
      x: target.x,
      y: target.y,
      duration,
      ease: 'Quad.easeIn',
      onComplete: () => {
        arrowG.destroy()
        this.onBombHitByArrow(word, target)
      },
    })
  }

  private createTargetArea(width: number) {
    const y = this.castleTopY - 200

    const bgW = 520
    const bgH = 86
    const gBg = this.add.graphics().setDepth(30)
    gBg.fillStyle(0x000000, 0.55)
    gBg.fillRoundedRect(width / 2 - bgW / 2, y - bgH / 2, bgW, bgH, bgH / 2)

    this.add.text(width / 2 - bgW / 2 + 28, y, '魔王当前弱点:', {
      fontSize: '36px',
      fontFamily: '"PingFang SC", "Noto Sans SC", sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(30)

    this.targetText = this.add.text(width / 2 + 80, y, '', {
      fontSize: '44px',
      fontFamily: '"PingFang SC", "Noto Sans SC", sans-serif',
      color: '#fbbf24',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(30)
  }

  private createHUD(width: number, _height: number) {
    const hudBg = this.add.graphics().setDepth(50)
    hudBg.fillStyle(0x000000, 0.5)
    hudBg.fillRoundedRect(16, 16, 220, 60, 16)

    this.add.text(32, 24, '得分', {
      fontSize: '22px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#ffcc80',
    }).setDepth(50)
    this.scoreText = this.add.text(100, 24, '0', {
      fontSize: '38px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#ffc107',
      fontStyle: 'bold',
    }).setDepth(50)

    this.comboText = this.add.text(width / 2, 30, '', {
      fontSize: '44px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#ff5722',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(50)
  }

  update(_time: number, delta: number) {
    if (this.isGameOver) return
    this.elapsed += delta

    // 弩箭跟随鼠标方向
    if (!this.isShooting) {
      const dx = this.pointerX - this.crossbowX
      const dy = this.pointerY - this.crossbowY
      let angle = Math.atan2(dx, -dy) * (180 / Math.PI)
      angle = Phaser.Math.Clamp(angle, -75, 75)
      this.crossbowContainer.setAngle(angle)
    }

    // 生成炸弹
    this.spawnTimer += delta
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0
      // wordQueue 空了就重新填充
      if (this.wordQueue.length === 0) {
        this.wordQueue = [...this.words]
        Phaser.Utils.Array.Shuffle(this.wordQueue)
      }
      this.spawnBomb()
    }

    // 更新炸弹
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i]
      if (b.isRushing) {
        // 加速冲向城堡
        b.container.y += 6 * (delta / 16)
        if (b.container.y >= this.castleTopY - 20) {
          this.onBombHitCastle(b)
          this.bombs.splice(i, 1)
        }
      } else {
        b.container.y += b.speed * (delta / 16)
        b.container.x += Math.sin(this.elapsed * 0.0012 + b.wobbleOffset) * 0.4

        // 自然落到城堡
        if (b.container.y >= this.castleTopY - 20) {
          this.onBombHitCastle(b)
          this.bombs.splice(i, 1)
        }
      }
    }
  }

  private pickNewTarget() {
    this.spawnsSinceNewTarget = 0
    const onScreen = new Set(this.bombs.map(b => b.word.english))
    const available = this.words.filter(w => !onScreen.has(w.english))
    this.currentTarget = available.length > 0
      ? Phaser.Utils.Array.GetRandom(available)
      : Phaser.Utils.Array.GetRandom(this.words)
    this.targetText.setText(this.currentTarget.chinese)
    this.tweens.add({
      targets: this.targetText,
      scaleX: 1.15, scaleY: 1.15,
      duration: 100,
      yoyo: true,
    })
  }

  private spawnBomb() {
    const { width } = this.scale

    const hasTarget = this.bombs.some(b => b.word.english === this.currentTarget.english)
    let word: WordItem
    this.spawnsSinceNewTarget++

    // 正确答案在前5个内随机出现，第5个时强制出现
    const shouldSpawnTarget = !hasTarget && (
      this.spawnsSinceNewTarget >= 5 || Math.random() < 0.3
    )

    if (shouldSpawnTarget) {
      word = this.currentTarget
      const idx = this.wordQueue.findIndex(w => w.english === word.english)
      if (idx >= 0) this.wordQueue.splice(idx, 1)
    } else {
      const others = this.wordQueue.filter(w => w.english !== this.currentTarget.english)
      if (others.length > 0) {
        word = Phaser.Utils.Array.GetRandom(others)
        const idx = this.wordQueue.findIndex(w => w.english === word.english)
        if (idx >= 0) this.wordQueue.splice(idx, 1)
      } else if (this.wordQueue.length > 0) {
        word = this.wordQueue[0]
        this.wordQueue.splice(0, 1)
      } else {
        const distractors = this.words.filter(w => w.english !== this.currentTarget.english)
        word = distractors.length > 0 ? Phaser.Utils.Array.GetRandom(distractors) : this.currentTarget
      }
    }

    // 从魔王位置发射
    const bossX = this.bossContainer.x
    const bossY = this.bossContainer.y + 60

    // 目标 x 随机分散
    const targetX = Phaser.Math.Between(160, width - 160)
    const startX = bossX + Phaser.Math.Between(-40, 40)

    const speed = this.baseSpeed + Math.random() * 0.3
    const wobbleOffset = Math.random() * Math.PI * 2

    const container = this.add.container(startX, bossY).setDepth(10)

    // 随机选择外观：炸弹或屎
    const bombType = Math.random() < 0.4 ? 'poop' : 'bomb' as const
    const iconG = this.add.graphics()

    if (bombType === 'poop') {
      this.drawPoopIcon(iconG)
      iconG.setScale(2)
    } else {
      this.drawBombIcon(iconG)
      iconG.setScale(1.5)
    }

    // 单词文字
    const text = this.add.text(0, 0, word.english, {
      fontSize: '48px',
      fontFamily: '"SF Pro Rounded", "Nunito", "PingFang SC", sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
      padding: { x: 6, y: 4 },
    }).setOrigin(0.5)

    const textBounds = text.getBounds()
    const padX = 36
    const padY = 22
    const bw = Math.max(textBounds.width + padX * 2, 100)
    const bh = Math.max(textBounds.height + padY * 2, 90)

    container.add([iconG, text])
    container.setSize(bw, bh)
    container.setInteractive({ useHandCursor: true })

    // 发射动画：从魔王处抛出
    container.setScale(0.2).setAlpha(0.5)
    this.tweens.add({
      targets: container,
      x: targetX,
      scaleX: 1, scaleY: 1,
      alpha: 1,
      duration: 400,
      ease: 'Quad.easeOut',
    })

    // 魔王攻击动画
    this.tweens.add({
      targets: this.bossContainer,
      scaleX: 1.1, scaleY: 0.9,
      duration: 80,
      yoyo: true,
    })

    container.on('pointerdown', () => this.onBombClicked(word, container))
    container.on('pointerover', () => {
      this.tweens.add({ targets: container, scaleX: 1.08, scaleY: 1.08, duration: 60 })
    })
    container.on('pointerout', () => {
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 60 })
    })

    this.bombs.push({ container, word, speed, wobbleOffset, isRushing: false, bombType })
  }

  private drawBombIcon(g: Phaser.GameObjects.Graphics) {
    const r = 40
    // 阴影
    g.fillStyle(0x000000, 0.2)
    g.fillCircle(3, 4, r)
    // 主体
    g.fillStyle(0x2d2d2d, 1)
    g.fillCircle(0, 0, r)
    // 高光
    g.fillStyle(0x555555, 0.5)
    g.fillCircle(-10, -12, 16)
    // 引信
    g.lineStyle(3, 0x8b6914, 1)
    g.beginPath()
    g.moveTo(0, -r + 4)
    g.lineTo(6, -r - 12)
    g.lineTo(12, -r - 8)
    g.strokePath()
    // 火花
    g.fillStyle(0xff6600, 0.9)
    g.fillCircle(12, -r - 8, 6)
    g.fillStyle(0xffcc00, 0.8)
    g.fillCircle(12, -r - 8, 3)
  }

  private drawPoopIcon(g: Phaser.GameObjects.Graphics) {
    // 底部椭圆（最大层）
    g.fillStyle(0x6b4226, 1)
    g.fillEllipse(0, 16, 52, 28)
    // 中间层
    g.fillStyle(0x7a4f2e, 1)
    g.fillEllipse(0, 2, 40, 24)
    // 顶部层
    g.fillStyle(0x8b5e3c, 1)
    g.fillEllipse(0, -12, 28, 20)
    // 尖顶
    g.fillStyle(0x8b5e3c, 1)
    g.beginPath()
    g.moveTo(-6, -22)
    g.lineTo(2, -36)
    g.lineTo(8, -22)
    g.closePath()
    g.fillPath()
    // 高光
    g.fillStyle(0xa67c52, 0.6)
    g.fillEllipse(-8, -6, 10, 6)
    g.fillEllipse(-4, -20, 6, 4)
    // 臭气线
    g.lineStyle(2, 0x8b9a3c, 0.5)
    g.beginPath()
    g.moveTo(-14, -34)
    g.lineTo(-16, -44)
    g.lineTo(-12, -48)
    g.strokePath()
    g.beginPath()
    g.moveTo(10, -32)
    g.lineTo(12, -42)
    g.lineTo(8, -46)
    g.strokePath()
  }

  private onBombClicked(word: WordItem, container: Phaser.GameObjects.Container) {
    if (this.isGameOver || this.isShooting) return

    if (word.english === this.currentTarget.english) {
      // 正确 — 发射箭矢飞向炸弹
      this.isShooting = true
      this.shootArrowAt(container, word)
    } else {
      // 错误 — 炸弹加速冲向城堡
      this.combo = 0
      this.comboText.setText('')
      SFX.playWrong()

      // 记录错误单词（记录的是当前目标单词，因为是玩家没选对它）
      const count = this.wrongWords.get(this.currentTarget.english) || 0
      this.wrongWords.set(this.currentTarget.english, count + 1)

      const bomb = this.bombs.find(b => b.container === container)
      if (bomb) {
        bomb.isRushing = true
        this.tweens.add({
          targets: container,
          scaleX: 1.3, scaleY: 1.3,
          duration: 100,
        })
      }
    }
  }

  private onBombHitByArrow(_word: WordItem, container: Phaser.GameObjects.Container) {
    this.combo++
    if (this.combo > this.maxCombo) this.maxCombo = this.combo
    this.wordsCleared++

    // 记录正确单词
    const correctCount = this.correctWords.get(this.currentTarget.english) || 0
    this.correctWords.set(this.currentTarget.english, correctCount + 1)

    const points = 10 + Math.min(this.combo, 10) * 2
    this.score += points
    this.scoreText.setText(String(this.score))

    if (this.combo >= 3) {
      this.comboText.setText(`${this.combo}x 连击`)
      SFX.playCombo(this.combo)
    } else {
      this.comboText.setText('')
      SFX.playCorrect()
    }

    // 魔王扣血
    this.bossHp = Math.max(0, this.bossHp - 10)
    this.drawBossHpBar()
    this.bossHpText.setText(`${this.bossHp}/${this.bossMaxHp}`)
    SFX.playBossHit()

    // 魔王受击红色闪烁
    const bossX = this.bossContainer.x
    const bossY = this.bossContainer.y
    const redFlash = this.add.circle(bossX, bossY, 80, 0xff0000, 0.5).setDepth(21)
    this.tweens.add({
      targets: redFlash,
      alpha: 0,
      scale: 1.4,
      duration: 200,
      yoyo: true,
      repeat: 1,
      onComplete: () => redFlash.destroy(),
    })

    // 魔王受击抖动
    this.tweens.add({
      targets: this.bossContainer,
      x: bossX + Phaser.Math.Between(-12, 12),
      duration: 50,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.bossContainer.setX(bossX),
    })

    // 命中的炸弹空中爆炸
    this.showAirExplosion(container.x, container.y, points)

    const idx = this.bombs.findIndex(b => b.container === container)
    if (idx >= 0) this.bombs.splice(idx, 1)
    container.destroy()

    // 所有其他炸弹连锁爆炸
    const remainingBombs = [...this.bombs]
    this.bombs = []
    remainingBombs.forEach((bomb, i) => {
      this.time.delayedCall(80 * (i + 1), () => {
        if (bomb.container && bomb.container.active) {
          this.showChainExplosion(bomb.container.x, bomb.container.y)
          bomb.container.destroy()
        }
      })
    })

    this.isShooting = false

    // 检查胜负（等连锁爆炸结束后再判定）
    const chainDelay = 80 * (remainingBombs.length + 1) + 200
    if (this.bossHp <= 0) {
      this.time.delayedCall(chainDelay, () => this.gameWin())
    } else {
      this.time.delayedCall(chainDelay, () => this.pickNewTarget())
    }
  }

  private onBombHitCastle(bomb: Bomb) {
    const cx = bomb.container.x
    const cy = bomb.container.y

    // 城堡扣血
    this.castleHp = Math.max(0, this.castleHp - 15)
    this.drawCastleHpBar(this.scale.width)
    this.castleHpText.setText(`${this.castleHp}/${this.castleMaxHp}`)
    SFX.playCastleHit()

    // 爆炸特效
    if (bomb.bombType === 'poop') {
      this.showPoopSplatter(cx, cy)
      this.showScreenPollution()
    } else {
      this.showCastleExplosion(cx, cy)
    }

    // 城堡抖动
    this.cameras.main.shake(250, 0.008)
    this.tweens.add({
      targets: this.castleContainer,
      x: Phaser.Math.Between(-6, 6),
      duration: 40,
      yoyo: true,
      repeat: 4,
      onComplete: () => this.castleContainer.setX(0),
    })

    bomb.container.destroy()

    // 把单词放回队列
    if (!this.wordQueue.some(w => w.english === bomb.word.english)) {
      this.wordQueue.push(bomb.word)
    }

    // 检查城堡是否被摧毁
    if (this.castleHp <= 0) {
      this.time.delayedCall(400, () => this.gameLose())
    }
  }

  private showPoopSplatter(x: number, y: number) {
    // 棕色飞溅
    const colors = [0x6b4226, 0x7a4f2e, 0x8b5e3c, 0x5c3317, 0xa67c52]
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.5
      const dist = Phaser.Math.Between(40, 120)
      const size = Phaser.Math.Between(6, 18)
      const splat = this.add.ellipse(
        x, y, size, size * 0.7,
        Phaser.Utils.Array.GetRandom(colors), 1
      ).setDepth(55)
      this.tweens.add({
        targets: splat,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist * 0.6,
        alpha: 0,
        scaleX: 1.5, scaleY: 0.5,
        duration: Phaser.Math.Between(400, 800),
        ease: 'Quad.easeOut',
        onComplete: () => splat.destroy(),
      })
    }
  }

  private showScreenPollution() {
    const { width, height } = this.scale

    // 几团不规则黄色污渍
    const colors = [0xc8a800, 0xd4b300, 0xb89a00, 0xe0c200, 0x9a7e00]
    for (let i = 0; i < 5; i++) {
      const sx = Phaser.Math.Between(100, width - 100)
      const sy = Phaser.Math.Between(100, height - 100)
      const g = this.add.graphics().setDepth(100)

      // 用多个重叠的不规则椭圆模拟一团污渍
      const baseColor = Phaser.Utils.Array.GetRandom(colors)
      const blobCount = Phaser.Math.Between(3, 6)
      for (let j = 0; j < blobCount; j++) {
        const ox = Phaser.Math.Between(-30, 30)
        const oy = Phaser.Math.Between(-20, 20)
        const rw = Phaser.Math.Between(25, 60)
        const rh = Phaser.Math.Between(15, 40)
        g.fillStyle(baseColor, Phaser.Math.FloatBetween(0.3, 0.6))
        g.fillEllipse(ox, oy, rw, rh)
      }

      g.setPosition(sx, sy)
      g.setAlpha(0.8)
      g.setScale(5)

      this.tweens.add({
        targets: g,
        alpha: 0,
        duration: Phaser.Math.Between(1500, 2500),
        delay: Phaser.Math.Between(0, 300),
        ease: 'Quad.easeIn',
        onComplete: () => g.destroy(),
      })
    }
  }

  private showAirExplosion(x: number, y: number, points: number) {
    // 得分文字
    const pt = this.add.text(x, y, `+${points}`, {
      fontSize: '46px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#22c55e',
      fontStyle: 'bold',
      stroke: '#ffffff',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(60)
    this.tweens.add({
      targets: pt,
      y: y - 90,
      alpha: 0,
      duration: 900,
      onComplete: () => pt.destroy(),
    })

    // 闪光
    const flash = this.add.circle(x, y, 50, 0xffffff, 0.8).setDepth(55)
    this.tweens.add({
      targets: flash,
      scale: 3,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy(),
    })

    // 彩色碎片
    const colors = [0xff6600, 0xffcc00, 0xff4444, 0x22c55e, 0x6366f1]
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2
      const dist = Phaser.Math.Between(60, 130)
      const dot = this.add.circle(x, y, Phaser.Math.Between(4, 10), Phaser.Utils.Array.GetRandom(colors), 1).setDepth(55)
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0, scale: 0,
        duration: Phaser.Math.Between(300, 600),
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      })
    }
  }

  private showChainExplosion(x: number, y: number) {
    // 闪光（橙红色调）
    const flash = this.add.circle(x, y, 40, 0xff8800, 0.7).setDepth(55)
    this.tweens.add({
      targets: flash,
      scale: 2.5,
      alpha: 0,
      duration: 250,
      onComplete: () => flash.destroy(),
    })

    // 碎片
    const colors = [0xff6600, 0xff4444, 0xffaa00, 0xff8800]
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2
      const dist = Phaser.Math.Between(40, 100)
      const dot = this.add.circle(x, y, Phaser.Math.Between(3, 8), Phaser.Utils.Array.GetRandom(colors), 1).setDepth(55)
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0, scale: 0,
        duration: Phaser.Math.Between(250, 500),
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      })
    }
  }

  private showCastleExplosion(x: number, y: number) {
    // 红色爆炸
    const flash = this.add.circle(x, y, 40, 0xff4444, 0.7).setDepth(15)
    this.tweens.add({
      targets: flash,
      scale: 3,
      alpha: 0,
      duration: 350,
      onComplete: () => flash.destroy(),
    })

    // 碎片
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2
      const dist = Phaser.Math.Between(40, 100)
      const shard = this.add.rectangle(x, y, Phaser.Math.Between(6, 14), Phaser.Math.Between(4, 10), 0xff6600, 0.8)
        .setDepth(15).setAngle(Phaser.Math.Between(0, 360))
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 30,
        alpha: 0,
        angle: shard.angle + Phaser.Math.Between(-180, 180),
        duration: Phaser.Math.Between(300, 600),
        ease: 'Quad.easeOut',
        onComplete: () => shard.destroy(),
      })
    }

    // 烟雾
    for (let i = 0; i < 4; i++) {
      const smoke = this.add.circle(x + Phaser.Math.Between(-20, 20), y, Phaser.Math.Between(15, 30), 0x555555, 0.4).setDepth(14)
      this.tweens.add({
        targets: smoke,
        y: y - Phaser.Math.Between(40, 80),
        scale: 2,
        alpha: 0,
        duration: Phaser.Math.Between(500, 800),
        onComplete: () => smoke.destroy(),
      })
    }
  }

  private gameWin() {
    this.isGameOver = true
    SFX.stopBgm()
    SFX.playGameOver()

    // 魔王死亡动画
    this.tweens.add({
      targets: this.bossContainer,
      scaleX: 0, scaleY: 0, alpha: 0, angle: 360,
      duration: 800,
      ease: 'Quad.easeIn',
    })

    // 清除炸弹
    this.bombs.forEach(b => b.container.destroy())
    this.bombs = []

    this.time.delayedCall(900, () => this.showEndPanel(true))
  }

  private gameLose() {
    this.isGameOver = true
    SFX.stopBgm()
    SFX.playGameOver()

    // 城堡坍塌动画
    this.cameras.main.shake(500, 0.015)

    // 清除炸弹
    this.bombs.forEach(b => b.container.destroy())
    this.bombs = []

    this.time.delayedCall(600, () => this.showEndPanel(false))
  }

  private showEndPanel(isWin: boolean) {
    // 游戏结束立即上报结果（不等用户点击按钮）
    const wrongWordsList = Array.from(this.wrongWords.entries()).map(([eng, wrongCount]) => {
      const w = this.words.find(item => item.english === eng)
      const correctCount = this.correctWords.get(eng) || 0
      return { english: eng, chinese: w?.chinese || '', correct: correctCount, wrong: wrongCount }
    })
    const gameResult: GameResult = {
      score: this.score,
      maxCombo: this.maxCombo,
      level: 1,
      wordsCleared: this.wordsCleared,
      isWin: this.bossHp <= 0,
      wrongWords: wrongWordsList,
      totalWords: this.totalWords,
      duration: Math.round((Date.now() - this.startTime) / 1000),
    }
    this.onReport?.(gameResult)

    const { width, height } = this.scale

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0).setDepth(80)
    this.tweens.add({ targets: overlay, alpha: 0.5, duration: 400 })

    const panel = this.add.container(width / 2, height / 2).setAlpha(0).setScale(0.7).setDepth(90)

    const panelW = 460
    const panelH = 440
    const cardG = this.add.graphics()
    cardG.fillStyle(0xffffff, 0.98)
    cardG.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 28)
    cardG.lineStyle(2, 0xe5e7eb, 1)
    cardG.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 28)

    const titleStr = isWin ? '城堡守住了!' : '城堡沦陷了...'
    const titleColor = isWin ? '#16a34a' : '#dc2626'
    const title = this.add.text(0, -panelH / 2 + 44, titleStr, {
      fontSize: '40px',
      fontFamily: '"PingFang SC", sans-serif',
      color: titleColor,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    const scoreTxt = this.add.text(0, -panelH / 2 + 120, String(this.score), {
      fontSize: '76px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#4f46e5',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    const scoreLabel = this.add.text(0, -panelH / 2 + 170, '分', {
      fontSize: '26px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#9ca3af',
    }).setOrigin(0.5)

    const statsStr = `连击 ${this.maxCombo}x  |  击破 ${this.wordsCleared} 词`
    const stats = this.add.text(0, -panelH / 2 + 215, statsStr, {
      fontSize: '24px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#6b7280',
    }).setOrigin(0.5)

    const retryG = this.add.graphics()
    retryG.fillStyle(0x4f46e5, 1)
    retryG.fillRoundedRect(-140, panelH / 2 - 170, 280, 64, 32)
    const retryTxt = this.add.text(0, panelH / 2 - 138, '再来一局', {
      fontSize: '28px', fontFamily: '"PingFang SC", sans-serif',
      color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)
    const retryHit = this.add.rectangle(0, panelH / 2 - 138, 280, 64, 0x000000, 0).setInteractive({ useHandCursor: true })
    retryHit.on('pointerdown', () => {
      SFX.playClick()
      this.scene.restart({ words: this.words, onGameEnd: this.onGameEnd, onReport: this.onReport })
    })

    const backG = this.add.graphics()
    backG.fillStyle(0xf3f4f6, 1)
    backG.fillRoundedRect(-140, panelH / 2 - 92, 280, 64, 32)
    const backTxt = this.add.text(0, panelH / 2 - 60, '返回', {
      fontSize: '28px', fontFamily: '"PingFang SC", sans-serif',
      color: '#4b5563',
    }).setOrigin(0.5)
    const backHit = this.add.rectangle(0, panelH / 2 - 60, 280, 64, 0x000000, 0).setInteractive({ useHandCursor: true })
    backHit.on('pointerdown', () => {
      SFX.playClick()
      this.onGameEnd?.(gameResult)
    })

    panel.add([cardG, title, scoreTxt, scoreLabel, stats, retryG, retryTxt, retryHit, backG, backTxt, backHit])
    this.tweens.add({ targets: panel, alpha: 1, scale: 1, duration: 350, ease: 'Back.easeOut', delay: 200 })
  }
}

export interface GameResult {
  score: number
  maxCombo: number
  level: number
  wordsCleared: number
  isWin: boolean
  wrongWords: { english: string; chinese: string; correct: number; wrong: number }[]
  totalWords: number
  duration: number  // 游戏时长（秒）
}
