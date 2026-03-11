import { apiClient, type ApiResponse } from './client'

// 学生信息（新格式）
export interface Student {
  id: number
  studentNo: string
  name: string
  classId: number
  className?: string
}

// 兼容旧代码的 User 类型别名
export type User = Student & { username?: string; role?: string }

export interface LoginRequest {
  studentNo: string
  password: string
}

export interface LoginResponse {
  token: string
  student: Student
}

export interface RegisterRequest {
  studentNo: string
  password: string
  name: string
  classId: number
}

export interface ClassOption {
  id: number
  name: string
  grade: string
}

export interface ProfileStats {
  practiceCount: number
  readAloudCount: number
  totalCount: number
  practiceCompleted: number
  readAloudCompleted: number
  practiceAvgScore: number | null
  practiceMaxScore: number | null
  readAloudAvgScore: number | null
  readAloudMaxScore: number | null
}

export interface ProfileUser extends User {
  class?: { name: string; grade: string }
  createdAt: string
}

export interface ProfileResponse {
  user: ProfileUser
  stats: ProfileStats
}

export interface LearningRecord {
  id: number
  type: 'dialogue' | 'readAloud'
  sceneId: string
  sceneName: string
  sceneIcon: string | null
  sceneGrade: string
  totalScore: number | null
  status: string
  roundsCompleted?: number
  completedCount?: number
  totalCount?: number
  // 跟读评分（1-5星制，4个维度）
  intonationScore?: number   // 语音语调
  fluencyScore?: number      // 流利连贯
  accuracyScore?: number     // 准确完整
  expressionScore?: number   // 情感表现力
  createdAt: string
}

export interface LearningHistoryResponse {
  items: LearningRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const authApi = {
  // 使用新的学生认证接口
  login: (data: LoginRequest) =>
    apiClient.post<LoginRequest, ApiResponse<LoginResponse>>('/student/auth/login', data),

  register: (data: RegisterRequest) =>
    apiClient.post<RegisterRequest, ApiResponse<LoginResponse>>('/student/auth/register', data),

  me: () => apiClient.get<void, ApiResponse<Student>>('/student/auth/me'),

  changePassword: (oldPassword: string, newPassword: string) =>
    apiClient.put<unknown, ApiResponse<void>>('/auth/password', { oldPassword, newPassword }),

  // 获取班级列表（公开接口）
  getClasses: () =>
    apiClient.get<void, ApiResponse<ClassOption[]>>('/student/auth/classes'),

  // 获取个人资料和统计数据
  getProfile: () =>
    apiClient.get<void, ApiResponse<ProfileResponse>>('/auth/profile'),

  // 获取学习历史
  getLearningHistory: (params?: { type?: 'dialogue' | 'readAloud'; page?: number; pageSize?: number }) =>
    apiClient.get<void, ApiResponse<LearningHistoryResponse>>(
      `/auth/learning-history${params ? `?${new URLSearchParams(params as any).toString()}` : ''}`
    ),

  // 获取 AI 学习总结
  getMySummary: () =>
    apiClient.get<void, ApiResponse<{
      strengths: string[]
      weaknesses: string[]
      overallComment: string
      suggestions: string[]
    }>>('/auth/my-summary'),
}

