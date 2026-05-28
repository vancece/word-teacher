import Phaser from 'phaser'

export interface LoadingSceneData {
  /** 下一个要启动的场景 key */
  nextScene: string
  /** 传给下一个场景的 data */
  nextSceneData?: Record<string, unknown>
  /** 资源注册函数，在 preload 阶段调用来注册资源 */
  loadAssets: (scene: Phaser.Scene) => void
  /** 背景颜色 */
  bgColor?: number
}

export class LoadingScene extends Phaser.Scene {
  private nextScene = ''
  private nextSceneData: Record<string, unknown> = {}
  private loadAssets!: (scene: Phaser.Scene) => void
  private bgColor = 0x1a1a2e

  constructor() {
    super({ key: 'LoadingScene' })
  }

  init(data: LoadingSceneData) {
    this.nextScene = data.nextScene
    this.nextSceneData = data.nextSceneData || {}
    this.loadAssets = data.loadAssets
    if (data.bgColor !== undefined) this.bgColor = data.bgColor
  }

  preload() {
    const { width, height } = this.scale

    // 背景
    this.cameras.main.setBackgroundColor(this.bgColor)

    // 进度条参数
    const barW = Math.min(width * 0.6, 400)
    const barH = 20
    const barX = (width - barW) / 2
    const barY = height / 2

    // 进度条底框
    const barBg = this.add.graphics()
    barBg.fillStyle(0x000000, 0.4)
    barBg.fillRoundedRect(barX - 4, barY - 4, barW + 8, barH + 8, 12)
    barBg.lineStyle(2, 0xffffff, 0.3)
    barBg.strokeRoundedRect(barX - 4, barY - 4, barW + 8, barH + 8, 12)

    // 进度条填充
    const barFill = this.add.graphics()

    // 加载中文字
    const loadingText = this.add.text(width / 2, barY - 40, '加载中...', {
      fontSize: '22px',
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5, 0.5)

    // 百分比文字
    const percentText = this.add.text(width / 2, barY + barH + 24, '0%', {
      fontSize: '16px',
      fontFamily: '"PingFang SC", sans-serif',
      color: '#cccccc',
    }).setOrigin(0.5, 0.5)

    // 监听进度
    this.load.on('progress', (value: number) => {
      barFill.clear()
      // 渐变色进度条
      const fillW = barW * value
      if (fillW > 0) {
        barFill.fillStyle(0x4ecdc4, 1)
        barFill.fillRoundedRect(barX, barY, fillW, barH, 10)
        // 高光
        barFill.fillStyle(0xffffff, 0.3)
        barFill.fillRoundedRect(barX + 2, barY + 2, fillW - 4, barH * 0.4, 8)
      }
      percentText.setText(`${Math.round(value * 100)}%`)
    })

    this.load.on('complete', () => {
      loadingText.setText('加载完成!')
      percentText.setText('100%')
    })

    // 注册实际需要加载的资源
    this.loadAssets(this)
  }

  create() {
    // 短暂延迟后启动下一个场景，让用户看到 100%
    this.time.delayedCall(200, () => {
      this.scene.start(this.nextScene, this.nextSceneData)
    })
  }
}
