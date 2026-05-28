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

  private clouds: Phaser.GameObjects.Graphics[] = []

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
    this.clouds = []
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

  preload() {
    // 全用 Graphics 绘制
  }

  create() {
    const { width, height } = this.scale

    // 天空渐变
    const bg = this.add.graphics()
    bg.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x16213e, 0x16213e, 1)
    bg.fillRect(0, 0, width, height * 0.55)
    bg.fillGradientStyle(0x16213e, 0x16213e, 0x87ceeb, 0x87ceeb, 1)
    bg.fillRect(0, height * 0.55, width, height * 0.45)

    this.drawClouds(width)
    this.drawHills(width, height)

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
    this.crossbowY = this.castleTopY - 10
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

  private drawClouds(width: number) {
    const positions = [
      { x: width * 0.15, y: 100, s: 1 },
      { x: width * 0.6, y: 70, s: 0.8 },
      { x: width * 0.85, y: 120, s: 0.6 },
    ]
    for (const pos of positions) {
      const cloud = this.add.graphics()
      cloud.fillStyle(0xffffff, 0.12)
      cloud.fillEllipse(pos.x, pos.y, 90 * pos.s, 36 * pos.s)
      cloud.fillEllipse(pos.x - 28 * pos.s, pos.y + 5 * pos.s, 55 * pos.s, 26 * pos.s)
      cloud.fillEllipse(pos.x + 30 * pos.s, pos.y + 4 * pos.s, 64 * pos.s, 28 * pos.s)
      this.clouds.push(cloud)
    }
  }

  private drawHills(width: number, height: number) {
    const hills = this.add.graphics()
    hills.fillStyle(0x2d5a27, 0.6)
    hills.beginPath()
    hills.moveTo(0, height * 0.8)
    hills.lineTo(width * 0.2, height * 0.73)
    hills.lineTo(width * 0.5, height * 0.78)
    hills.lineTo(width * 0.8, height * 0.72)
    hills.lineTo(width, height * 0.76)
    hills.lineTo(width, height)
    hills.lineTo(0, height)
    hills.closePath()
    hills.fillPath()
  }

  private drawCastle(width: number, height: number) {
    this.castleContainer = this.add.container(0, 0).setDepth(5)
    const g = this.add.graphics()
    const castleH = height * 0.22
    const topY = height - castleH

    // 护城河
    const moatG = this.add.graphics()
    moatG.fillStyle(0x1a5276, 0.5)
    moatG.fillRect(0, height - 10, width, 10)
    moatG.fillStyle(0x2980b9, 0.3)
    moatG.fillRect(0, height - 8, width, 4)
    this.castleContainer.add(moatG)

    // 城墙主体 — 渐变石色
    g.fillStyle(0x7f8c8d, 1)
    g.fillRect(0, topY + 40, width, castleH - 40)
    // 墙面上半高光
    g.fillStyle(0x95a5a6, 0.5)
    g.fillRect(0, topY + 40, width, 20)

    // 城垛（更精致的锯齿）
    const mW = 40, mH = 40, gap = 24
    const step = mW + gap
    for (let x = 0; x < width; x += step) {
      // 城垛主体
      g.fillStyle(0x7f8c8d, 1)
      g.fillRect(x, topY, mW, mH)
      // 顶部石帽
      g.fillStyle(0x6c7a7a, 1)
      g.fillRect(x - 2, topY - 4, mW + 4, 6)
      // 高光
      g.fillStyle(0xa0b0b0, 0.4)
      g.fillRect(x + 2, topY + 2, mW - 4, 6)
    }

    // 砖缝纹理（交错砖块）
    g.lineStyle(1, 0x5d6d6d, 0.3)
    for (let y = topY + 45; y < height - 10; y += 22) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(width, y); g.strokePath()
      const row = Math.floor((y - topY - 45) / 22)
      const off = (row % 2) * 30
      for (let x = off; x < width; x += 60) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 22); g.strokePath()
      }
    }

    // 左塔
    this.drawTower(g, width * 0.06, topY, 84, castleH + 60)
    // 右塔
    this.drawTower(g, width * 0.94, topY, 84, castleH + 60)
    // 中门塔（更宽）
    this.drawGateTower(g, width / 2, topY, 120, castleH + 45)

    // 火把（城墙上）
    this.drawTorch(g, width * 0.25, topY + 60)
    this.drawTorch(g, width * 0.75, topY + 60)

    // 旗帜
    this.drawFlag(g, width * 0.06, topY - 110, 0x2e86c1)
    this.drawFlag(g, width * 0.94, topY - 110, 0xc0392b)

    this.castleContainer.add(g)
    this.castleTopY = topY
  }

  private drawTower(g: Phaser.GameObjects.Graphics, cx: number, wallTop: number, tw: number, th: number) {
    const tTop = wallTop - 65
    const tBot = wallTop + th - 65

    // 塔身
    g.fillStyle(0x6c7a7a, 1)
    g.fillRect(cx - tw / 2, tTop + 30, tw, tBot - tTop - 30)
    // 塔身高光
    g.fillStyle(0x85929e, 0.4)
    g.fillRect(cx - tw / 2, tTop + 30, tw / 3, tBot - tTop - 30)

    // 锥形塔顶
    g.fillStyle(0x943126, 1)
    g.beginPath()
    g.moveTo(cx, tTop - 30)
    g.lineTo(cx - tw / 2 - 8, tTop + 32)
    g.lineTo(cx + tw / 2 + 8, tTop + 32)
    g.closePath()
    g.fillPath()
    // 塔顶高光
    g.fillStyle(0xb03a2e, 0.5)
    g.beginPath()
    g.moveTo(cx, tTop - 30)
    g.lineTo(cx - 6, tTop + 30)
    g.lineTo(cx + tw / 4, tTop + 30)
    g.closePath()
    g.fillPath()

    // 塔顶尖
    g.fillStyle(0xf1c40f, 1)
    g.fillCircle(cx, tTop - 32, 5)

    // 城垛环
    const mw = 12, mg = 7, st = mw + mg
    g.fillStyle(0x6c7a7a, 1)
    for (let x = cx - tw / 2; x < cx + tw / 2; x += st) {
      g.fillRect(x, tTop + 28, mw, 12)
    }

    // 拱形窗户
    this.drawArchWindow(g, cx, tTop + 60, 16, 24)
    this.drawArchWindow(g, cx, tTop + 100, 16, 24)

    // 塔身砖缝
    g.lineStyle(1, 0x5a6868, 0.2)
    for (let y = tTop + 35; y < tBot; y += 20) {
      g.beginPath(); g.moveTo(cx - tw / 2 + 2, y); g.lineTo(cx + tw / 2 - 2, y); g.strokePath()
    }
  }

  private drawGateTower(g: Phaser.GameObjects.Graphics, cx: number, wallTop: number, tw: number, th: number) {
    const tTop = wallTop - 50
    const tBot = wallTop + th - 50

    // 塔身
    g.fillStyle(0x616a6b, 1)
    g.fillRect(cx - tw / 2, tTop + 25, tw, tBot - tTop - 25)
    g.fillStyle(0x7b8a8b, 0.3)
    g.fillRect(cx - tw / 2, tTop + 25, tw / 3, tBot - tTop - 25)

    // 锥形大塔顶
    g.fillStyle(0x7b241c, 1)
    g.beginPath()
    g.moveTo(cx, tTop - 40)
    g.lineTo(cx - tw / 2 - 12, tTop + 28)
    g.lineTo(cx + tw / 2 + 12, tTop + 28)
    g.closePath()
    g.fillPath()
    g.fillStyle(0x943126, 0.4)
    g.beginPath()
    g.moveTo(cx, tTop - 40)
    g.lineTo(cx - 8, tTop + 26)
    g.lineTo(cx + tw / 3, tTop + 26)
    g.closePath()
    g.fillPath()

    // 塔顶尖
    g.fillStyle(0xf1c40f, 1)
    g.fillCircle(cx, tTop - 42, 6)

    // 城垛环
    const mw = 16, mg = 9, st = mw + mg
    g.fillStyle(0x616a6b, 1)
    for (let x = cx - tw / 2; x < cx + tw / 2; x += st) {
      g.fillRect(x, tTop + 22, mw, 14)
    }

    // 大门拱形
    const gW = 52, gH = 72
    g.fillStyle(0x1a1a2e, 1)
    g.fillRect(cx - gW / 2, tBot - gH, gW, gH)
    // 拱顶
    g.fillStyle(0x1a1a2e, 1)
    g.fillEllipse(cx, tBot - gH, gW, 30)
    // 拱形石边
    g.lineStyle(4, 0x515a5a, 1)
    g.beginPath()
    g.arc(cx, tBot - gH, gW / 2, Math.PI, 0, false)
    g.strokePath()
    g.beginPath()
    g.moveTo(cx - gW / 2, tBot - gH)
    g.lineTo(cx - gW / 2, tBot)
    g.strokePath()
    g.beginPath()
    g.moveTo(cx + gW / 2, tBot - gH)
    g.lineTo(cx + gW / 2, tBot)
    g.strokePath()

    // 铁栅栏
    g.lineStyle(3, 0x3d3d3d, 0.8)
    for (let x = cx - gW / 2 + 8; x < cx + gW / 2; x += 10) {
      g.beginPath(); g.moveTo(x, tBot - gH + 12); g.lineTo(x, tBot); g.strokePath()
    }
    // 横杆
    g.lineStyle(2, 0x3d3d3d, 0.6)
    g.beginPath(); g.moveTo(cx - gW / 2 + 4, tBot - gH / 2); g.lineTo(cx + gW / 2 - 4, tBot - gH / 2); g.strokePath()

    // 窗户
    this.drawArchWindow(g, cx - 30, tTop + 55, 14, 20)
    this.drawArchWindow(g, cx + 30, tTop + 55, 14, 20)
  }

  private drawArchWindow(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number, h: number) {
    // 窗户暗色
    g.fillStyle(0x1a1a2e, 0.9)
    g.fillRect(cx - w / 2, cy, w, h)
    g.fillEllipse(cx, cy, w, w * 0.8)
    // 窗户十字格
    g.lineStyle(2, 0x515a5a, 0.8)
    g.beginPath(); g.moveTo(cx, cy - w * 0.3); g.lineTo(cx, cy + h); g.strokePath()
    g.beginPath(); g.moveTo(cx - w / 2, cy + h * 0.4); g.lineTo(cx + w / 2, cy + h * 0.4); g.strokePath()
    // 窗台
    g.fillStyle(0x515a5a, 1)
    g.fillRect(cx - w / 2 - 2, cy + h, w + 4, 3)
  }

  private drawTorch(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
    // 火把架
    g.fillStyle(0x5d4e37, 1)
    g.fillRect(cx - 3, cy, 6, 20)
    // 火焰底座
    g.fillStyle(0x5d4e37, 1)
    g.fillRect(cx - 6, cy - 2, 12, 5)
    // 火焰
    g.fillStyle(0xff6600, 0.9)
    g.fillEllipse(cx, cy - 8, 14, 18)
    g.fillStyle(0xffcc00, 0.8)
    g.fillEllipse(cx, cy - 10, 8, 12)
    g.fillStyle(0xffee88, 0.6)
    g.fillEllipse(cx, cy - 12, 4, 6)
  }

  private drawFlag(g: Phaser.GameObjects.Graphics, cx: number, y: number, color: number) {
    // 旗杆
    g.lineStyle(3, 0x7f8c8d, 1)
    g.beginPath(); g.moveTo(cx, y + 80); g.lineTo(cx, y); g.strokePath()
    // 旗杆顶球
    g.fillStyle(0xf1c40f, 1)
    g.fillCircle(cx, y - 3, 4)
    // 旗帜（波浪形）
    g.fillStyle(color, 0.9)
    g.beginPath()
    g.moveTo(cx, y)
    g.lineTo(cx + 20, y + 5)
    g.lineTo(cx + 38, y + 3)
    g.lineTo(cx + 40, y + 16)
    g.lineTo(cx + 22, y + 20)
    g.lineTo(cx, y + 28)
    g.closePath()
    g.fillPath()
    // 旗帜装饰线
    g.lineStyle(1, 0xffffff, 0.3)
    g.beginPath(); g.moveTo(cx + 6, y + 8); g.lineTo(cx + 34, y + 8); g.strokePath()
    g.beginPath(); g.moveTo(cx + 6, y + 18); g.lineTo(cx + 34, y + 18); g.strokePath()
  }

  private createBoss(width: number) {
    this.bossContainer = this.add.container(width / 2, 90).setDepth(20)

    const g = this.add.graphics()

    // 火焰光环（最底层）
    g.fillStyle(0xff4400, 0.12)
    g.fillCircle(0, 0, 100)
    g.fillStyle(0xff6600, 0.08)
    g.fillCircle(0, 0, 120)

    // 翅膀（先画，在身体下面）
    // 左翅 — 蝙蝠翼骨架
    g.fillStyle(0x2c0a3a, 0.85)
    g.beginPath()
    g.moveTo(-50, -15)
    g.lineTo(-90, -70)
    g.lineTo(-130, -55)
    g.lineTo(-145, -20)
    g.lineTo(-130, 5)
    g.lineTo(-100, 20)
    g.lineTo(-60, 15)
    g.closePath()
    g.fillPath()
    // 翅膜
    g.fillStyle(0x4a1a6b, 0.4)
    g.beginPath()
    g.moveTo(-55, -10)
    g.lineTo(-85, -60)
    g.lineTo(-120, -45)
    g.lineTo(-135, -15)
    g.lineTo(-100, 15)
    g.lineTo(-60, 10)
    g.closePath()
    g.fillPath()
    // 翅骨
    g.lineStyle(3, 0x1a0a26, 0.7)
    g.beginPath(); g.moveTo(-50, -10); g.lineTo(-90, -65); g.strokePath()
    g.beginPath(); g.moveTo(-55, 0); g.lineTo(-130, -50); g.strokePath()
    g.beginPath(); g.moveTo(-55, 5); g.lineTo(-140, -15); g.strokePath()

    // 右翅
    g.fillStyle(0x2c0a3a, 0.85)
    g.beginPath()
    g.moveTo(50, -15)
    g.lineTo(90, -70)
    g.lineTo(130, -55)
    g.lineTo(145, -20)
    g.lineTo(130, 5)
    g.lineTo(100, 20)
    g.lineTo(60, 15)
    g.closePath()
    g.fillPath()
    g.fillStyle(0x4a1a6b, 0.4)
    g.beginPath()
    g.moveTo(55, -10)
    g.lineTo(85, -60)
    g.lineTo(120, -45)
    g.lineTo(135, -15)
    g.lineTo(100, 15)
    g.lineTo(60, 10)
    g.closePath()
    g.fillPath()
    g.lineStyle(3, 0x1a0a26, 0.7)
    g.beginPath(); g.moveTo(50, -10); g.lineTo(90, -65); g.strokePath()
    g.beginPath(); g.moveTo(55, 0); g.lineTo(130, -50); g.strokePath()
    g.beginPath(); g.moveTo(55, 5); g.lineTo(140, -15); g.strokePath()

    // 尾巴
    g.lineStyle(12, 0x3d1259, 1)
    g.beginPath()
    g.moveTo(0, 50)
    g.lineTo(30, 60)
    g.lineTo(55, 55)
    g.lineTo(75, 42)
    g.strokePath()
    g.lineStyle(8, 0x4a1a6b, 1)
    g.beginPath()
    g.moveTo(75, 42)
    g.lineTo(88, 32)
    g.lineTo(95, 20)
    g.strokePath()
    // 尾巴尖刺
    g.fillStyle(0xff4444, 0.9)
    g.beginPath()
    g.moveTo(95, 20)
    g.lineTo(108, 12)
    g.lineTo(100, 25)
    g.lineTo(108, 30)
    g.lineTo(95, 24)
    g.closePath()
    g.fillPath()

    // 身体 — 椭圆形龙躯
    g.fillStyle(0x3d1259, 1)
    g.fillEllipse(0, 10, 100, 80)
    // 腹部亮色
    g.fillStyle(0x5b2d8e, 0.6)
    g.fillEllipse(0, 18, 60, 50)
    // 鳞片纹理
    g.lineStyle(1, 0x2a0e42, 0.3)
    for (let row = 0; row < 4; row++) {
      const sy = -8 + row * 14
      const off = (row % 2) * 10
      for (let sx = -35 + off; sx < 35; sx += 20) {
        g.beginPath()
        g.arc(sx, sy, 8, 0.2, Math.PI - 0.2, false)
        g.strokePath()
      }
    }

    // 龙头
    g.fillStyle(0x4a1a6b, 1)
    g.fillEllipse(0, -40, 68, 52)
    // 头部高光
    g.fillStyle(0x5b2d8e, 0.5)
    g.fillEllipse(-8, -48, 35, 25)

    // 龙角
    g.fillStyle(0x2c0a3a, 1)
    g.beginPath(); g.moveTo(-22, -58); g.lineTo(-30, -95); g.lineTo(-14, -62); g.closePath(); g.fillPath()
    g.beginPath(); g.moveTo(22, -58); g.lineTo(30, -95); g.lineTo(14, -62); g.closePath(); g.fillPath()
    // 角尖发光
    g.fillStyle(0xff3333, 0.9)
    g.fillCircle(-30, -95, 5)
    g.fillCircle(30, -95, 5)
    g.fillStyle(0xff8866, 0.5)
    g.fillCircle(-30, -95, 8)
    g.fillCircle(30, -95, 8)

    // 眉脊
    g.fillStyle(0x2c0a3a, 1)
    g.fillEllipse(-18, -50, 26, 8)
    g.fillEllipse(18, -50, 26, 8)

    // 眼睛 — 发光红眼
    g.fillStyle(0x000000, 1)
    g.fillEllipse(-18, -42, 22, 18)
    g.fillEllipse(18, -42, 22, 18)
    g.fillStyle(0xdd0000, 1)
    g.fillEllipse(-18, -42, 18, 14)
    g.fillEllipse(18, -42, 18, 14)
    // 竖瞳
    g.fillStyle(0x000000, 1)
    g.fillEllipse(-18, -42, 5, 12)
    g.fillEllipse(18, -42, 5, 12)
    // 瞳孔反光
    g.fillStyle(0xffcc00, 0.8)
    g.fillCircle(-15, -45, 3)
    g.fillCircle(21, -45, 3)

    // 鼻孔
    g.fillStyle(0x1a0a26, 1)
    g.fillEllipse(-8, -28, 6, 4)
    g.fillEllipse(8, -28, 6, 4)
    // 鼻烟
    g.fillStyle(0xff6600, 0.3)
    g.fillEllipse(-8, -32, 8, 5)
    g.fillEllipse(8, -32, 8, 5)

    // 嘴巴
    g.fillStyle(0x1a0a26, 1)
    g.fillEllipse(0, -20, 36, 14)
    // 尖牙
    g.fillStyle(0xeeeeee, 1)
    g.beginPath(); g.moveTo(-14, -24); g.lineTo(-11, -14); g.lineTo(-8, -24); g.closePath(); g.fillPath()
    g.beginPath(); g.moveTo(-4, -24); g.lineTo(-2, -16); g.lineTo(0, -24); g.closePath(); g.fillPath()
    g.beginPath(); g.moveTo(4, -24); g.lineTo(6, -16); g.lineTo(8, -24); g.closePath(); g.fillPath()
    g.beginPath(); g.moveTo(8, -24); g.lineTo(11, -14); g.lineTo(14, -24); g.closePath(); g.fillPath()

    // 下颚
    g.fillStyle(0x3d1259, 0.8)
    g.fillEllipse(0, -16, 30, 8)

    this.bossContainer.add(g)

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
    const g = this.add.graphics()

    // 弩身
    g.fillStyle(0x8b6914, 1)
    g.fillRect(-14, -100, 28, 110)
    g.fillStyle(0xa07d30, 1)
    g.fillRect(-9, -95, 10, 100)

    // 弩臂
    g.fillStyle(0x6d4c00, 1)
    g.fillRect(-62, -78, 124, 16)
    g.fillStyle(0x5c3d00, 1)
    g.fillRect(-68, -76, 12, 12)
    g.fillRect(56, -76, 12, 12)

    // 弓弦
    g.lineStyle(2, 0xd4a843, 0.9)
    g.beginPath()
    g.moveTo(-62, -70)
    g.lineTo(0, -90)
    g.lineTo(62, -70)
    g.strokePath()

    // 箭槽
    g.fillStyle(0x4a3500, 1)
    g.fillRect(-4, -100, 8, 76)

    // 待发射箭头
    g.fillStyle(0xc0c0c0, 1)
    g.beginPath()
    g.moveTo(0, -120)
    g.lineTo(-7, -100)
    g.lineTo(7, -100)
    g.closePath()
    g.fillPath()

    // 箭杆
    g.fillStyle(0x8b6914, 1)
    g.fillRect(-2, -100, 4, 55)

    // 握把
    g.fillStyle(0x5c3d00, 1)
    g.fillRoundedRect(-18, 6, 36, 26, 6)

    container.add(g)
    container.setScale(1.1)
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

    // 云朵
    this.clouds.forEach((cloud, i) => {
      cloud.x += 0.06 * (i % 2 === 0 ? 1 : -0.5)
    })

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
