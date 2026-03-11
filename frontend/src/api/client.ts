import axios from 'axios'

// 从环境变量获取基础路径
const BASE_PATH = import.meta.env.VITE_BASE_PATH || ''

// API 基础 URL：优先使用 VITE_API_URL，否则根据 BASE_PATH 构建
const API_BASE_URL = import.meta.env.VITE_API_URL || `${BASE_PATH}/api`

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 增加到 60 秒，AI 响应可能需要更长时间
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器 - 添加 JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器 - 处理错误和 token 过期
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // Token 过期或无效，清除登录状态
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      // 跳转到登录页（使用基础路径）
      window.location.href = `${BASE_PATH}/login`
    }
    return Promise.reject(error.response?.data || error)
  }
)

// API 响应类型
export interface ApiResponse<T = unknown> {
  success: boolean
  data: T
  message?: string
}

