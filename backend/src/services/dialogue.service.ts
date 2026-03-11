import type { Prisma } from '@prisma/client'
import type { DialogueMessage, DialogueSession } from '../types/index.js'
import { prisma } from '../config/database.js'
import { AppError } from '../middleware/errorHandler.js'

// Agent 服务配置 - 使用函数动态获取，避免构建时读取空值
const getAgentBaseUrl = () => process.env.AGENT_URL || 'http://localhost:8000/api/agent'
const getAgentApiKey = () => process.env.AGENT_API_KEY || ''
const TOTAL_ROUNDS = 5 // 固定 5 轮对话

// Agent API 请求头（包含 API Key）
const getAgentHeaders = () => {
  const apiKey = getAgentApiKey()
  return {
    'Content-Type': 'application/json',
    ...(apiKey && { 'x-agent-api-key': apiKey }),
  }
}

// Agent API 类型
interface AgentMessage {
  role: 'ai' | 'student'
  content: string
}

interface AgentChatRequest {
  sceneId: string
  sceneName: string
  sceneDescription?: string
  vocabulary?: string[]
  currentRound: number
  totalRounds: number
  history: AgentMessage[]
  studentMessage?: string
}

interface AgentChatResponse {
  message: string
  isComplete: boolean
}

// Qwen-Omni 音频对话请求
interface AgentAudioChatRequest {
  sceneId: string
  sceneName: string
  sceneDescription?: string
  scenePrompt?: string        // 场景自定义 AI 提示词
  vocabulary?: string[]
  currentRound: number
  totalRounds: number
  history: AgentMessage[]
  studentAudioBase64?: string
  studentMessage?: string
}

// Qwen-Omni 音频对话响应
interface AgentAudioChatResponse {
  text: string
  audioBase64?: string
  isComplete: boolean
}

// LangGraph 工作流响应（含翻译和评分）
interface WorkflowResponse {
  english: string
  chinese: string
  audioBase64?: string
  isComplete: boolean
  scores?: {
    totalScore: number
    vocabularyScore: number
    grammarScore: number
    communicationScore: number
    effortScore: number
    feedback: string
    strengths: string[]
    improvements: string[]
  }
}

interface AgentEvaluateRequest {
  sceneId: string
  sceneName: string
  vocabulary?: string[]
  dialogueHistory: AgentMessage[]
}

interface AgentEvaluateResponse {
  totalScore: number
  vocabularyScore: number
  grammarScore: number
  communicationScore: number
  effortScore: number
  feedback: string
  strengths: string[]
  improvements: string[]
}

export class DialogueService {
  // 调用 Dialogue Agent 生成 AI 回复（非流式）
  private async callDialogueAgent(request: AgentChatRequest): Promise<AgentChatResponse> {
    const response = await fetch(`${getAgentBaseUrl()}/chat`, {
      method: 'POST',
      headers: getAgentHeaders(),
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Dialogue Agent error:', errorText)
      throw new AppError('Failed to get AI response', 500)
    }

    return response.json() as Promise<AgentChatResponse>
  }

  // 调用 Dialogue Agent 流式生成 AI 回复
  async callDialogueAgentStream(request: AgentChatRequest): Promise<{ response: Response; isComplete: boolean }> {
    const response = await fetch(`${getAgentBaseUrl()}/chat/stream`, {
      method: 'POST',
      headers: getAgentHeaders(),
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Dialogue Agent stream error:', errorText)
      throw new AppError('Failed to get AI stream response', 500)
    }

    const isComplete = response.headers.get('X-Is-Complete') === 'true'
    return { response, isComplete }
  }

  // 调用 Qwen-Omni Agent 音频对话
  async callAudioDialogueAgent(request: AgentAudioChatRequest): Promise<AgentAudioChatResponse> {
    console.log(`[AudioDialogue] Calling Qwen-Omni agent, round ${request.currentRound}/${request.totalRounds}`)

    const response = await fetch(`${getAgentBaseUrl()}/chat/audio`, {
      method: 'POST',
      headers: getAgentHeaders(),
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Audio Dialogue Agent error:', errorText)
      throw new AppError('Failed to get audio AI response', 500)
    }

    return response.json() as Promise<AgentAudioChatResponse>
  }

  // 调用 Qwen-Omni Agent 流式音频对话（返回 fetch Response 供转发）
  async callAudioDialogueAgentStream(request: AgentAudioChatRequest): Promise<Response> {
    console.log(`[AudioDialogue] Calling Qwen-Omni agent (stream), round ${request.currentRound}/${request.totalRounds}`)

    const response = await fetch(`${getAgentBaseUrl()}/chat/audio/stream`, {
      method: 'POST',
      headers: getAgentHeaders(),
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Audio Dialogue Agent stream error:', errorText)
      throw new AppError('Failed to stream audio AI response', 500)
    }

    return response
  }

  // 调用 LangGraph 工作流（对话 + 翻译 + 评分）
  async callDialogueWorkflow(request: AgentAudioChatRequest): Promise<WorkflowResponse> {
    console.log(`[Workflow] Calling dialogue workflow, round ${request.currentRound}/${request.totalRounds}`)

    const response = await fetch(`${getAgentBaseUrl()}/workflow`, {
      method: 'POST',
      headers: getAgentHeaders(),
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Workflow error:', errorText)
      throw new AppError('Dialogue workflow failed', 500)
    }

    return response.json() as Promise<WorkflowResponse>
  }

  // 流式调用 LangGraph 工作流（对话 + 翻译 + 评分）
  async callDialogueWorkflowStream(
    request: AgentAudioChatRequest,
    callbacks: {
      onTextChunk: (chunk: string) => void
      onTranslationChunk?: (chunk: string) => void  // 流式翻译块
      onTranslation: (translation: string) => void  // 完整翻译
      onAudio: (audioBase64: string) => void
      onStudentTranscription?: (transcription: string) => void  // 学生语音识别结果
      onScores: (scores: WorkflowResponse['scores']) => void
      onDone: (isComplete: boolean) => void
      onError: (error: string) => void
    }
  ): Promise<WorkflowResponse> {
    console.log(`[Workflow Stream] Calling dialogue workflow, round ${request.currentRound}/${request.totalRounds}`)

    const response = await fetch(`${getAgentBaseUrl()}/workflow/stream`, {
      method: 'POST',
      headers: getAgentHeaders(),
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Workflow stream error:', errorText)
      throw new AppError('Dialogue workflow stream failed', 500)
    }

    // 解析 SSE 流
    const reader = response.body?.getReader()
    if (!reader) {
      throw new AppError('No response body', 500)
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let english = ''
    let chinese = ''
    let audioBase64 = ''
    let isComplete = false
    let scores: WorkflowResponse['scores'] = undefined

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 保留不完整的行

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))

            switch (data.type) {
              case 'text':
                english += data.content
                callbacks.onTextChunk(data.content)
                break
              case 'translation_chunk':
                callbacks.onTranslationChunk?.(data.content)
                break
              case 'translation':
                chinese = data.content
                callbacks.onTranslation(data.content)
                break
              case 'audio':
                audioBase64 = data.content
                callbacks.onAudio(data.content)
                break
              case 'student_transcription':
                callbacks.onStudentTranscription?.(data.content)
                break
              case 'scores':
                scores = data.content
                callbacks.onScores(data.content)
                break
              case 'done':
                isComplete = data.isComplete
                callbacks.onDone(isComplete)
                break
              case 'error':
                callbacks.onError(data.message)
                break
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', line, e)
          }
        }
      }
    }

    return { english, chinese, audioBase64, isComplete, scores }
  }

  // 调用 Scoring Agent 评分
  private async callScoringAgent(request: AgentEvaluateRequest): Promise<AgentEvaluateResponse> {
    const response = await fetch(`${getAgentBaseUrl()}/evaluate`, {
      method: 'POST',
      headers: getAgentHeaders(),
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Scoring Agent error:', errorText)
      throw new AppError('Failed to evaluate dialogue', 500)
    }

    return response.json() as Promise<AgentEvaluateResponse>
  }

  // 转换消息格式：Backend -> Agent
  private toAgentMessages(messages: DialogueMessage[]): AgentMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.text,
    }))
  }

  // 为流式响应准备 Agent 请求（公开方法）
  async prepareStreamRequest(practiceId: number, studentText: string): Promise<{
    request: AgentChatRequest
    practice: Awaited<ReturnType<typeof prisma.practiceRecord.findUnique>> & { scene: any }
    history: DialogueMessage[]
    studentMessage: DialogueMessage
    currentRound: number
  }> {
    const practice = await prisma.practiceRecord.findUnique({
      where: { id: practiceId },
      include: { scene: true },
    })

    if (!practice) {
      throw new AppError('Practice session not found', 404)
    }

    if (practice.status !== 'IN_PROGRESS') {
      throw new AppError('Practice session is not active', 400)
    }

    const history = (practice.dialogueHistory as unknown as DialogueMessage[]) || []
    const currentRound = (practice.roundsCompleted || 0) + 1

    // 添加学生消息
    const studentMessage: DialogueMessage = {
      id: `msg_${Date.now()}`,
      role: 'student',
      text: studentText,
      timestamp: Date.now(),
    }
    history.push(studentMessage)

    const request: AgentChatRequest = {
      sceneId: practice.sceneId,
      sceneName: practice.scene.name,
      sceneDescription: practice.scene.description || undefined,
      vocabulary: (practice.scene.vocabulary as string[]) || [],
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      history: this.toAgentMessages(history.slice(0, -1)), // 不包含刚添加的学生消息
      studentMessage: studentText,
    }

    return { request, practice, history, studentMessage, currentRound }
  }

  // 流式响应完成后保存结果
  async saveStreamResult(
    practiceId: number,
    history: DialogueMessage[],
    aiText: string,
    currentRound: number,
    isComplete: boolean
  ): Promise<{ aiMessage: DialogueMessage; evaluation?: AgentEvaluateResponse }> {
    const aiMessage: DialogueMessage = {
      id: `msg_${Date.now() + 1}`,
      role: 'ai',
      text: aiText,
      timestamp: Date.now(),
    }
    history.push(aiMessage)

    const practice = await prisma.practiceRecord.findUnique({
      where: { id: practiceId },
      include: { scene: true },
    })

    if (!practice) {
      throw new AppError('Practice session not found', 404)
    }

    const newStatus = isComplete ? 'COMPLETED' : 'IN_PROGRESS'
    let evaluation: AgentEvaluateResponse | undefined

    // 如果对话结束，调用 Scoring Agent 评分
    if (isComplete) {
      evaluation = await this.callScoringAgent({
        sceneId: practice.sceneId,
        sceneName: practice.scene.name,
        vocabulary: (practice.scene.vocabulary as string[]) || [],
        dialogueHistory: this.toAgentMessages(history),
      })

      // 更新练习记录（包含评分）
      await prisma.practiceRecord.update({
        where: { id: practiceId },
        data: {
          roundsCompleted: currentRound,
          dialogueHistory: history as unknown as Prisma.InputJsonValue,
          status: newStatus,
          totalScore: evaluation.totalScore,
          pronunciationScore: evaluation.vocabularyScore,
          fluencyScore: evaluation.communicationScore,
          grammarScore: evaluation.grammarScore,
          feedbackText: evaluation.feedback,
        },
      })
    } else {
      // 更新练习记录（不含评分）
      await prisma.practiceRecord.update({
        where: { id: practiceId },
        data: {
          roundsCompleted: currentRound,
          dialogueHistory: history as unknown as Prisma.InputJsonValue,
          status: newStatus,
        },
      })
    }

    return { aiMessage, evaluation }
  }

  // 开始新的对话会话
  async startSession(userId: number, sceneId: string): Promise<DialogueSession> {
    const scene = await prisma.scene.findUnique({
      where: { id: sceneId },
    })

    if (!scene) {
      throw new AppError('Scene not found', 404)
    }

    // 创建练习记录
    const practice = await prisma.practiceRecord.create({
      data: {
        studentId: userId,
        sceneId,
        roundsCompleted: 0,
        dialogueHistory: [],
        status: 'IN_PROGRESS',
      },
    })

    // 调用 Dialogue Agent 获取开场白
    const agentResponse = await this.callDialogueAgent({
      sceneId,
      sceneName: scene.name,
      sceneDescription: scene.description || undefined,
      vocabulary: (scene.vocabulary as string[]) || [],
      currentRound: 1,
      totalRounds: TOTAL_ROUNDS,
      history: [],
    })

    const firstMessage: DialogueMessage = {
      id: `msg_${Date.now()}`,
      role: 'ai',
      text: agentResponse.message,
      timestamp: Date.now(),
    }

    // 更新对话历史
    await prisma.practiceRecord.update({
      where: { id: practice.id },
      data: {
        dialogueHistory: [firstMessage] as unknown as Prisma.InputJsonValue,
      },
    })

    return {
      practiceId: practice.id,
      sceneId,
      currentRound: 1,
      totalRounds: TOTAL_ROUNDS,
      messages: [firstMessage],
      status: 'active',
    }
  }

  // 提交学生回复并获取 AI 回复
  async submitStudentMessage(
    practiceId: number,
    studentText: string
  ): Promise<{ aiReply: DialogueMessage; session: DialogueSession; evaluation?: AgentEvaluateResponse }> {
    const practice = await prisma.practiceRecord.findUnique({
      where: { id: practiceId },
      include: { scene: true },
    })

    if (!practice) {
      throw new AppError('Practice session not found', 404)
    }

    if (practice.status !== 'IN_PROGRESS') {
      throw new AppError('Practice session is not active', 400)
    }

    const history = (practice.dialogueHistory as unknown as DialogueMessage[]) || []
    const currentRound = (practice.roundsCompleted || 0) + 1

    // 添加学生消息
    const studentMessage: DialogueMessage = {
      id: `msg_${Date.now()}`,
      role: 'student',
      text: studentText,
      timestamp: Date.now(),
    }
    history.push(studentMessage)

    // 调用 Dialogue Agent 获取 AI 回复
    const agentResponse = await this.callDialogueAgent({
      sceneId: practice.sceneId,
      sceneName: practice.scene.name,
      sceneDescription: practice.scene.description || undefined,
      vocabulary: (practice.scene.vocabulary as string[]) || [],
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      history: this.toAgentMessages(history.slice(0, -1)), // 不包含刚添加的学生消息
      studentMessage: studentText,
    })

    const aiMessage: DialogueMessage = {
      id: `msg_${Date.now() + 1}`,
      role: 'ai',
      text: agentResponse.message,
      timestamp: Date.now(),
    }
    history.push(aiMessage)

    // 判断是否结束（5轮后结束）
    const isCompleted = agentResponse.isComplete || currentRound >= TOTAL_ROUNDS
    const newStatus = isCompleted ? 'COMPLETED' : 'IN_PROGRESS'

    let evaluation: AgentEvaluateResponse | undefined

    // 如果对话结束，调用 Scoring Agent 评分
    if (isCompleted) {
      evaluation = await this.callScoringAgent({
        sceneId: practice.sceneId,
        sceneName: practice.scene.name,
        vocabulary: (practice.scene.vocabulary as string[]) || [],
        dialogueHistory: this.toAgentMessages(history),
      })

      // 更新练习记录（包含评分）
      await prisma.practiceRecord.update({
        where: { id: practiceId },
        data: {
          roundsCompleted: currentRound,
          dialogueHistory: history as unknown as Prisma.InputJsonValue,
          status: newStatus,
          totalScore: evaluation.totalScore,
          pronunciationScore: evaluation.vocabularyScore, // 复用字段
          fluencyScore: evaluation.communicationScore,    // 复用字段
          grammarScore: evaluation.grammarScore,
          feedbackText: evaluation.feedback,
        },
      })
    } else {
      // 更新练习记录（不含评分）
      await prisma.practiceRecord.update({
        where: { id: practiceId },
        data: {
          roundsCompleted: currentRound,
          dialogueHistory: history as unknown as Prisma.InputJsonValue,
          status: newStatus,
        },
      })
    }

    return {
      aiReply: aiMessage,
      session: {
        practiceId,
        sceneId: practice.sceneId,
        currentRound: currentRound + 1,
        totalRounds: TOTAL_ROUNDS,
        messages: history,
        status: isCompleted ? 'completed' : 'active',
      },
      evaluation,
    }
  }
}

export const dialogueService = new DialogueService()

