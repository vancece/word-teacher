import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { authApi, type Student, type User, type LoginRequest, type RegisterRequest } from '../api'

interface AuthContextType {
  user: User | null       // 兼容旧代码
  student: Student | null // 新代码使用这个
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (data: LoginRequest) => Promise<void>
  register: (data: RegisterRequest) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<Student | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // 初始化时从 localStorage 恢复登录状态
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    const storedStudent = localStorage.getItem('student')

    if (storedToken && storedStudent) {
      setToken(storedToken)
      setStudent(JSON.parse(storedStudent))
    }
    setIsLoading(false)
  }, [])

  const login = async (data: LoginRequest) => {
    const response = await authApi.login(data)
    if (response.success && response.data) {
      const { token: newToken, student: newStudent } = response.data
      setToken(newToken)
      setStudent(newStudent)
      localStorage.setItem('token', newToken)
      localStorage.setItem('student', JSON.stringify(newStudent))
    } else {
      throw new Error(response.message || '登录失败')
    }
  }

  const register = async (data: RegisterRequest) => {
    const response = await authApi.register(data)
    if (response.success && response.data) {
      const { token: newToken, student: newStudent } = response.data
      setToken(newToken)
      setStudent(newStudent)
      localStorage.setItem('token', newToken)
      localStorage.setItem('student', JSON.stringify(newStudent))
    } else {
      throw new Error(response.message || '注册失败')
    }
  }

  const logout = () => {
    setToken(null)
    setStudent(null)
    localStorage.removeItem('token')
    localStorage.removeItem('student')
    // 清理旧的 localStorage key
    localStorage.removeItem('user')
  }

  // 兼容旧代码：user 映射到 student
  const user = student as User | null

  return (
    <AuthContext.Provider
      value={{
        user,
        student,
        token,
        isLoading,
        isAuthenticated: !!token && !!student,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

