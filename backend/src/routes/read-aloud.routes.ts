import { Router } from 'express'
import { prisma } from '../config/database.js'
import { env } from '../config/env.js'
import { notifyReadAloudPracticeComplete } from '../services/dingtalk.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authenticateStudent } from '../middleware/auth.js'
import type { StudentRequest } from '../types/index.js'

const router = Router()

// 所有跟读路由需要学生认证
router.use(authenticateStudent)

/**
 * GET /api/read-aloud/scenes
 * 获取跟读场景列表（仅返回 visible=true 的场景）
 * coverImage 现在存储的是 URL（MinIO），不再是 base64
 */
router.get('/scenes', asyncHandler(async (_req: StudentRequest, res) => {
  const scenes = await prisma.readAloudScene.findMany({
    where: { visible: true },
    select: {
      id: true,
      name: true,
      description: true,
      coverImage: true,  // 现在是 URL，传输量小
      grade: true,
      sentences: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  // 添加句子数量
  const result = scenes.map((scene: any) => ({
    ...scene,
    sentenceCount: Array.isArray(scene.sentences) ? scene.sentences.length : 0,
  }))

  // 使用统一的响应格式
  res.json({ success: true, data: result })
}))

/**
 * GET /api/read-aloud/scenes/:id
 * 获取单个跟读场景详情
 */
router.get('/scenes/:id', asyncHandler(async (req: StudentRequest, res) => {
  const id = req.params.id as string

  const scene = await prisma.readAloudScene.findUnique({
    where: { id },
  })

  if (!scene) {
    return res.status(404).json({ success: false, error: '场景不存在' })
  }

  res.json({ success: true, data: scene })
}))

/**
 * POST /api/read-aloud/start
 * 开始跟读练习，创建练习记录
 */
router.post('/start', asyncHandler(async (req: StudentRequest, res) => {
  const studentId = req.student!.studentId
  const { sceneId } = req.body

  if (!sceneId) {
    return res.status(400).json({ error: 'sceneId 是必需的' })
  }

  // 获取场景信息
  const scene = await prisma.readAloudScene.findUnique({
    where: { id: sceneId },
  })

  if (!scene) {
    return res.status(404).json({ error: '场景不存在' })
  }

  const sentences = scene.sentences as any[]
  const totalCount = sentences?.length || 0

  // 创建练习记录
  const record = await prisma.readAloudRecord.create({
    data: {
      studentId,
      sceneId,
      totalCount,
      completedCount: 0,
      sentenceResults: [],
      status: 'IN_PROGRESS',
    },
  })

  res.json({
    recordId: record.id,
    scene: {
      id: scene.id,
      name: scene.name,
      description: scene.description,
      sentences,
    },
  })
}))

/**
 * POST /api/read-aloud/evaluate
 * 评估单句跟读（代理到 Agent 服务）
 */
router.post('/evaluate', asyncHandler(async (req: StudentRequest, res) => {
  const { recordId, sentenceIndex, originalSentence, audioBase64 } = req.body

  console.log('[Backend ReadAloud] Received request:', {
    originalSentence,
    audioBase64Length: audioBase64?.length || 0,
    recordId,
    sentenceIndex,
  })

  if (!originalSentence || !audioBase64) {
    return res.status(400).json({ error: 'originalSentence 和 audioBase64 是必需的' })
  }

  // 调用 Agent 服务评估发音
  // AGENT_URL 已经包含 /api/agent，只需拼接 /read-aloud/evaluate
  const agentUrl = env.agent.url
  const requestBody = JSON.stringify({ originalSentence, audioBase64 })
  console.log('[Backend ReadAloud] Sending to Agent:', {
    url: `${agentUrl}/read-aloud/evaluate`,
    bodyLength: requestBody.length,
  })

  const response = await fetch(`${agentUrl}/read-aloud/evaluate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Api-Key': env.agent.apiKey,
    },
    body: requestBody,
  })

  if (!response.ok) {
    throw new Error(`Agent service error: ${response.status}`)
  }

  const result = await response.json() as { success: boolean; data: any }

  // 如果提供了 recordId，更新练习记录
  if (recordId && sentenceIndex !== undefined) {
    await updateRecordWithResult(recordId, sentenceIndex, result.data)
  }

  res.json(result)
}))

/**
 * POST /api/read-aloud/score
 * 整体评分（完成所有句子后调用，代理到 Agent 服务，并保存到数据库）
 */
router.post('/score', asyncHandler(async (req: StudentRequest, res) => {
  const studentId = req.student!.studentId
  const { recordId, sceneName, sceneId, sentences } = req.body

  if (!sceneName || !sentences) {
    return res.status(400).json({ error: 'sceneName 和 sentences 是必需的' })
  }

  console.log('[Backend ReadAloud] Scoring request:', { sceneName, sentenceCount: sentences.length, recordId })

  // 获取学生和班级信息（用于通知）
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { class: true },
  })

  // 调用 Agent 服务进行整体评分
  const agentUrl = env.agent.url
  const response = await fetch(`${agentUrl}/read-aloud/score`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Api-Key': env.agent.apiKey,
    },
    body: JSON.stringify({ sceneName, sentences }),
  })

  if (!response.ok) {
    throw new Error(`Agent service error: ${response.status}`)
  }

  const result = await response.json() as { success: boolean; data: any }

  // 保存评分到数据库
  if (result.success && result.data) {
    const scoreData = result.data

    try {
      if (recordId) {
        // 更新现有记录
        await prisma.readAloudRecord.update({
          where: { id: recordId },
          data: {
            status: 'COMPLETED',
            totalScore: scoreData.totalScore,
            intonationScore: scoreData.intonationScore,
            fluencyScore: scoreData.fluencyScore,
            accuracyScore: scoreData.accuracyScore,
            expressionScore: scoreData.expressionScore,
            feedback: scoreData.feedback,
            strengths: scoreData.strengths,
            improvements: scoreData.improvements,
            sentenceResults: sentences,
          },
        })
        console.log('[Backend ReadAloud] Updated record:', recordId)
      } else if (sceneId) {
        // 创建新记录
        const newRecord = await prisma.readAloudRecord.create({
          data: {
            studentId,
            sceneId,
            status: 'COMPLETED',
            completedCount: sentences.length,
            totalCount: sentences.length,
            totalScore: scoreData.totalScore,
            intonationScore: scoreData.intonationScore,
            fluencyScore: scoreData.fluencyScore,
            accuracyScore: scoreData.accuracyScore,
            expressionScore: scoreData.expressionScore,
            feedback: scoreData.feedback,
            strengths: scoreData.strengths,
            improvements: scoreData.improvements,
            sentenceResults: sentences,
          },
        })
        console.log('[Backend ReadAloud] Created new record:', newRecord.id)
      }

      // 发送钉钉通知（异步，不阻塞响应）
      if (student) {
        notifyReadAloudPracticeComplete({
          studentName: student.name,
          className: student.class?.name || '未分配班级',
          sceneName,
          totalScore: scoreData.totalScore,
          intonationScore: scoreData.intonationScore,
          fluencyScore: scoreData.fluencyScore,
          accuracyScore: scoreData.accuracyScore,
          expressionScore: scoreData.expressionScore,
          feedback: scoreData.feedback,
          strengths: scoreData.strengths,
          improvements: scoreData.improvements,
        }).catch((err: Error) => console.error('[DingTalk] Notification failed:', err))
      }
    } catch (dbError) {
      console.error('[Backend ReadAloud] Failed to save score:', dbError)
      // 数据库保存失败不影响返回评分结果
    }
  }

  res.json(result)
}))

// 辅助函数：更新练习记录
async function updateRecordWithResult(recordId: number, sentenceIndex: number, result: any) {
  try {
    const record = await prisma.readAloudRecord.findUnique({
      where: { id: recordId },
    })

    if (!record) return

    const sentenceResults = (record.sentenceResults as any[]) || []
    sentenceResults[sentenceIndex] = {
      ...result,
      evaluatedAt: new Date().toISOString(),
    }

    // 计算已完成数和平均分
    const completedCount = sentenceResults.filter(r => r != null).length
    const totalAccuracy = sentenceResults.reduce((sum, r) => sum + (r?.accuracy || 0), 0)
    const avgScore = completedCount > 0 ? Math.round(totalAccuracy / completedCount) : null

    await prisma.readAloudRecord.update({
      where: { id: recordId },
      data: {
        sentenceResults,
        completedCount,
        totalScore: avgScore,
        status: completedCount >= record.totalCount ? 'COMPLETED' : 'IN_PROGRESS',
      },
    })
  } catch (error) {
    console.error('Failed to update record:', error)
  }
}

export default router

