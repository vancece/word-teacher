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

const router = Router()

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
router.use('/admin', adminRoutes)

export default router

