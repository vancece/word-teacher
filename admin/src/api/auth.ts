import { apiClient } from './client'
import type { Teacher } from './admin'

// 从 admin.ts 导出 Teacher 类型供 AuthContext 使用
export type { Teacher } from './admin'

export interface LoginResponse {
  token: string
  teacher: Teacher
}

export const authApi = {
  // 使用新的教师认证接口
  login: async (username: string, password: string): Promise<LoginResponse> => {
    return apiClient.post('/teacher/auth/login', { username, password }) as unknown as LoginResponse
  },

  getMe: async (): Promise<Teacher> => {
    return apiClient.get('/teacher/auth/me') as unknown as Teacher
  },
}

