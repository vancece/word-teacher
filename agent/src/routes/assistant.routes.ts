/**
 * AI 助手路由
 * 精简版：所有工具调用由 toolRegistry 管理，路由只做 HTTP 转发
 */
import { Router, type Router as RouterType } from 'express'
import { assistantAgent } from '../agents/assistant.agent.js'
import { toolRegistry } from '../tools/index.js'

const router: RouterType = Router()

// POST /api/agent/assistant/chat - 非流式回答
router.post('/chat', async (req, res) => {
  try {
    const { question, history, channel, teacherId } = req.body

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question is required' })
    }

    const answer = await assistantAgent.chat({ question, history, channel, teacherId })
    res.json({ answer })
  } catch (error) {
    console.error('Assistant Agent error:', error)
    res.status(500).json({ error: 'Failed to generate response' })
  }
})

// POST /api/agent/assistant/chat/stream - 流式回答 (SSE)
router.post('/chat/stream', async (req, res) => {
  try {
    const { question, history, channel, teacherId } = req.body

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question is required' })
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const stream = assistantAgent.chatStream({ question, history, channel, teacherId })

    for await (const event of stream) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
    res.end()
  } catch (error) {
    console.error('Assistant Agent stream error:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream response' })
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream failed' })}\n\n`)
      res.end()
    }
  }
})

// GET /api/agent/assistant/tools - 返回工具列表（供测试页面使用）
router.get('/tools', (req, res) => {
  const tools = toolRegistry.getOpenAITools()
    .filter((t): t is Extract<typeof t, { type: 'function' }> => t.type === 'function')
    .map(t => ({
      name: t.function.name,
      description: t.function.description,
      inputSchema: t.function.parameters,
    }))
  res.json({ success: true, data: tools })
})

// POST /api/agent/assistant/test-tool - 执行单个工具（供测试页面使用）
router.post('/test-tool', async (req, res) => {
  try {
    const { toolName, args, teacherId } = req.body

    if (!toolName) {
      return res.status(400).json({ success: false, message: 'toolName is required' })
    }

    const result = await toolRegistry.execute(toolName, JSON.stringify(args || {}), teacherId)
    res.json({ success: true, data: result })
  } catch (error) {
    console.error('Tool test execution error:', error)
    res.status(500).json({ success: false, message: (error as Error).message })
  }
})

export default router
