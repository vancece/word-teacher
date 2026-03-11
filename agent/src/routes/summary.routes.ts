/**
 * 学习总结路由
 */
import { Router, type Request, type Response } from 'express'
import { summaryAgent, type SummaryRequest } from '../agents/summary.agent.js'

const router: ReturnType<typeof Router> = Router()

/**
 * POST /api/agent/summary
 * 生成学生学习总结
 */
router.post('/', async (req, res) => {
  try {
    const request: SummaryRequest = req.body

    console.log('[Summary] Generating summary for:', request.studentName)

    const summary = await summaryAgent.generateSummary(request)

    console.log('[Summary] Generated successfully')

    res.json({
      success: true,
      data: summary,
    })
  } catch (error: any) {
    console.error('[Summary] Error:', error.message)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate summary',
    })
  }
})

export default router

