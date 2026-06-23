/**
 * 前端日志收集接口
 * POST /api/client-logs - 接收前端批量上报的日志
 */
import { Router } from 'express'
import { createLogger } from '../utils/logger.js'

const router = Router()
const frontendLogger = createLogger('frontend')

interface ClientLogEntry {
  level: 'info' | 'warn' | 'error'
  event: string
  data?: Record<string, unknown>
  ts: number
  page: string
  sessionId: string
}

// 限制单次上报的条数，防止滥用
const MAX_BATCH_SIZE = 50

router.post('/', (req, res) => {
  const { logs } = req.body as { logs?: ClientLogEntry[] }

  if (!Array.isArray(logs) || logs.length === 0) {
    return res.status(400).json({ success: false, message: 'logs must be a non-empty array' })
  }

  if (logs.length > MAX_BATCH_SIZE) {
    return res.status(400).json({ success: false, message: `too many logs, max ${MAX_BATCH_SIZE}` })
  }

  // 从 JWT 中提取 studentId（如果有认证）
  const studentId = (req as any).student?.studentId || 'anonymous'

  for (const entry of logs) {
    const { level, event, data, ts, page, sessionId } = entry

    // 校验必要字段
    if (!event || !level) continue

    const logData = {
      event,
      studentId,
      sessionId: sessionId || 'unknown',
      page: page || '/',
      clientTs: ts,
      ...data,
    }

    switch (level) {
      case 'error':
        frontendLogger.error(logData, `[client] ${event}`)
        break
      case 'warn':
        frontendLogger.warn(logData, `[client] ${event}`)
        break
      default:
        frontendLogger.info(logData, `[client] ${event}`)
    }
  }

  res.json({ success: true })
})

export default router
