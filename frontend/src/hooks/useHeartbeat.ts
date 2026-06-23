/**
 * 学生心跳 Hook
 * 登录后每 30 秒向后端上报一次心跳，用于统计在线活跃人数
 * 页面不可见时暂停，恢复时立即上报
 * 401 时自动停止（token 已失效，无需继续）
 */
import { useEffect, useRef } from 'react'
import { apiClient } from '../api/client'

const HEARTBEAT_INTERVAL = 30 * 1000 // 30 秒

export function useHeartbeat(isAuthenticated: boolean) {
  const timerRef = useRef<number | null>(null)
  const stoppedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) {
      stoppedRef.current = false
      return
    }

    const stopHeartbeat = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    const sendHeartbeat = () => {
      if (stoppedRef.current) return
      apiClient.post('/heartbeat', null, {
        headers: { 'X-Silent': '1' },
      }).catch((err: any) => {
        // 401 说明 token 失效，停止心跳避免无意义请求
        if (err?.status === 401 || err?.response?.status === 401) {
          stoppedRef.current = true
          stopHeartbeat()
        }
      })
    }

    const startHeartbeat = () => {
      if (stoppedRef.current) return
      sendHeartbeat()
      timerRef.current = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL)
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopHeartbeat()
      } else {
        startHeartbeat()
      }
    }

    startHeartbeat()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      stopHeartbeat()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isAuthenticated])
}
