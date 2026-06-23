import { Router } from 'express'
import { prisma } from '../config/database.js'
import { env } from '../config/env.js'
// 新的学生/教师分离路由
import studentAuthRoutes from './student/auth.routes.js'
import teacherAuthRoutes from './teacher/auth.routes.js'
// 兼容路由 - 学生端 profile/learning-history 等
import authRoutes from './auth.routes.js'
// 功能路由
import sceneRoutes from './scene.routes.js'
import dialogueRoutes from './dialogue.routes.js'
import readAloudRoutes from './read-aloud.routes.js'
import uploadRoutes from './upload.routes.js'
import adminRoutes from './admin/index.js'
import wordPacksRoutes from './word-packs.routes.js'
import wordGameRoutes from './word-game.routes.js'
import dingtalkBotRoutes from './dingtalk-bot.routes.js'
import internalRoutes from './internal.routes.js'
import clientLogsRoutes from './client-logs.routes.js'
import { authenticateStudent } from '../middleware/auth.js'
import { recordHeartbeat, getActiveStudentCount } from '../services/presence.service.js'
import { getHealthStatus } from '../services/health-monitor.service.js'
import type { StudentRequest } from '../types/index.js'
import path from 'path'
import fs from 'fs'

const router = Router()

// 导出文件下载（公开路由，文件名含随机 hash + 30 分钟过期，无需认证）
const EXPORT_DIR = path.resolve(process.cwd(), 'tmp/exports')
router.get('/admin/export/download/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename as string)
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ success: false, message: '无效文件名' })
  }
  const filepath = path.join(EXPORT_DIR, filename)
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ success: false, message: '文件不存在或已过期' })
  }
  const stat = fs.statSync(filepath)
  if (Date.now() - stat.mtimeMs > 30 * 60 * 1000) {
    fs.unlinkSync(filepath)
    return res.status(410).json({ success: false, message: '文件已过期，请重新导出' })
  }
  res.download(filepath, filename)
})

// 健康检查 - 简单版本（负载均衡器使用）
router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// 健康检查 - 详细版本（监控系统使用）
router.get('/health/detail', async (_req, res) => {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {}

  // 检查数据库连接
  const dbStart = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = { status: 'ok', latency: Date.now() - dbStart }
  } catch (err) {
    checks.database = { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' }
  }

  // 检查 Agent 服务（仅检查可达性）
  const agentStart = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const agentRes = await fetch(`${env.agent.url}/health`, {
      signal: controller.signal,
      headers: env.agent.apiKey ? { 'X-Agent-Api-Key': env.agent.apiKey } : {},
    })
    clearTimeout(timeout)
    checks.agent = {
      status: agentRes.ok ? 'ok' : 'degraded',
      latency: Date.now() - agentStart
    }
  } catch {
    checks.agent = { status: 'unreachable', latency: Date.now() - agentStart }
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok')

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: process.env.npm_package_version || '1.0.0',
    checks,
  })
})

// 学生心跳上报（轻量接口，用于统计在线人数）
router.post('/heartbeat', authenticateStudent, (req: StudentRequest, res) => {
  recordHeartbeat(req.student!.studentId)
  res.json({ status: 'ok' })
})

// 系统状态 API（供 Admin 仪表盘使用，无需额外认证，数据不敏感）
router.get('/system/status', (_req, res) => {
  const health = getHealthStatus()
  const activeStudents = getActiveStudentCount()
  res.json({
    success: true,
    data: { health, activeStudents },
  })
})

// 学生/教师分离认证路由
router.use('/student/auth', studentAuthRoutes)
router.use('/teacher/auth', teacherAuthRoutes)
// 兼容旧 API - 学生端 profile/learning-history/my-summary
router.use('/auth', authRoutes)

// 功能路由
router.use('/scenes', sceneRoutes)
router.use('/dialogue', dialogueRoutes)
router.use('/read-aloud', readAloudRoutes)
router.use('/upload', uploadRoutes)
router.use('/word-packs', wordPacksRoutes)
router.use('/word-game', wordGameRoutes)
router.use('/admin', adminRoutes)
router.use('/internal', internalRoutes)  // Agent 回调专用，API Key 认证
router.use('/client-logs', clientLogsRoutes)  // 前端日志收集（无需认证，日志中记录 studentId）
router.use('/dingtalk-bot', dingtalkBotRoutes)

export default router

