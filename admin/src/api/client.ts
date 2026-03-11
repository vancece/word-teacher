import axios from 'axios'

// 生产环境使用 /teacher-admin/api，开发环境使用 /api (由 vite proxy 代理)
const isProd = import.meta.env.PROD
const apiClient = axios.create({
  baseURL: isProd ? '/teacher-admin/api' : '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器：添加 token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：处理错误
apiClient.interceptors.response.use(
  (response) => {
    // 204 No Content - 删除成功等情况
    if (response.status === 204 || !response.data) {
      return undefined
    }
    // 后端返回格式: { success: true, data: {...}, message: "..." }
    const result = response.data
    if (result.success) {
      return result.data
    }
    return Promise.reject(new Error(result.message || '请求失败'))
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token')
      // 使用 HashRouter 的正确路径：/teacher-admin/#/login
      const basePath = import.meta.env.PROD ? '/teacher-admin/' : '/'
      window.location.href = `${basePath}#/login`
    }
    const message = error.response?.data?.message || error.message || '请求失败'
    return Promise.reject(new Error(message))
  }
)

export { apiClient }

