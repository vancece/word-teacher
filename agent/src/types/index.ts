export type MessageRole = 'system' | 'ai' | 'student'

export interface Message {
  role: MessageRole
  content: string
}

export interface ChatRequest {
  sceneId: string
  sceneName: string
  sceneDescription?: string
  vocabulary?: string[]
  currentRound: number
  totalRounds: number
  history: Message[]
  studentMessage?: string
}

export interface ChatResponse {
  message: string
  isComplete: boolean
}

export interface EvaluationRequest {
  sceneId: string
  sceneName: string
  dialogueHistory: Message[]
  vocabulary?: string[]
}

export interface EvaluationResponse {
  totalScore: number          // 0-100
  vocabularyScore: number     // 0-25
  grammarScore: number        // 0-25
  communicationScore: number  // 0-25
  effortScore: number         // 0-25
  feedback: string
  strengths: string[]
  improvements: string[]
}

