/**
 * 场景补充 API 路由 - AI 辅助场景创建
 */
import { Router, type Router as RouterType } from 'express'
import { sceneSupplementAgent, type SceneSupplementRequest } from '../agents/scene-supplement.agent.js'

const router: RouterType = Router()

/**
 * POST /api/agent/scene/supplement
 * AI 补充场景信息：翻译句子 + 生成封面图片
 */
router.post('/supplement', async (req, res) => {
  const startTime = Date.now()
  console.log(`[${new Date().toISOString()}] Scene supplement request started`)

  try {
    const request: SceneSupplementRequest = req.body

    if (!request.sceneName) {
      return res.status(400).json({ error: 'sceneName is required' })
    }

    const result = await sceneSupplementAgent.supplement(request)

    console.log(`[${new Date().toISOString()}] Scene supplement completed in ${Date.now() - startTime}ms`)
    console.log(`  - Translations: ${result.translations?.length || 0} sentences`)
    console.log(`  - Cover image: ${result.coverImage ? 'generated' : 'not generated'}`)

    res.json(result)
  } catch (error) {
    console.error('Scene supplement error:', error)
    res.status(500).json({ error: 'Scene supplement failed' })
  }
})

export default router

