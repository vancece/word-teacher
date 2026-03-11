import { apiClient, type ApiResponse } from './client'

export interface DialogueMessage {
  id: string
  role: 'ai' | 'student'
  text: string
  translation?: string  // 中文翻译（仅 AI 消息）
  timestamp: number
}

export interface DialogueSession {
  practiceId: number
  sceneId: string
  sceneName?: string
  sceneDescription?: string
  currentRound: number
  totalRounds: number
  messages: DialogueMessage[]
  status: 'active' | 'completed'
}

export interface SubmitResponse {
  aiReply: DialogueMessage
  session: DialogueSession
}

export interface PracticeHistoryItem {
  id: number
  sceneId: string
  sceneName: string
  sceneIcon: string
  totalScore?: number
  roundsCompleted: number
  status: string
  createdAt: string
}

export interface PracticeReport {
  id: number
  scene: {
    id: string
    name: string
    icon: string
  }
  scores: {
    total?: number
    pronunciation?: number
    fluency?: number
    grammar?: number
  }
  roundsCompleted: number
  durationSeconds?: number
  feedbackText?: string
  dialogueHistory: DialogueMessage[]
  status: string
  createdAt: string
}

export interface StreamCompleteEvent {
  type: 'complete'
  aiMessage: DialogueMessage
  isComplete: boolean
  evaluation: {
    totalScore: number
    vocabularyScore: number
    grammarScore: number
    communicationScore: number
    effortScore: number
    feedback: string
    strengths: string[]
    improvements: string[]
  } | null
  currentRound: number
}

// 音频对话响应
export interface AudioSubmitResponse {
  aiMessage: DialogueMessage
  aiAudioBase64?: string
  session: DialogueSession
  isComplete: boolean
}

export const dialogueApi = {
  // 开始新的对话练习（非流式）
  start: (sceneId: string) =>
    apiClient.post<{ sceneId: string }, ApiResponse<DialogueSession>>('/dialogue/start', { sceneId }),

  // 开始新的对话练习（流式，AI 生成开场白 + 音频 + 翻译）
  startStream: async (
    sceneId: string,
    callbacks: {
      onSession: (data: { practiceId: number; sceneId: string; sceneName: string; currentRound: number; totalRounds: number }) => void
      onTextChunk: (chunk: string) => void
      onTranslationChunk?: (chunk: string) => void  // 流式翻译块
      onTranslation: (translation: string) => void  // 完整翻译
      onAudio: (audioBase64: string) => void
      onDone: (data: { aiMessage: DialogueMessage; session: DialogueSession }) => void
      onError: (error: string) => void
    }
  ): Promise<void> => {
    const token = localStorage.getItem('token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

    const response = await fetch(`${baseUrl}/dialogue/start/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ sceneId }),
    })

    if (!response.ok) {
      throw new Error('Failed to start dialogue stream')
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))

            switch (data.type) {
              case 'session':
                callbacks.onSession(data)
                break
              case 'text':
                callbacks.onTextChunk(data.content)
                break
              case 'translation_chunk':
                callbacks.onTranslationChunk?.(data.content)
                break
              case 'translation':
                callbacks.onTranslation(data.content)
                break
              case 'audio':
                callbacks.onAudio(data.content)
                break
              case 'done':
                callbacks.onDone(data)
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
  },

  // 提交学生回复（非流式）
  submit: (practiceId: number, text: string) =>
    apiClient.post<{ practiceId: number; text: string }, ApiResponse<SubmitResponse>>(
      '/dialogue/submit',
      { practiceId, text }
    ),

  // 提交学生回复（流式）
  submitStream: async (
    practiceId: number,
    text: string,
    onChunk: (text: string) => void,
    onComplete: (event: StreamCompleteEvent) => void
  ) => {
    const token = localStorage.getItem('token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

    const response = await fetch(`${baseUrl}/dialogue/submit/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ practiceId, text }),
    })

    if (!response.ok) {
      throw new Error('Failed to stream response')
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No reader available')
    }

    const decoder = new TextDecoder()
    let fullText = '' // 累积完整文本

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })

      // 检查是否是完成事件 (格式: "\n\ndata: {...}\n\n")
      if (chunk.includes('data: ')) {
        // 提取 data: 之前的文本
        const dataIndex = chunk.indexOf('data: ')
        const textPart = chunk.slice(0, dataIndex).replace(/^\n+/, '')
        if (textPart) {
          // 逐字符显示，产生打字效果
          for (const char of textPart) {
            fullText += char
            onChunk(fullText)
            // 微小延迟让 React 有时间渲染
            await new Promise(resolve => setTimeout(resolve, 0))
          }
        }

        // 解析完成事件
        const jsonMatch = chunk.match(/data: ({.*})/s)
        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[1]) as StreamCompleteEvent
            if (data.type === 'complete') {
              onComplete(data)
              return
            }
          } catch (e) {
            console.error('Failed to parse complete event:', e)
          }
        }
      } else {
        // 普通文本块 - 逐字符显示
        for (const char of chunk) {
          fullText += char
          onChunk(fullText)
          // 微小延迟让 React 有时间渲染
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }
    }
  },

  // 获取当前会话状态
  getSession: (practiceId: number) =>
    apiClient.get<void, ApiResponse<DialogueSession>>(`/dialogue/session/${practiceId}`),

  // 获取练习历史
  getHistory: (page = 1, pageSize = 10) =>
    apiClient.get<void, ApiResponse<{
      items: PracticeHistoryItem[]
      total: number
      page: number
      pageSize: number
      totalPages: number
    }>>(`/dialogue/history?page=${page}&pageSize=${pageSize}`),

  // 获取练习报告
  getReport: (practiceId: number) =>
    apiClient.get<void, ApiResponse<PracticeReport>>(`/dialogue/report/${practiceId}`),

  // 提交音频并获取 AI 音频回复（Qwen-Omni）
  submitAudio: async (
    practiceId: number,
    audioBase64?: string,
    text?: string
  ): Promise<ApiResponse<AudioSubmitResponse>> => {
    const token = localStorage.getItem('token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

    const response = await fetch(`${baseUrl}/dialogue/submit/audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ practiceId, audioBase64, text }),
    })

    if (!response.ok) {
      throw new Error('Failed to submit audio')
    }

    return response.json()
  },

  // 流式提交音频：先返回文字流，最后返回音频
  submitAudioStream: async (
    practiceId: number,
    audioBase64: string | undefined,
    text: string | undefined,
    onTextChunk: (text: string) => void,
    onAudioComplete: (audioBase64: string) => void,
    onDone: (isComplete: boolean) => void
  ): Promise<void> => {
    const token = localStorage.getItem('token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

    const response = await fetch(`${baseUrl}/dialogue/submit/audio/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ practiceId, audioBase64, text }),
    })

    if (!response.ok) {
      throw new Error('Failed to submit audio stream')
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'text') {
              onTextChunk(data.content)
            } else if (data.type === 'audio') {
              onAudioComplete(data.content)
            } else if (data.type === 'done') {
              onDone(data.isComplete)
            }
          } catch { /* ignore parse errors */ }
        }
      }
    }
  },

  // 使用 LangGraph 工作流提交（对话+翻译+评分）- 非流式
  submitWorkflow: async (
    practiceId: number,
    audioBase64?: string,
    text?: string
  ): Promise<ApiResponse<WorkflowSubmitResponse>> => {
    const token = localStorage.getItem('token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

    const response = await fetch(`${baseUrl}/dialogue/submit/workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ practiceId, audioBase64, text }),
    })

    if (!response.ok) {
      throw new Error('Failed to submit workflow')
    }

    return response.json()
  },

  // 使用 LangGraph 工作流提交（对话+翻译+评分）- 流式
  submitWorkflowStream: async (
    practiceId: number,
    audioBase64: string | undefined,
    text: string | undefined,
    callbacks: {
      onTextChunk: (chunk: string) => void
      onTranslationChunk?: (chunk: string) => void  // 流式翻译块
      onTranslation: (translation: string) => Promise<void> | void  // 完整翻译
      onAudio: (audioBase64: string) => void
      onStudentTranscription?: (transcription: string) => void  // 学生语音识别结果
      onScores: (scores: WorkflowSubmitResponse['scores']) => void
      onDone: (data: { isComplete: boolean; aiMessage: DialogueMessage; session: DialogueSession; scores?: WorkflowSubmitResponse['scores'] }) => Promise<void> | void
      onError: (error: string) => void
    }
  ): Promise<void> => {
    const token = localStorage.getItem('token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

    const response = await fetch(`${baseUrl}/dialogue/submit/workflow/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ practiceId, audioBase64, text }),
    })

    if (!response.ok) {
      throw new Error('Failed to start workflow stream')
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    // 处理单行 SSE 数据的辅助函数
    const processLine = async (line: string) => {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))

          switch (data.type) {
            case 'text':
              callbacks.onTextChunk(data.content)
              break
            case 'translation_chunk':
              callbacks.onTranslationChunk?.(data.content)
              break
            case 'translation':
              await callbacks.onTranslation(data.content)
              break
            case 'audio':
              callbacks.onAudio(data.content)
              break
            case 'student_transcription':
              callbacks.onStudentTranscription?.(data.content)
              break
            case 'scores':
              callbacks.onScores(data.content)
              break
            case 'done':
              await callbacks.onDone(data)
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

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        // 流结束时，处理 buffer 中剩余的数据
        if (buffer.trim()) {
          await processLine(buffer.trim())
        }
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        await processLine(line)
      }
    }
  },
}

// 工作流响应类型（含翻译和评分）
export interface WorkflowSubmitResponse {
  aiMessage: DialogueMessage & {
    english: string
    chinese: string
  }
  aiAudioBase64?: string
  session: DialogueSession
  isComplete: boolean
  scores?: EvaluationScores
}

// 评分结果类型
export interface EvaluationScores {
  totalScore: number
  vocabularyScore: number
  grammarScore: number
  communicationScore: number
  effortScore: number
  feedback: string
  strengths: string[]
  improvements: string[]
}

// 评分请求参数
export interface EvaluateRequest {
  practiceId: number
  dialogueHistory: Array<{
    role: 'ai' | 'student'
    content: string
  }>
}

// 独立评分 API
export const evaluationApi = {
  // 调用评分接口（5轮对话完成后由前端主动调用）
  evaluate: async (request: EvaluateRequest): Promise<EvaluationScores> => {
    const token = localStorage.getItem('token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

    const response = await fetch(`${baseUrl}/dialogue/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error('Failed to evaluate dialogue')
    }

    const result = await response.json()
    return result.data
  },
}

