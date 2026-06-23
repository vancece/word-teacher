import { Router, type Router as RouterType } from 'express'
import { readAloudAgent, readAloudScoringAgent } from '../agents/index.js'
import { readAloudLogger as log } from '../utils/logger.js'
import { xfyunIseService } from '../services/xfyun-ise.service.js'

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

    log.info({ sentence: originalSentence, base64Len: audioBase64.length }, 'Evaluate request received')

    // 解析音频信息用于诊断
    try {
      const raw = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64
      const buf = Buffer.from(raw, 'base64')
      const isWav = buf.length > 44 && buf[0] === 0x52 && buf[1] === 0x49
      if (isWav) {
        const sampleRate = buf.readUInt32LE(24)
        const bitsPerSample = buf.readUInt16LE(34)
        const numChannels = buf.readUInt16LE(22)
        const dataSize = buf.length - 44
        const durationSec = dataSize / (sampleRate * numChannels * (bitsPerSample / 8))
        log.info({ sampleRate, bitsPerSample, numChannels, bytes: buf.length, duration: `${durationSec.toFixed(2)}s` }, 'WAV info')
      } else {
        log.info({ rawSize: buf.length }, 'Audio: not WAV format')
      }
    } catch {}

    // 直接使用多模态模型评估音频
    const result = await readAloudAgent.evaluateAudio(originalSentence, audioBase64)

    log.info({
      method: result.evaluationMethod,
      accuracy: result.accuracy,
      fluency: result.fluency,
      completeness: result.completeness,
      suggestedScore: result.suggestedScore,
      feedback: result.feedback,
    }, 'Evaluate result')
    log.debug({ words: result.words.map(w => ({
      word: w.text,
      accuracy: w.accuracy,
      matchTag: w.matchTag,
    })) }, 'Words detail')

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    log.error({ err: error }, 'Evaluation error')
    res.status(500).json({
      error: 'Failed to evaluate pronunciation',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

/**
 * POST /api/agent/read-aloud/evaluate-batch
 * 批量评测 - 多句录音合并为一次篇章评测（省额度）
 *
 * Request body:
 * - sentences: Array<{ text: string, audioBase64: string }>
 *
 * Response:
 * - results: Array<SentenceEvaluation>
 */
router.post('/evaluate-batch', async (req, res) => {
  try {
    const { sentences } = req.body

    if (!sentences || !Array.isArray(sentences) || sentences.length === 0) {
      return res.status(400).json({ error: 'sentences array is required and must not be empty' })
    }

    // 验证每句都有 text 和 audioBase64
    for (let i = 0; i < sentences.length; i++) {
      if (!sentences[i].text || !sentences[i].audioBase64) {
        return res.status(400).json({ error: `sentences[${i}] must have text and audioBase64` })
      }
    }

    log.info({ count: sentences.length, texts: sentences.map((s: { text: string }) => s.text) }, 'Batch evaluate request')

    const results = await readAloudAgent.evaluateBatch(sentences)

    log.info({ count: results.length, accuracies: results.map(r => r.accuracy) }, 'Batch evaluate complete')

    res.json({
      success: true,
      data: { results },
    })
  } catch (error) {
    log.error({ err: error }, 'Batch evaluation error')
    res.status(500).json({
      error: 'Failed to batch evaluate pronunciation',
      message: error instanceof Error ? error.message : 'Unknown error',
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

    log.info({ sceneName, sentenceCount: sentences.length }, 'Scoring request')

    const result = await readAloudScoringAgent.evaluate({ sceneName, sentences })

    log.info({ result }, 'Score result')

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    log.error({ err: error }, 'Scoring error')
    res.status(500).json({
      error: 'Failed to score read-aloud',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

/**
 * GET /api/agent/read-aloud/ise-status
 * 查看讯飞 ISE 账号池状态（调试用）
 */
router.get('/ise-status', (req, res) => {
  const status = xfyunIseService.getPoolStatus()
  res.json(status)
})

export default router

