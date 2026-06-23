/**
 * 前端日志模块 - 攒批上报到后端
 *
 * 使用方式:
 *   import { clientLogger } from '@/utils/client-logger'
 *   clientLogger.info('batch_eval_start', { sentenceCount: 5 })
 *   clientLogger.warn('mic_permission_denied')
 *   clientLogger.error('batch_eval_failed', { error: err.message })
 */

type LogLevel = 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  event: string
  data?: Record<string, unknown>
  ts: number
  page: string
  sessionId: string
}

const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const BATCH_SIZE = 10
const FLUSH_INTERVAL = 5000 // 5 秒

class ClientLogger {
  private buffer: LogEntry[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private flushing = false

  constructor() {
    this.startTimer()
    // 页面卸载前尝试发送剩余日志
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush())
      window.addEventListener('unhandledrejection', (e) => {
        this.error('unhandled_rejection', {
          reason: e.reason?.message || String(e.reason),
          stack: e.reason?.stack?.slice(0, 500),
        })
      })
    }
  }

  info(event: string, data?: Record<string, unknown>) {
    this.push('info', event, data)
  }

  warn(event: string, data?: Record<string, unknown>) {
    this.push('warn', event, data)
  }

  error(event: string, data?: Record<string, unknown>) {
    this.push('error', event, data)
    // error 级别立即发送
    this.flush()
  }

  private push(level: LogLevel, event: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      event,
      data,
      ts: Date.now(),
      page: window.location.pathname,
      sessionId: SESSION_ID,
    }
    this.buffer.push(entry)

    // 缓冲区满则立即发送
    if (this.buffer.length >= BATCH_SIZE) {
      this.flush()
    }
  }

  private startTimer() {
    if (this.timer) return
    this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL)
  }

  async flush() {
    if (this.buffer.length === 0 || this.flushing) return

    const batch = this.buffer.splice(0)
    this.flushing = true

    try {
      const BASE_PATH = import.meta.env.VITE_BASE_PATH || ''
      const API_BASE_URL = import.meta.env.VITE_API_URL || `${BASE_PATH}/api`

      // 用 sendBeacon 优先（页面卸载时更可靠），否则 fetch
      const url = `${API_BASE_URL}/client-logs`
      const body = JSON.stringify({ logs: batch })

      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' })
        const sent = navigator.sendBeacon(url, blob)
        if (!sent) {
          // sendBeacon 失败时 fallback 到 fetch
          await this.sendViaFetch(url, body)
        }
      } else {
        await this.sendViaFetch(url, body)
      }
    } catch {
      // 日志上报失败不应影响业务，静默吞掉
    } finally {
      this.flushing = false
    }
  }

  private async sendViaFetch(url: string, body: string) {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
      },
      body,
      keepalive: true, // 页面卸载时也能发出
    })
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.flush()
  }
}

export const clientLogger = new ClientLogger()
