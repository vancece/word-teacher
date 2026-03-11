import { Router, type Router as RouterType } from 'express'
import { dialogueAgent } from '../agents/dialogue.agent.js'
import { omniDialogueAgent, type OmniChatRequest, type OmniEvaluationResult } from '../agents/omni-dialogue.agent.js'
import { translationAgent } from '../agents/translation.agent.js'
import { scoringAgent } from '../agents/scoring.agent.js'
import { dialogueWorkflow, type DialogueWorkflowInput } from '../workflows/dialogue-workflow.js'
import type { ChatRequest, EvaluationRequest } from '../types/index.js'

const router: RouterType = Router()

// POST /api/agent/chat - Dialogue Agent: Generate AI response (non-streaming)
router.post('/chat', async (req, res) => {
  try {
    const request: ChatRequest = req.body
    const response = await dialogueAgent.chat(request)
    res.json(response)
  } catch (error) {
    console.error('Dialogue Agent error:', error)
    res.status(500).json({ error: 'Failed to generate response' })
  }
})

// POST /api/agent/chat/stream - Dialogue Agent: Stream AI response
router.post('/chat/stream', async (req, res) => {
  const startTime = Date.now()
  console.log(`[${new Date().toISOString()}] Stream request started`)

  try {
    const request: ChatRequest = req.body
    const { stream, isComplete } = await dialogueAgent.chatStream(request)
    console.log(`[${new Date().toISOString()}] chatStream called, elapsed: ${Date.now() - startTime}ms`)

    // 设置流式响应 headers
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // 禁用 nginx 缓冲
    res.setHeader('X-Is-Complete', isComplete ? 'true' : 'false')
    res.flushHeaders() // 立即发送 headers

    let firstChunk = true
    // 使用 textStream 直接获取文本流
    for await (const chunk of stream.textStream) {
      if (firstChunk) {
        console.log(`[${new Date().toISOString()}] First chunk received, TTFB: ${Date.now() - startTime}ms`)
        firstChunk = false
      }
      res.write(chunk)
      // 强制刷新缓冲区
      if (typeof (res as any).flush === 'function') {
        (res as any).flush()
      }
    }

    console.log(`[${new Date().toISOString()}] Stream completed, total: ${Date.now() - startTime}ms`)
    res.end()
  } catch (error) {
    console.error('Dialogue Agent stream error:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream response' })
    } else {
      res.end()
    }
  }
})

// POST /api/agent/evaluate - Scoring Agent: Evaluate dialogue (100 points total)
router.post('/evaluate', async (req, res) => {
  try {
    const request: EvaluationRequest = req.body
    const response = await scoringAgent.evaluate(request)
    res.json(response)
  } catch (error) {
    console.error('Scoring Agent error:', error)
    res.status(500).json({ error: 'Failed to evaluate dialogue' })
  }
})

// POST /api/agent/chat/audio - Qwen-Omni: 音频对话（支持音频输入和输出）
router.post('/chat/audio', async (req, res) => {
  const startTime = Date.now()
  console.log(`[${new Date().toISOString()}] Audio chat request started`)

  try {
    const request: OmniChatRequest = req.body
    console.log(`[${new Date().toISOString()}] Processing audio chat, round ${request.currentRound}/${request.totalRounds}`)

    const response = await omniDialogueAgent.chat(request)

    console.log(`[${new Date().toISOString()}] Audio chat completed, total: ${Date.now() - startTime}ms`)
    console.log(`[${new Date().toISOString()}] Response text length: ${response.text.length}, has audio: ${!!response.audioBase64}`)

    res.json(response)
  } catch (error) {
    console.error('Omni Dialogue Agent error:', error)
    res.status(500).json({ error: 'Failed to process audio chat' })
  }
})

// POST /api/agent/chat/audio/stream - Qwen-Omni: 流式音频对话（文字先返回，音频最后返回）
router.post('/chat/audio/stream', async (req, res) => {
  const startTime = Date.now()
  console.log(`[${new Date().toISOString()}] Audio stream chat request started`)

  try {
    const request: OmniChatRequest = req.body

    // 设置 SSE 流式响应 headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    let firstChunk = true

    const result = await omniDialogueAgent.chatStream(
      request,
      // onTextChunk: 实时发送文字
      (textChunk) => {
        if (firstChunk) {
          console.log(`[${new Date().toISOString()}] First text chunk, TTFB: ${Date.now() - startTime}ms`)
          firstChunk = false
        }
        res.write(`data: ${JSON.stringify({ type: 'text', content: textChunk })}\n\n`)
      },
      // onAudioComplete: 最后发送完整音频
      (audioBase64) => {
        console.log(`[${new Date().toISOString()}] Sending audio, length: ${audioBase64.length}`)
        res.write(`data: ${JSON.stringify({ type: 'audio', content: audioBase64 })}\n\n`)
      }
    )

    // 发送完成标记
    res.write(`data: ${JSON.stringify({ type: 'done', isComplete: result.isComplete, text: result.text })}\n\n`)

    console.log(`[${new Date().toISOString()}] Audio stream completed, total: ${Date.now() - startTime}ms`)
    res.end()
  } catch (error) {
    console.error('Omni Dialogue Agent stream error:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream audio chat' })
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream failed' })}\n\n`)
      res.end()
    }
  }
})

// POST /api/agent/workflow - LangGraph 工作流：对话 + 翻译 + (5轮后)评分 (非流式)
router.post('/workflow', async (req, res) => {
  const startTime = Date.now()
  console.log(`[${new Date().toISOString()}] Workflow request started`)

  try {
    const input: DialogueWorkflowInput = {
      sceneId: req.body.sceneId,
      sceneName: req.body.sceneName,
      sceneDescription: req.body.sceneDescription || '',
      vocabulary: req.body.vocabulary || [],
      studentAudioBase64: req.body.studentAudioBase64,
      studentMessage: req.body.studentMessage,
      history: req.body.history || [],
      currentRound: req.body.currentRound || 1,
      totalRounds: req.body.totalRounds || 5,
      isComplete: false,
      scores: null,
    }

    console.log(`[${new Date().toISOString()}] Running workflow, round ${input.currentRound}/${input.totalRounds}`)

    const result = await dialogueWorkflow.invoke(input)

    console.log(`[${new Date().toISOString()}] Workflow completed, total: ${Date.now() - startTime}ms`)

    res.json({
      english: result.aiEnglish,
      chinese: result.aiChinese,
      audioBase64: result.aiAudio,
      isComplete: result.isComplete,
      scores: result.scores,
    })
  } catch (error) {
    console.error('Workflow error:', error)
    res.status(500).json({ error: 'Workflow failed' })
  }
})

// POST /api/agent/workflow/stream - 流式工作流：对话 + 翻译 + 评分 (SSE)
// 注意：由于 LangGraph custom 流式模式的限制，这里直接实现流式逻辑
router.post('/workflow/stream', async (req, res) => {
  const startTime = Date.now()
  console.log(`[${new Date().toISOString()}] Workflow stream request started`)

  try {
    const request: OmniChatRequest = {
      sceneId: req.body.sceneId,
      sceneName: req.body.sceneName,
      sceneDescription: req.body.sceneDescription || '',
      vocabulary: req.body.vocabulary || [],
      studentAudioBase64: req.body.studentAudioBase64,
      studentMessage: req.body.studentMessage,
      history: req.body.history || [],
      currentRound: req.body.currentRound || 1,
      totalRounds: req.body.totalRounds || 5,
    }

    // 前端累积的每轮学生语音识别结果（用于评分）
    const studentTranscriptions: string[] = req.body.studentTranscriptions || []

    // 设置 SSE 流式响应 headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    console.log(`[${new Date().toISOString()}] Running streaming workflow, round ${request.currentRound}/${request.totalRounds}`)

    let firstChunk = true
    let audioBase64 = ''

    // Step 1: 调用 OmniDialogueAgent 流式生成英文+音频
    const dialogueResult = await omniDialogueAgent.chatStream(
      request,
      // onTextChunk: 实时发送文字块
      (textChunk) => {
        if (firstChunk) {
          console.log(`[${new Date().toISOString()}] First chunk, TTFB: ${Date.now() - startTime}ms`)
          firstChunk = false
        }
        res.write(`data: ${JSON.stringify({ type: 'text', content: textChunk })}\n\n`)
      },
      // onAudioComplete: 保存音频（稍后发送）
      (audio) => {
        audioBase64 = audio
      }
    )

    console.log(`[${new Date().toISOString()}] Dialogue complete, sending audio first...`)

    // 先发送音频（重要！前端会在翻译完成后播放，所以音频要先发）
    if (audioBase64) {
      console.log(`[${new Date().toISOString()}] Sending audio, length: ${audioBase64.length}`)
      res.write(`data: ${JSON.stringify({ type: 'audio', content: audioBase64 })}\n\n`)
    }

    console.log(`[${new Date().toISOString()}] Translating...`)

    // Step 2: 调用 TranslationAgent 流式翻译
    const translation = await translationAgent.translateStream(
      dialogueResult.text,
      (chunk) => {
        res.write(`data: ${JSON.stringify({ type: 'translation_chunk', content: chunk })}\n\n`)
      }
    )
    // 发送完整翻译（用于最终保存）
    res.write(`data: ${JSON.stringify({ type: 'translation', content: translation })}\n\n`)

    // 判断对话是否完成
    const isComplete = dialogueResult.isComplete || request.currentRound >= request.totalRounds

    // 如果有语音识别结果，发送给前端（让前端知道学生说了什么）
    if (dialogueResult.studentTranscription) {
      res.write(`data: ${JSON.stringify({ type: 'student_transcription', content: dialogueResult.studentTranscription })}\n\n`)
    }

    // 注意：评分现在由前端单独调用 /api/agent/evaluate 接口
    // 这里不再自动评分，只负责对话和翻译

    // 发送完成事件
    res.write(`data: ${JSON.stringify({ type: 'done', isComplete })}\n\n`)

    console.log(`[${new Date().toISOString()}] Workflow stream completed, total: ${Date.now() - startTime}ms`)
    res.end()
  } catch (error) {
    console.error('Workflow stream error:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Workflow stream failed' })
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Workflow failed' })}\n\n`)
      res.end()
    }
  }
})

// GET /api/agent/health - Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'word-teacher-agent' })
})

export default router

