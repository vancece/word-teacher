import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { authApi, type Teacher } from '../api'

interface AuthContextType {
  user: Teacher | null      // 兼容旧代码
  teacher: Teacher | null   // 新代码使用这个
  isLoading: boolean
  isAdmin: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      authApi.getMe()
        .then((response) => {
          setTeacher(response)
        })
        .catch(() => {
          localStorage.removeItem('admin_token')
        })
        .finally(() => {
          setIsLoading(false)
        })
    } else {
      setIsLoading(false)
    }
  }, [])

  const login = async (username: string, password: string) => {
    const response = await authApi.login(username, password)
    localStorage.setItem('admin_token', response.token)
    setTeacher(response.teacher)
  }

  const logout = () => {
    localStorage.removeItem('admin_token')
    setTeacher(null)
  }

  const isAdmin = teacher?.isAdmin ?? false
  // 兼容旧代码
  const user = teacher

  return (
    <AuthContext.Provider value={{ user, teacher, isLoading, isAdmin, login, logout }}>
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

