import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../config/database.js'
import { dialogueService } from '../services/dialogue.service.js'
import { notifyDialoguePracticeComplete } from '../services/dingtalk.service.js'
import { success, notFound, error } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authenticateStudent } from '../middleware/auth.js'
import type { StudentRequest } from '../types/index.js'

const router = Router()

// 所有对话路由需要学生认证
router.use(authenticateStudent)

// 开始新的对话练习（非流式，使用 mock 开场白）
router.post('/start', asyncHandler(async (req: StudentRequest, res) => {
  const schema = z.object({
    sceneId: z.string(),
  })

  const { sceneId } = schema.parse(req.body)
  const session = await dialogueService.startSession(req.student!.studentId, sceneId)

  return success(res, session, '对话开始')
}))

// 开始新的对话练习（流式，AI 生成开场白 + 音频 + 翻译）
router.post('/start/stream', asyncHandler(async (req: StudentRequest, res) => {
  const startTime = Date.now()
  console.log(`[Start Stream] Request started`)

  const schema = z.object({
    sceneId: z.string(),
  })

  const { sceneId } = schema.parse(req.body)

  // 查找场景
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
  })

  if (!scene) {
    return res.status(404).json({ error: '场景不存在' })
  }

  // 创建练习记录（空的对话历史）
  const practice = await prisma.practiceRecord.create({
    data: {
      studentId: req.student!.studentId,
      sceneId,
      roundsCompleted: 0,
      dialogueHistory: [],
      status: 'IN_PROGRESS',
    },
  })

  console.log(`[Start Stream] Practice created: ${practice.id}`)

  // 设置 SSE 流式响应 headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // 先发送 session 信息
  res.write(`data: ${JSON.stringify({
    type: 'session',
    practiceId: practice.id,
    sceneId,
    sceneName: scene.name,
    sceneDescription: scene.description || '',
    currentRound: 1,
    totalRounds: 5,
  })}\n\n`)

  try {
    let english = ''
    let chinese = ''
    let audioBase64 = ''

    // 调用流式工作流生成开场白
    await dialogueService.callDialogueWorkflowStream(
      {
        sceneId,
        sceneName: scene.name,
        sceneDescription: scene.description || undefined,
        scenePrompt: scene.prompt || undefined,  // 传递场景自定义提示词
        vocabulary: (scene.vocabulary as string[]) || [],
        currentRound: 1,  // 开场白是第 1 轮
        totalRounds: 5,
        history: [],      // 空历史
        studentAudioBase64: undefined,
        studentMessage: undefined,  // 开场白不需要学生消息
      },
      {
        onTextChunk: (chunk) => {
          english += chunk
          res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`)
        },
        onTranslationChunk: (chunk) => {
          res.write(`data: ${JSON.stringify({ type: 'translation_chunk', content: chunk })}\n\n`)
        },
        onTranslation: (translation) => {
          chinese = translation
          res.write(`data: ${JSON.stringify({ type: 'translation', content: translation })}\n\n`)
        },
        onAudio: (audio) => {
          audioBase64 = audio
          res.write(`data: ${JSON.stringify({ type: 'audio', content: audio })}\n\n`)
        },
        onScores: () => {
          // 开场白不会有评分
        },
        onDone: () => {
          // Done 会在最后统一发送
        },
        onError: (errorMsg) => {
          res.write(`data: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`)
        },
      }
    )

    console.log(`[Start Stream] AI greeting generated, elapsed: ${Date.now() - startTime}ms`)

    // 创建 AI 开场白消息
    const aiMessage = {
      id: `msg_${Date.now()}`,
      role: 'ai' as const,
      text: english,
      translation: chinese,
      timestamp: Date.now(),
    }

    // 更新练习记录（开场白算作第 1 轮的 AI 发言，roundsCompleted 设为 1）
    await prisma.practiceRecord.update({
      where: { id: practice.id },
      data: {
        dialogueHistory: [aiMessage] as any,
        roundsCompleted: 1,  // 开场白算第 1 轮
      },
    })

    console.log(`[Start Stream] Saved, total: ${Date.now() - startTime}ms`)

    // 发送完成事件
    res.write(`data: ${JSON.stringify({
      type: 'done',
      aiMessage,
      session: {
        practiceId: practice.id,
        sceneId,
        sceneName: scene.name,
        sceneDescription: scene.description || '',
        currentRound: 1,  // 用户即将开始第 1 轮对话
        totalRounds: 5,
        messages: [aiMessage],
        status: 'active',
      },
    })}\n\n`)

    res.end()
  } catch (err) {
    console.error('Start stream error:', err)
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to generate greeting' })}\n\n`)
    res.end()
  }
}))

// 提交学生语音/文字并获取 AI 回复（非流式）
router.post('/submit', asyncHandler(async (req: StudentRequest, res) => {
  const schema = z.object({
    practiceId: z.number(),
    text: z.string().min(1),
  })

  const { practiceId, text } = schema.parse(req.body)

  // 验证练习记录属于当前用户
  const practice = await prisma.practiceRecord.findUnique({
    where: { id: practiceId },
  })

  if (!practice) {
    return notFound(res, '练习记录不存在')
  }

  if (practice.studentId !== req.student!.studentId) {
    return error(res, '无权访问此练习记录', 403)
  }

  const result = await dialogueService.submitStudentMessage(practiceId, text)

  // 如果对话完成，返回评分信息
  if (result.evaluation) {
    return success(res, {
      ...result,
      evaluation: {
        totalScore: result.evaluation.totalScore,
        vocabularyScore: result.evaluation.vocabularyScore,
        grammarScore: result.evaluation.grammarScore,
        communicationScore: result.evaluation.communicationScore,
        effortScore: result.evaluation.effortScore,
        feedback: result.evaluation.feedback,
        strengths: result.evaluation.strengths,
        improvements: result.evaluation.improvements,
      },
    })
  }

  return success(res, result)
}))

// 提交学生语音/文字并获取 AI 流式回复
router.post('/submit/stream', async (req: StudentRequest, res) => {
  const startTime = Date.now()
  console.log(`[Stream] Request started`)

  try {
    const schema = z.object({
      practiceId: z.number(),
      text: z.string().min(1),
    })

    const { practiceId, text } = schema.parse(req.body)

    // 验证练习记录属于当前用户
    const practice = await prisma.practiceRecord.findUnique({
      where: { id: practiceId },
    })

    if (!practice) {
      res.status(404).json({ error: '练习记录不存在' })
      return
    }

    if (practice.studentId !== req.student!.studentId) {
      res.status(403).json({ error: '无权访问此练习记录' })
      return
    }

    // 准备流式请求
    const { request, history, currentRound } = await dialogueService.prepareStreamRequest(practiceId, text)
    console.log(`[Stream] Prepared request, elapsed: ${Date.now() - startTime}ms`)

    // 调用 Agent 流式接口
    const { response: agentResponse, isComplete } = await dialogueService.callDialogueAgentStream(request)
    console.log(`[Stream] Agent responded, elapsed: ${Date.now() - startTime}ms`)

    // 设置流式响应 headers
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // 禁用 nginx 缓冲
    res.setHeader('X-Is-Complete', isComplete ? 'true' : 'false')
    res.setHeader('X-Practice-Id', String(practiceId))
    res.setHeader('X-Current-Round', String(currentRound))
    res.flushHeaders() // 立即发送 headers

    // 收集完整文本用于保存
    let fullText = ''

    // 转发流
    const reader = agentResponse.body?.getReader()
    if (!reader) {
      throw new Error('No reader available')
    }

    const decoder = new TextDecoder()
    let firstChunk = true

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        console.log(`[Stream] Completed, total: ${Date.now() - startTime}ms`)
        // 流结束，保存结果
        const { aiMessage, evaluation } = await dialogueService.saveStreamResult(
          practiceId,
          history,
          fullText,
          currentRound,
          isComplete
        )

        // 发送完成事件（包含完整消息和评分）
        const completeData = JSON.stringify({
          type: 'complete',
          aiMessage,
          isComplete,
          evaluation: evaluation || null,
          currentRound: currentRound + 1,
        })
        res.write(`\n\ndata: ${completeData}\n\n`)
        res.end()
        break
      }

      // 解码并收集文本
      const chunk = decoder.decode(value, { stream: true })
      if (firstChunk) {
        console.log(`[Stream] First chunk received, TTFB: ${Date.now() - startTime}ms`)
        firstChunk = false
      }
      fullText += chunk
      res.write(chunk)

      // 强制刷新
      if (typeof (res as any).flush === 'function') {
        (res as any).flush()
      }
    }
  } catch (err) {
    console.error('Stream error:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream response' })
    } else {
      res.end()
    }
  }
})

// 提交学生音频并获取 AI 音频回复（Qwen-Omni）
router.post('/submit/audio', asyncHandler(async (req: StudentRequest, res) => {
  const startTime = Date.now()
  console.log(`[AudioSubmit] Request started`)

  const schema = z.object({
    practiceId: z.number(),
    audioBase64: z.string().optional(),  // 音频 Base64
    text: z.string().optional(),          // 或者文本
  }).refine(data => data.audioBase64 || data.text, {
    message: '必须提供音频或文本',
  })

  const { practiceId, audioBase64, text } = schema.parse(req.body)

  // 验证练习记录属于当前用户
  const practice = await prisma.practiceRecord.findUnique({
    where: { id: practiceId },
    include: { scene: true },
  })

  if (!practice) {
    return res.status(404).json({ error: '练习记录不存在' })
  }

  if (practice.studentId !== req.student!.studentId) {
    return res.status(403).json({ error: '无权访问此练习记录' })
  }

  if (practice.status !== 'IN_PROGRESS') {
    return res.status(400).json({ error: '练习已结束' })
  }

  const history = (practice.dialogueHistory as unknown as Array<{ id: string; role: 'ai' | 'student'; text: string; timestamp: number }>) || []
  const currentRound = (practice.roundsCompleted || 0) + 1
  const totalRounds = 5 // 固定 5 轮

  console.log(`[AudioSubmit] Prepared, elapsed: ${Date.now() - startTime}ms`)

  // 调用 Qwen-Omni Agent
  const agentResponse = await dialogueService.callAudioDialogueAgent({
    sceneId: practice.sceneId,
    sceneName: practice.scene.name,
    sceneDescription: practice.scene.description || undefined,
    scenePrompt: practice.scene.prompt || undefined,  // 传递场景自定义提示词
    vocabulary: (practice.scene.vocabulary as string[]) || [],
    currentRound,
    totalRounds,
    history: history.map(m => ({ role: m.role, content: m.text })),
    studentAudioBase64: audioBase64,
    studentMessage: text,
  })

  console.log(`[AudioSubmit] Agent responded, elapsed: ${Date.now() - startTime}ms`)

  // 添加学生消息（用 AI 识别的文本或原始文本）
  const studentMessage = {
    id: `msg_${Date.now()}`,
    role: 'student' as const,
    text: text || '(语音输入)',
    timestamp: Date.now(),
  }
  history.push(studentMessage)

  // 添加 AI 回复
  const aiMessage = {
    id: `msg_${Date.now() + 1}`,
    role: 'ai' as const,
    text: agentResponse.text,
    timestamp: Date.now(),
  }
  history.push(aiMessage)

  // 判断是否结束
  const isComplete = agentResponse.isComplete || currentRound >= totalRounds
  const newStatus = isComplete ? 'COMPLETED' : 'IN_PROGRESS'

  // 更新练习记录
  await prisma.practiceRecord.update({
    where: { id: practiceId },
    data: {
      roundsCompleted: currentRound,
      dialogueHistory: history as any,
      status: newStatus,
    },
  })

  console.log(`[AudioSubmit] Saved, total: ${Date.now() - startTime}ms`)

  // 返回结果
  return res.json({
    success: true,
    data: {
      aiMessage,
      aiAudioBase64: agentResponse.audioBase64,
      session: {
        practiceId,
        sceneId: practice.sceneId,
        sceneName: practice.scene.name,
        sceneDescription: practice.scene.description,
        currentRound: currentRound + 1,
        totalRounds,
        messages: history,
        status: isComplete ? 'completed' : 'active',
      },
      isComplete,
    },
  })
}))

// 提交学生音频并获取 AI 流式回复（先文字后音频）
router.post('/submit/audio/stream', asyncHandler(async (req: StudentRequest, res) => {
  const startTime = Date.now()
  console.log(`[AudioStreamSubmit] Request started`)

  const schema = z.object({
    practiceId: z.number(),
    audioBase64: z.string().optional(),
    text: z.string().optional(),
  }).refine(data => data.audioBase64 || data.text, {
    message: '必须提供音频或文本',
  })

  const { practiceId, audioBase64, text } = schema.parse(req.body)

  // 验证练习记录
  const practice = await prisma.practiceRecord.findUnique({
    where: { id: practiceId },
    include: { scene: true },
  })

  if (!practice) {
    return res.status(404).json({ error: '练习记录不存在' })
  }
  if (practice.studentId !== req.student!.studentId) {
    return res.status(403).json({ error: '无权访问此练习记录' })
  }
  if (practice.status !== 'IN_PROGRESS') {
    return res.status(400).json({ error: '练习已结束' })
  }

  const history = (practice.dialogueHistory as unknown as Array<{ id: string; role: 'ai' | 'student'; text: string; timestamp: number }>) || []
  const currentRound = (practice.roundsCompleted || 0) + 1
  const totalRounds = 5

  // 设置 SSE 响应 headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  try {
    // 调用 Agent 流式接口
    const agentResponse = await dialogueService.callAudioDialogueAgentStream({
      sceneId: practice.sceneId,
      sceneName: practice.scene.name,
      sceneDescription: practice.scene.description || undefined,
      scenePrompt: practice.scene.prompt || undefined,  // 传递场景自定义提示词
      vocabulary: (practice.scene.vocabulary as string[]) || [],
      currentRound,
      totalRounds,
      history: history.map(m => ({ role: m.role, content: m.text })),
      studentAudioBase64: audioBase64,
      studentMessage: text,
    })

    // 转发 Agent 的 SSE 流
    const reader = agentResponse.body?.getReader()
    if (!reader) {
      throw new Error('No response body from agent')
    }

    const decoder = new TextDecoder()
    let fullText = ''
    let audioData = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      // 直接转发给前端
      res.write(chunk)

      // 解析事件以收集完整数据
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'text') {
              fullText += data.content
            } else if (data.type === 'audio') {
              audioData = data.content
            }
          } catch { /* ignore */ }
        }
      }
    }

    // 流结束后更新数据库
    const studentMessage = {
      id: `msg_${Date.now()}`,
      role: 'student' as const,
      text: text || '(语音输入)',
      timestamp: Date.now(),
    }
    history.push(studentMessage)

    const aiMessage = {
      id: `msg_${Date.now() + 1}`,
      role: 'ai' as const,
      text: fullText,
      timestamp: Date.now(),
    }
    history.push(aiMessage)

    const isComplete = currentRound >= totalRounds

    await prisma.practiceRecord.update({
      where: { id: practiceId },
      data: {
        roundsCompleted: currentRound,
        dialogueHistory: history as any,
        status: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
      },
    })

    console.log(`[AudioStreamSubmit] Completed, total: ${Date.now() - startTime}ms`)
    res.end()
  } catch (err) {
    console.error('[AudioStreamSubmit] Error:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Stream failed' })
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream failed' })}\n\n`)
      res.end()
    }
  }
}))

// 提交学生消息并获取 AI 回复（LangGraph 工作流：对话+翻译+评分）
router.post('/submit/workflow', asyncHandler(async (req: StudentRequest, res) => {
  const startTime = Date.now()
  console.log(`[Workflow] Request started`)

  const schema = z.object({
    practiceId: z.number(),
    audioBase64: z.string().optional(),
    text: z.string().optional(),
  }).refine(data => data.audioBase64 || data.text, {
    message: '必须提供音频或文本',
  })

  const { practiceId, audioBase64, text } = schema.parse(req.body)

  // 验证练习记录
  const practice = await prisma.practiceRecord.findUnique({
    where: { id: practiceId },
    include: { scene: true },
  })

  if (!practice) {
    return res.status(404).json({ error: '练习记录不存在' })
  }
  if (practice.studentId !== req.student!.studentId) {
    return res.status(403).json({ error: '无权访问此练习记录' })
  }
  if (practice.status !== 'IN_PROGRESS') {
    return res.status(400).json({ error: '练习已结束' })
  }

  const history = (practice.dialogueHistory as unknown as Array<{ id: string; role: 'ai' | 'student'; text: string; timestamp: number }>) || []
  const currentRound = (practice.roundsCompleted || 0) + 1
  const totalRounds = 5

  // 调用 LangGraph 工作流
  const workflowResult = await dialogueService.callDialogueWorkflow({
    sceneId: practice.sceneId,
    sceneName: practice.scene.name,
    sceneDescription: practice.scene.description || undefined,
    vocabulary: (practice.scene.vocabulary as string[]) || [],
    currentRound,
    totalRounds,
    history: history.map(m => ({ role: m.role, content: m.text })),
    studentAudioBase64: audioBase64,
    studentMessage: text,
  })

  console.log(`[Workflow] Agent responded, elapsed: ${Date.now() - startTime}ms`)

  // 添加学生消息
  const studentMessage = {
    id: `msg_${Date.now()}`,
    role: 'student' as const,
    text: text || '(语音输入)',
    timestamp: Date.now(),
  }
  history.push(studentMessage)

  // 添加 AI 回复（含中文翻译）
  const aiMessage = {
    id: `msg_${Date.now() + 1}`,
    role: 'ai' as const,
    text: workflowResult.english,
    translation: workflowResult.chinese,  // 中文翻译
    timestamp: Date.now(),
  }
  history.push(aiMessage)

  const isComplete = workflowResult.isComplete || currentRound >= totalRounds

  // 更新练习记录
  const updateData: any = {
    roundsCompleted: currentRound,
    dialogueHistory: history as any,
    status: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
  }

  // 如果有评分，保存评分
  if (workflowResult.scores) {
    updateData.evaluation = workflowResult.scores
    updateData.score = workflowResult.scores.totalScore
  }

  await prisma.practiceRecord.update({
    where: { id: practiceId },
    data: updateData,
  })

  console.log(`[Workflow] Saved, total: ${Date.now() - startTime}ms`)

  // 返回结果
  return res.json({
    success: true,
    data: {
      aiMessage: {
        ...aiMessage,
        english: workflowResult.english,
        chinese: workflowResult.chinese,
      },
      aiAudioBase64: workflowResult.audioBase64,
      session: {
        practiceId,
        sceneId: practice.sceneId,
        sceneName: practice.scene.name,
        sceneDescription: practice.scene.description,
        currentRound: currentRound + 1,
        totalRounds,
        messages: history,
        status: isComplete ? 'completed' : 'active',
      },
      isComplete,
      scores: workflowResult.scores,
    },
  })
}))

// 提交学生消息并获取 AI 回复（LangGraph 工作流 - 流式版本）
router.post('/submit/workflow/stream', asyncHandler(async (req: StudentRequest, res) => {
  const startTime = Date.now()
  console.log(`[Workflow Stream] Request started`)

  const schema = z.object({
    practiceId: z.number(),
    audioBase64: z.string().optional(),
    text: z.string().optional(),
  }).refine(data => data.audioBase64 || data.text, {
    message: '必须提供音频或文本',
  })

  const { practiceId, audioBase64, text } = schema.parse(req.body)

  // 验证练习记录（包含学生和班级信息）
  const practice = await prisma.practiceRecord.findUnique({
    where: { id: practiceId },
    include: {
      scene: true,
      student: {
        include: { class: true }
      }
    },
  })

  if (!practice) {
    return res.status(404).json({ error: '练习记录不存在' })
  }
  if (practice.studentId !== req.student!.studentId) {
    return res.status(403).json({ error: '无权访问此练习记录' })
  }
  if (practice.status !== 'IN_PROGRESS') {
    return res.status(400).json({ error: '练习已结束' })
  }

  const history = (practice.dialogueHistory as unknown as Array<{ id: string; role: 'ai' | 'student'; text: string; translation?: string; timestamp: number }>) || []
  const currentRound = (practice.roundsCompleted || 0) + 1
  const totalRounds = 5

  // 设置 SSE 流式响应 headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // 学生语音识别结果（由 Agent 回传）
  let studentTranscription: string | undefined

  try {
    // 调用流式 LangGraph 工作流
    const workflowResult = await dialogueService.callDialogueWorkflowStream(
      {
        sceneId: practice.sceneId,
        sceneName: practice.scene.name,
        sceneDescription: practice.scene.description || undefined,
        scenePrompt: practice.scene.prompt || undefined,  // 传递场景自定义提示词
        vocabulary: (practice.scene.vocabulary as string[]) || [],
        currentRound,
        totalRounds,
        history: history.map(m => ({ role: m.role, content: m.text })),
        studentAudioBase64: audioBase64,
        studentMessage: text,
      },
      {
        onTextChunk: (chunk) => {
          res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`)
        },
        onTranslationChunk: (chunk) => {
          res.write(`data: ${JSON.stringify({ type: 'translation_chunk', content: chunk })}\n\n`)
        },
        onTranslation: (translation) => {
          res.write(`data: ${JSON.stringify({ type: 'translation', content: translation })}\n\n`)
        },
        onAudio: (audio) => {
          res.write(`data: ${JSON.stringify({ type: 'audio', content: audio })}\n\n`)
        },
        onStudentTranscription: (transcription) => {
          // 透传学生语音识别结果给前端
          res.write(`data: ${JSON.stringify({ type: 'student_transcription', content: transcription })}\n\n`)
          // 保存到变量，用于后面更新学生消息
          studentTranscription = transcription
        },
        onScores: (scores) => {
          res.write(`data: ${JSON.stringify({ type: 'scores', content: scores })}\n\n`)
        },
        onDone: () => {
          // Done 会在最后统一发送
        },
        onError: (error) => {
          res.write(`data: ${JSON.stringify({ type: 'error', message: error })}\n\n`)
        },
      }
    )

    console.log(`[Workflow Stream] Agent responded, elapsed: ${Date.now() - startTime}ms`)

    // 添加学生消息（优先使用语音识别结果）
    const studentMessage = {
      id: `msg_${Date.now()}`,
      role: 'student' as const,
      text: studentTranscription || text || '(语音输入)',
      timestamp: Date.now(),
    }
    history.push(studentMessage)

    // 添加 AI 回复（含中文翻译）
    const aiMessage = {
      id: `msg_${Date.now() + 1}`,
      role: 'ai' as const,
      text: workflowResult.english,
      translation: workflowResult.chinese,
      timestamp: Date.now(),
    }
    history.push(aiMessage)

    const isComplete = workflowResult.isComplete || currentRound >= totalRounds

    // 更新练习记录（注意：评分由独立的 /evaluate 接口处理，这里只更新对话历史）
    // 如果对话完成，状态暂时设为 IN_PROGRESS，等评分完成后再改为 COMPLETED
    const updateData: any = {
      roundsCompleted: currentRound,
      dialogueHistory: history as any,
      status: isComplete ? 'IN_PROGRESS' : 'IN_PROGRESS',  // 评分后才改为 COMPLETED
    }

    await prisma.practiceRecord.update({
      where: { id: practiceId },
      data: updateData,
    })

    console.log(`[Workflow Stream] Saved, total: ${Date.now() - startTime}ms`)

    // 注意：评分和钉钉通知现在由独立的 /evaluate 接口处理

    // 发送完成事件（包含完整数据供前端使用）
    // 如果已完成，currentRound 保持为 totalRounds；否则显示下一轮
    const nextRound = isComplete ? totalRounds : currentRound + 1
    res.write(`data: ${JSON.stringify({
      type: 'done',
      isComplete,
      aiMessage,
      session: {
        practiceId,
        sceneId: practice.sceneId,
        sceneName: practice.scene.name,
        sceneDescription: practice.scene.description,
        currentRound: nextRound,
        totalRounds,
        status: isComplete ? 'completed' : 'active',
      },
    })}\n\n`)

    res.end()
  } catch (error) {
    console.error('Workflow stream error:', error)
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Workflow failed' })}\n\n`)
    res.end()
  }
}))

// 独立评分接口 - 5轮对话完成后由前端单独调用
router.post('/evaluate', asyncHandler(async (req: StudentRequest, res) => {
  const startTime = Date.now()
  console.log(`[Evaluate] Request started`)

  const schema = z.object({
    practiceId: z.number(),
    dialogueHistory: z.array(z.object({
      role: z.enum(['ai', 'student']),
      content: z.string(),
    })),
  })

  const { practiceId, dialogueHistory } = schema.parse(req.body)

  // 验证练习记录
  const practice = await prisma.practiceRecord.findUnique({
    where: { id: practiceId },
    include: { scene: true, student: { include: { class: true } } },
  })

  if (!practice) {
    return res.status(404).json({ error: '练习记录不存在' })
  }

  if (practice.studentId !== req.student!.studentId) {
    return res.status(403).json({ error: '无权访问此练习记录' })
  }

  // 调用 Agent 评分接口（使用 AGENT_URL，与 docker-compose.prod.yml 一致）
  const agentBaseUrl = process.env.AGENT_URL || process.env.AGENT_BASE_URL || 'http://localhost:3002/api/agent'
  console.log(`[Evaluate] Calling agent evaluate API at ${agentBaseUrl}/evaluate`)

  let agentResponse: Response
  try {
    agentResponse = await fetch(`${agentBaseUrl}/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Api-Key': process.env.AGENT_API_KEY || 'dev-key',
      },
      body: JSON.stringify({
        sceneId: practice.sceneId,
        sceneName: practice.scene.name,
        vocabulary: (practice.scene.vocabulary as string[]) || [],
        dialogueHistory,
      }),
    })
  } catch (fetchError) {
    console.error('[Evaluate] Fetch error:', fetchError)
    return res.status(500).json({ error: '评分服务连接失败', details: String(fetchError) })
  }

  if (!agentResponse.ok) {
    const errorText = await agentResponse.text()
    console.error('[Evaluate] Agent error:', agentResponse.status, errorText)
    return res.status(500).json({ error: '评分服务失败', details: errorText })
  }

  interface EvaluationScores {
    totalScore: number
    vocabularyScore: number
    grammarScore: number
    communicationScore: number
    effortScore: number
    feedback: string
    strengths: string[]
    improvements: string[]
  }

  const scores = await agentResponse.json() as EvaluationScores
  console.log(`[Evaluate] Scores received:`, scores)

  // 更新练习记录
  await prisma.practiceRecord.update({
    where: { id: practiceId },
    data: {
      status: 'COMPLETED',
      totalScore: scores.totalScore,
      grammarScore: scores.grammarScore,
      feedbackText: JSON.stringify(scores),
    },
  })

  // 发送钉钉通知（异步）
  notifyDialoguePracticeComplete({
    studentName: practice.student.name,
    className: practice.student.class?.name || '未分配班级',
    sceneName: practice.scene.name,
    totalScore: scores.totalScore || 0,
    vocabularyScore: scores.vocabularyScore,
    grammarScore: scores.grammarScore,
    communicationScore: scores.communicationScore,
    effortScore: scores.effortScore,
    feedback: scores.feedback,
    strengths: scores.strengths,
    improvements: scores.improvements,
  }).catch((err: Error) => console.error('[DingTalk] Notification failed:', err))

  console.log(`[Evaluate] Complete, elapsed: ${Date.now() - startTime}ms`)

  return success(res, scores)
}))

// 获取当前对话会话状态
router.get('/session/:practiceId', asyncHandler(async (req: StudentRequest, res) => {
  const practiceId = parseInt(req.params.practiceId as string, 10)

  const practice = await prisma.practiceRecord.findUnique({
    where: { id: practiceId },
    include: { scene: true },
  })

  if (!practice) {
    return notFound(res, '练习记录不存在')
  }

  if (practice.studentId !== req.student!.studentId) {
    return error(res, '无权访问此练习记录', 403)
  }

  return success(res, {
    practiceId: practice.id,
    sceneId: practice.sceneId,
    sceneName: practice.scene.name,
    currentRound: (practice.roundsCompleted || 0) + 1,
    totalRounds: practice.scene.rounds,
    messages: practice.dialogueHistory || [],
    status: practice.status.toLowerCase(),
  })
}))

// 获取练习历史
router.get('/history', asyncHandler(async (req: StudentRequest, res) => {
  const page = parseInt(req.query.page as string) || 1
  const pageSize = parseInt(req.query.pageSize as string) || 10

  const [records, total] = await Promise.all([
    prisma.practiceRecord.findMany({
      where: { studentId: req.student!.studentId },
      include: {
        scene: {
          select: { name: true, icon: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.practiceRecord.count({
      where: { studentId: req.student!.studentId },
    }),
  ])

  return success(res, {
    items: records.map((r) => ({
      id: r.id,
      sceneId: r.sceneId,
      sceneName: r.scene.name,
      sceneIcon: r.scene.icon,
      totalScore: r.totalScore,
      roundsCompleted: r.roundsCompleted,
      status: r.status,
      createdAt: r.createdAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
}))

// 获取单个练习详情（含评分报告）
router.get('/report/:practiceId', asyncHandler(async (req: StudentRequest, res) => {
  const practiceId = parseInt(req.params.practiceId as string, 10)

  const practice = await prisma.practiceRecord.findUnique({
    where: { id: practiceId },
    include: { scene: true },
  })

  if (!practice) {
    return notFound(res, '练习记录不存在')
  }

  // 仅允许学生查看自己的练习记录
  if (practice.studentId !== req.student!.studentId) {
    return error(res, '无权访问此练习记录', 403)
  }

  return success(res, {
    id: practice.id,
    scene: {
      id: practice.scene.id,
      name: practice.scene.name,
      icon: practice.scene.icon,
    },
    scores: {
      total: practice.totalScore,
      pronunciation: practice.pronunciationScore,
      fluency: practice.fluencyScore,
      grammar: practice.grammarScore,
    },
    roundsCompleted: practice.roundsCompleted,
    durationSeconds: practice.durationSeconds,
    feedbackText: practice.feedbackText,
    dialogueHistory: practice.dialogueHistory,
    status: practice.status,
    createdAt: practice.createdAt,
  })
}))

export default router

