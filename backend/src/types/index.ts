import type { Request } from 'express'

// ==================== JWT Payload ====================

// 学生 JWT Payload
export interface StudentJwtPayload {
  type: 'student'
  studentId: number
  studentNo: string
  name: string
  classId: number
}

// 教师 JWT Payload
export interface TeacherJwtPayload {
  type: 'teacher'
  teacherId: number
  username: string
  name: string
  isAdmin: boolean
}

// 联合类型
export type JwtPayload = StudentJwtPayload | TeacherJwtPayload

// ==================== 扩展 Express Request ====================

// 学生请求
export interface StudentRequest extends Request {
  student?: StudentJwtPayload
}

// 教师请求
export interface TeacherRequest extends Request {
  teacher?: TeacherJwtPayload
}

// 兼容旧代码（逐步废弃）
export interface AuthRequest extends Request {
  user?: JwtPayload
  student?: StudentJwtPayload
  teacher?: TeacherJwtPayload
}

// API 响应类型
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

// 分页
export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// 对话消息
export interface DialogueMessage {
  id: string
  role: 'ai' | 'student'
  text: string
  audioUrl?: string
  timestamp: number
}

// 对话会话
export interface DialogueSession {
  practiceId: number
  sceneId: string
  currentRound: number
  totalRounds: number
  messages: DialogueMessage[]
  status: 'active' | 'completed' | 'abandoned'
}

