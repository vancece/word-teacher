/**
 * 系统健康监控服务
 * - 每 5 分钟探测一次系统各组件健康状态
 * - 状态变为 unhealthy 时发送钉钉告警
 * - 恢复时发送恢复通知
 */
import { prisma } from '../config/database.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import crypto from 'crypto'

const ACCESS_TOKEN = process.env.DINGTALK_ACCESS_TOKEN || ''
const SECRET = process.env.DINGTALK_SECRET || ''
const CHECK_INTERVAL = 5 * 60 * 1000 // 5 分钟

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  checks: {
    database: { status: string; latency?: number; error?: string }
    agent: { status: string; latency?: number; error?: string }
  }
}

let lastStatus: HealthStatus['status'] = 'healthy'
let checkTimer: NodeJS.Timeout | null = null

async function checkHealth(): Promise<HealthStatus> {
  const checks: HealthStatus['checks'] = {
    database: { status: 'unknown' },
    agent: { status: 'unknown' },
  }

  // 检查数据库
  const dbStart = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = { status: 'ok', latency: Date.now() - dbStart }
  } catch (err) {
    checks.database = { status: 'error', error: err instanceof Error ? err.message : 'Unknown' }
  }

  // 检查 Agent 服务
  const agentStart = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${env.agent.url}/health`, {
      signal: controller.signal,
      headers: env.agent.apiKey ? { 'X-Agent-Api-Key': env.agent.apiKey } : {},
    })
    clearTimeout(timeout)
    checks.agent = { status: res.ok ? 'ok' : 'degraded', latency: Date.now() - agentStart }
  } catch {
    checks.agent = { status: 'unreachable', latency: Date.now() - agentStart }
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok')
  const anyError = Object.values(checks).some(c => c.status === 'error' || c.status === 'unreachable')

  const status: HealthStatus['status'] = allOk ? 'healthy' : anyError ? 'unhealthy' : 'degraded'

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    checks,
  }
}

async function sendDingtalkAlert(title: string, text: string) {
  if (!ACCESS_TOKEN || !SECRET) return

  try {
    const timestamp = Date.now().toString()
    const stringToSign = `${timestamp}\n${SECRET}`
    const hmac = crypto.createHmac('sha256', SECRET)
    hmac.update(stringToSign)
    const sign = encodeURIComponent(hmac.digest('base64'))
    const url = `https://oapi.dingtalk.com/robot/send?access_token=${ACCESS_TOKEN}&timestamp=${timestamp}&sign=${sign}`

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { title, text },
      }),
    })
  } catch (err) {
    logger.error({ err }, '[HealthMonitor] Failed to send DingTalk alert')
  }
}

async function runHealthCheck() {
  try {
    const result = await checkHealth()

    // 状态变化时发送通知
    if (result.status !== lastStatus) {
      if (result.status === 'unhealthy' || result.status === 'degraded') {
        const failedChecks = Object.entries(result.checks)
          .filter(([, v]) => v.status !== 'ok')
          .map(([k, v]) => `- **${k}**: ${v.status}${v.error ? ` (${v.error})` : ''}`)
          .join('\n')

        await sendDingtalkAlert(
          '⚠️ 系统告警',
          `### ⚠️ Echo Kid 系统异常\n\n**状态**: ${result.status}\n**时间**: ${new Date().toLocaleString('zh-CN')}\n\n**异常组件**:\n${failedChecks}`,
        )
        logger.warn({ checks: result.checks }, '[HealthMonitor] System status changed to: ' + result.status)
      } else if (lastStatus !== 'healthy' && result.status === 'healthy') {
        await sendDingtalkAlert(
          '✅ 系统恢复',
          `### ✅ Echo Kid 系统已恢复\n\n**状态**: healthy\n**时间**: ${new Date().toLocaleString('zh-CN')}\n**运行时长**: ${Math.floor(result.uptime / 60)} 分钟`,
        )
        logger.info('[HealthMonitor] System recovered to healthy')
      }

      lastStatus = result.status
    }

    // 缓存最新状态
    currentHealthStatus = result
  } catch (err) {
    logger.error({ err }, '[HealthMonitor] Health check failed')
  }
}

// 缓存最新健康状态，供 API 查询
let currentHealthStatus: HealthStatus = {
  status: 'healthy',
  timestamp: new Date().toISOString(),
  uptime: 0,
  checks: { database: { status: 'unknown' }, agent: { status: 'unknown' } },
}

export function getHealthStatus(): HealthStatus {
  return currentHealthStatus
}

export function startHealthMonitor() {
  // 启动后立即执行一次
  runHealthCheck()
  // 每 5 分钟执行
  checkTimer = setInterval(runHealthCheck, CHECK_INTERVAL)
  logger.info(`[HealthMonitor] Started, checking every ${CHECK_INTERVAL / 1000}s`)
}

export function stopHealthMonitor() {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}
