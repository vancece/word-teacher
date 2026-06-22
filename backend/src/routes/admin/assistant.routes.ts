/**
 * AI 助手管理路由
 * 对话 API + 向量搜索（知识库全部走 LanceDB）
 */
import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { prisma } from '../../config/database.js'
import { success, error } from '../../utils/response.js'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'
import { knowledgeVectorService } from '../../services/knowledge-vector.service.js'
import type { TeacherRequest } from '../../types/index.js'

const router = Router()

// GET /api/admin/assistant/knowledge/search - 知识搜索接口（纯向量搜索）
router.get('/knowledge/search', asyncHandler(async (req: any, res) => {
  const query = req.query.query as string || ''

  const results = await searchKnowledge(query)
  return success(res, results)
}))

// POST /api/admin/assistant/chat - AI 问答（SSE 流式）
router.post('/chat', asyncHandler(async (req: TeacherRequest, res) => {
  const { question, conversationId } = req.body
  const { teacherId } = req.teacher!

  if (!question || typeof question !== 'string') {
    return error(res, 'question is required')
  }

  // 1. 获取对话历史
  let history: { role: 'user' | 'assistant'; content: string }[] = []

  if (conversationId) {
    const conversation = await prisma.assistantConversation.findUnique({
      where: { id: conversationId },
    })
    if (conversation) {
      const msgs = conversation.messages as any[]
      history = msgs.slice(-10)
    }
  }

  // 2. 调用 Agent 服务（流式）— Agent 会自己通过 tool call 搜索知识库
  const agentUrl = env.agent.url.replace('/api/agent', '')

  const agentRes = await fetch(`${agentUrl}/api/agent/assistant/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-api-key': env.agent.apiKey,
    },
    body: JSON.stringify({ question, history, channel: 'admin_web', teacherId }),
  })

  if (!agentRes.ok) {
    logger.error({ status: agentRes.status }, '[Assistant] Agent request failed')
    return error(res, 'AI 服务暂时不可用', 503)
  }

  // 4. 流式转发给前端
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  let fullAnswer = ''
  const reader = agentRes.body?.getReader()
  const decoder = new TextDecoder()

  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        res.write(text)

        // 解析 SSE 数据收集完整回答
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'text') {
                fullAnswer += data.content
              }
            } catch {}
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  res.end()

  // 5. 保存对话记录（异步，不阻塞响应）
  saveConversation(teacherId, conversationId, question, fullAnswer, 'admin_web').catch(err => {
    logger.error({ error: err }, '[Assistant] Failed to save conversation')
  })
}))

// GET /api/admin/assistant/conversations - 对话历史列表
router.get('/conversations', asyncHandler(async (req: TeacherRequest, res) => {
  const { teacherId, isAdmin } = req.teacher!
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 20

  const where = isAdmin ? {} : { teacherId }

  const [conversations, total] = await Promise.all([
    prisma.assistantConversation.findMany({
      where,
      select: {
        id: true,
        channel: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        teacher: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.assistantConversation.count({ where }),
  ])

  return success(res, { conversations, total, page, limit })
}))

// GET /api/admin/assistant/conversations/:id - 对话详情
router.get('/conversations/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const id = parseInt(req.params.id as string)
  const { teacherId, isAdmin } = req.teacher!

  const conversation = await prisma.assistantConversation.findUnique({
    where: { id },
    include: { teacher: { select: { id: true, name: true } } },
  })

  if (!conversation) return error(res, '对话不存在', 404)
  if (!isAdmin && conversation.teacherId !== teacherId) {
    return error(res, '无权查看', 403)
  }

  return success(res, conversation)
}))

// DELETE /api/admin/assistant/conversations/:id - 删除对话
router.delete('/conversations/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const id = parseInt(req.params.id as string)
  const { teacherId, isAdmin } = req.teacher!

  const conversation = await prisma.assistantConversation.findUnique({ where: { id } })
  if (!conversation) return error(res, '对话不存在', 404)
  if (!isAdmin && conversation.teacherId !== teacherId) {
    return error(res, '无权删除', 403)
  }

  await prisma.assistantConversation.delete({ where: { id } })
  res.status(204).send()
}))

// POST /api/admin/assistant/test - 测试知识检索（调试用）
router.post('/test', asyncHandler(async (req: TeacherRequest, res) => {
  const { question } = req.body
  if (!question) return error(res, 'question is required')

  const knowledge = await searchKnowledge(question)
  return success(res, { question, matchedKnowledge: knowledge })
}))

// GET /api/admin/assistant/tools - 获取 MCP 工具列表（供测试页面使用）
router.get('/tools', asyncHandler(async (req: TeacherRequest, res) => {
  const { isAdmin } = req.teacher!
  if (!isAdmin) return error(res, '仅管理员可用', 403)

  const agentUrl = env.agent.url.replace('/api/agent', '')
  const agentRes = await fetch(`${agentUrl}/api/agent/assistant/tools`, {
    headers: { 'x-agent-api-key': env.agent.apiKey },
  })

  if (!agentRes.ok) {
    return error(res, 'Agent 服务不可用', 503)
  }

  const data = await agentRes.json() as { success: boolean; data: any }
  return success(res, data.data)
}))

// POST /api/admin/assistant/test-tool - 执行单个 MCP 工具（供测试页面使用）
router.post('/test-tool', asyncHandler(async (req: TeacherRequest, res) => {
  const { isAdmin, teacherId } = req.teacher!
  if (!isAdmin) return error(res, '仅管理员可用', 403)

  const { toolName, args } = req.body
  if (!toolName) return error(res, 'toolName is required')

  const agentUrl = env.agent.url.replace('/api/agent', '')
  const agentRes = await fetch(`${agentUrl}/api/agent/assistant/test-tool`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-api-key': env.agent.apiKey,
    },
    body: JSON.stringify({ toolName, args, teacherId }),
  })

  if (!agentRes.ok) {
    const errBody = await agentRes.text()
    return error(res, `工具执行失败: ${errBody}`, agentRes.status)
  }

  const data = await agentRes.json() as { success: boolean; data: any }
  return success(res, data.data)
}))

// GET /api/admin/assistant/knowledge/vector-status - 向量索引状态
router.get('/knowledge/vector-status', asyncHandler(async (req: TeacherRequest, res) => {
  const vectorCount = await knowledgeVectorService.getCount()

  return success(res, {
    vectorCount,
  })
}))

// --- 辅助函数 ---

/**
 * 知识搜索（纯向量搜索）
 */
async function searchKnowledge(question: string) {
  const results = await knowledgeVectorService.search(question, undefined, 5)
  if (results.length > 0) {
    logger.info({ query: question, count: results.length, topScore: results[0].score }, '[Assistant] Vector search hit')
  }
  return results.map(r => ({
    category: r.category,
    title: r.title,
    content: r.content,
  }))
}

async function saveConversation(
  teacherId: number,
  conversationId: number | undefined,
  question: string,
  answer: string,
  channel: string
) {
  const newMessages = [
    { role: 'user', content: question, timestamp: new Date().toISOString() },
    { role: 'assistant', content: answer, timestamp: new Date().toISOString() },
  ]

  if (conversationId) {
    const existing = await prisma.assistantConversation.findUnique({
      where: { id: conversationId },
    })
    if (existing) {
      const messages = [...(existing.messages as any[]), ...newMessages]
      await prisma.assistantConversation.update({
        where: { id: conversationId },
        data: { messages },
      })
      return
    }
  }

  // 创建新对话
  await prisma.assistantConversation.create({
    data: {
      teacherId,
      channel,
      title: question.slice(0, 50),
      messages: newMessages,
    },
  })
}

export default router
