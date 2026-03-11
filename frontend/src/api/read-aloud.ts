import { apiClient } from './client'

// 跟读句子类型
export interface ReadAloudSentence {
  id: number
  english: string
  chinese: string
  audio?: string  // 标准发音 MP3 (base64)
}

// 跟读场景类型
export interface ReadAloudScene {
  id: string
  name: string
  description?: string
  coverImage?: string
  grade: string
  sentences: ReadAloudSentence[]
  sentenceCount?: number
}

// 单词评估结果
export interface WordResult {
  text: string
  status: 'correct' | 'incorrect' | 'missing'
  spoken?: string
}

// 句子评估结果
export interface SentenceEvaluation {
  words: WordResult[]
  accuracy: number
  feedback: string
  spokenText: string
}

// 整体评分结果（1-5星，4个维度）
export interface ReadAloudScoreResult {
  totalScore: number           // 总分 1-5
  intonationScore: number      // 语音语调
  fluencyScore: number         // 流利连贯
  accuracyScore: number        // 准确完整
  expressionScore: number      // 情感表现力
  feedback: string
  strengths: string[]
  improvements: string[]
}

// 开始跟读响应
export interface StartReadAloudResponse {
  recordId: number
  scene: {
    id: string
    name: string
    description?: string
    sentences: ReadAloudSentence[]
  }
}

// 跟读 API
export const readAloudApi = {
  // 获取跟读场景列表
  getScenes: async (): Promise<ReadAloudScene[]> => {
    // apiClient 拦截器返回 response.data，后端返回 { success, data }
    const res = await apiClient.get<{ success: boolean; data: ReadAloudScene[] }>('/read-aloud/scenes')
    const response = res as unknown as { success: boolean; data: ReadAloudScene[] }
    return response.data || []
  },

  // 获取单个场景详情
  getScene: async (id: string): Promise<ReadAloudScene> => {
    const res = await apiClient.get<{ success: boolean; data: ReadAloudScene }>(`/read-aloud/scenes/${id}`)
    const response = res as unknown as { success: boolean; data: ReadAloudScene }
    return response.data
  },

  // 开始跟读练习
  start: async (sceneId: string): Promise<StartReadAloudResponse> => {
    const data = await apiClient.post<StartReadAloudResponse>('/read-aloud/start', { sceneId })
    return data as unknown as StartReadAloudResponse
  },

  // 评估单句跟读
  evaluate: async (params: {
    recordId?: number
    sentenceIndex?: number
    originalSentence: string
    audioBase64: string
  }): Promise<{ success: boolean; data: SentenceEvaluation }> => {
    const data = await apiClient.post<{ success: boolean; data: SentenceEvaluation }>(
      '/read-aloud/evaluate',
      params
    )
    return data as unknown as { success: boolean; data: SentenceEvaluation }
  },

  // 整体评分（完成所有句子后调用）
  score: async (params: {
    recordId?: number
    sceneId?: string
    sceneName: string
    sentences: Array<{
      english: string
      chinese: string
      spokenText?: string
      accuracy: number
    }>
  }): Promise<{ success: boolean; data: ReadAloudScoreResult }> => {
    const data = await apiClient.post<{ success: boolean; data: ReadAloudScoreResult }>(
      '/read-aloud/score',
      params
    )
    return data as unknown as { success: boolean; data: ReadAloudScoreResult }
  },
}

