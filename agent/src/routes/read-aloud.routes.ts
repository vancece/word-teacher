import { Router, type Router as RouterType } from 'express'
import { readAloudAgent, readAloudScoringAgent } from '../agents/index.js'

const router: RouterType = Router()

/**
 * POST /api/agent/read-aloud/evaluate
 * 评估学生的跟读发音 - 直接使用 Qwen-Omni 多模态模型
 *
 * Request body:
 * - originalSentence: string - 原句
 * - audioBase64: string - 学生录音 (base64 WAV)
 *
 * Response:
 * - words: Array<{text, status, spoken?}>
 * - accuracy: number (0-100)
 * - feedback: string
 * - spokenText: string (模型听到的内容)
 */
router.post('/evaluate', async (req, res) => {
  try {
    const { originalSentence, audioBase64 } = req.body

    if (!originalSentence) {
      return res.status(400).json({ error: 'originalSentence is required' })
    }

    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 is required' })
    }

    console.log(`[ReadAloud] Evaluating audio for: "${originalSentence}"`)
    console.log(`[ReadAloud] Audio length: ${audioBase64.length} chars`)

    // 直接使用多模态模型评估音频
    const result = await readAloudAgent.evaluateAudio(originalSentence, audioBase64)

    console.log('[ReadAloud] Result:', {
      accuracy: result.accuracy,
      spokenText: result.spokenText,  // 模型听到了什么
      feedback: result.feedback,
      words: result.words,
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[ReadAloud] Evaluation error:', error)
    res.status(500).json({
      error: 'Failed to evaluate pronunciation',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

/**
 * POST /api/agent/read-aloud/score
 * 整体评分 - 完成所有句子后调用
 */
router.post('/score', async (req, res) => {
  try {
    const { sceneName, sentences } = req.body

    if (!sceneName || !sentences || !Array.isArray(sentences)) {
      return res.status(400).json({ error: 'sceneName and sentences are required' })
    }

    console.log(`[ReadAloud] Scoring for scene: "${sceneName}", ${sentences.length} sentences`)

    const result = await readAloudScoringAgent.evaluate({ sceneName, sentences })

    console.log('[ReadAloud] Score result:', result)

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[ReadAloud] Scoring error:', error)
    res.status(500).json({
      error: 'Failed to score read-aloud',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

export default router

