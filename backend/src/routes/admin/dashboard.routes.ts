/**
 * 仪表盘增强 API
 * - AI 服务连通性测试
 * - 近 7 天学习趋势
 * - 存储/资源用量
 * - 最近异常日志
 */
import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { success } from '../../utils/response.js'
import { env } from '../../config/env.js'
import { prisma } from '../../config/database.js'
import { isMinioAvailable } from '../../services/minio.service.js'
import type { TeacherRequest } from '../../types/index.js'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'

const router = Router()

interface ServiceTestResult {
  name: string
  status: 'ok' | 'error'
  latency: number
  message?: string
}

/**
 * POST /api/admin/dashboard/ai-connectivity
 * 测试所有 AI 服务的连通性
 */
router.post('/ai-connectivity', asyncHandler(async (_req: TeacherRequest, res) => {
  const results: ServiceTestResult[] = []

  // 1. DashScope LLM API — 调用 /v1/models 验证 key + 网络
  const dashscopeTest = await testService('DashScope LLM', async () => {
    const baseUrl = process.env.DASHSCOPE_BASE_URL || process.env.OPENAI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    const apiKey = process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || ''
    if (!apiKey) throw new Error('API Key 未配置')

    const resp = await fetchWithTimeout(`${baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    }, 10000)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
  })
  results.push(dashscopeTest)

  // 2. Agent 服务 — /api/agent/health 端点
  const agentTest = await testService('Agent 服务', async () => {
    const resp = await fetchWithTimeout(`${env.agent.url}/health`, {
      headers: env.agent.apiKey ? { 'X-Agent-Api-Key': env.agent.apiKey } : {},
    }, 5000)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  })
  results.push(agentTest)

  // 3. 阿里云 NLS STT — 验证 AK/SK 已配置 + Agent 可用
  const nlsTest = await testService('阿里云语音识别', async () => {
    const akId = process.env.ALIYUN_AK_ID || ''
    const akSecret = process.env.ALIYUN_AK_SECRET || ''
    if (!akId || !akSecret) throw new Error('AK/SK 未配置')
    // NLS token 获取逻辑在 Agent 里，只要凭证配了 + Agent 活着即可
    const resp = await fetchWithTimeout(`${env.agent.url}/health`, {
      headers: env.agent.apiKey ? { 'X-Agent-Api-Key': env.agent.apiKey } : {},
    }, 5000)
    if (!resp.ok && !akId) throw new Error(`Agent 不可达且 AK 未配置`)
  })
  results.push(nlsTest)

  // 4. 科大讯飞 ISE 评测
  const xfTest = await testService('讯飞语音评测', async () => {
    const appId = process.env.XFYUN_APP_ID || ''
    const apiKey = process.env.XFYUN_API_KEY || ''
    const apiSecret = process.env.XFYUN_API_SECRET || ''
    if (!appId || !apiKey || !apiSecret) throw new Error('讯飞凭证未配置')
    // 讯飞用 WebSocket，这里只验证凭证是否都已配置
    // 实际的 WebSocket 握手测试可能耗时较长，先只验证配置完整性
  })
  results.push(xfTest)

  // 5. MinIO 存储
  const minioTest = await testService('MinIO 存储', async () => {
    const available = await isMinioAvailable()
    if (!available) throw new Error('MinIO 不可用')
  })
  results.push(minioTest)

  const allOk = results.every(r => r.status === 'ok')
  const summary = allOk ? 'healthy' : results.some(r => r.status === 'ok') ? 'degraded' : 'unhealthy'

  return success(res, { summary, services: results, timestamp: new Date().toISOString() })
}))

/**
 * GET /api/admin/dashboard/trends
 * 近 7 天学习趋势
 */
router.get('/trends', asyncHandler(async (_req: TeacherRequest, res) => {
  const days = 7
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days + 1)
  startDate.setHours(0, 0, 0, 0)

  // 查询每天的练习数量
  const dailyData: Array<{ date: string; readAloud: number; dialogue: number; wordGame: number }> = []

  for (let i = 0; i < days; i++) {
    const dayStart = new Date(startDate)
    dayStart.setDate(dayStart.getDate() + i)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const [readAloud, dialogue, wordGame] = await Promise.all([
      prisma.readAloudRecord.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
      }),
      prisma.practiceRecord.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
      }),
      prisma.wordGameRecord.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
      }),
    ])

    dailyData.push({
      date: dayStart.toISOString().split('T')[0],
      readAloud,
      dialogue,
      wordGame,
    })
  }

  return success(res, { days: dailyData })
}))

/**
 * GET /api/admin/dashboard/storage
 * 存储/资源用量
 */
router.get('/storage', asyncHandler(async (_req: TeacherRequest, res) => {
  const storageInfo: any = {
    minio: { available: false, usage: null },
    database: { tables: 0, totalRecords: 0 },
    lancedb: { available: false, entries: 0 },
  }

  // MinIO 状态
  try {
    storageInfo.minio.available = await isMinioAvailable()
  } catch { /* ignore */ }

  // 数据库表记录数
  try {
    const [students, readAloud, dialogue, wordGame, scenes, readAloudScenes] = await Promise.all([
      prisma.student.count(),
      prisma.readAloudRecord.count(),
      prisma.practiceRecord.count(),
      prisma.wordGameRecord.count(),
      prisma.dialogueScene.count(),
      prisma.readAloudScene.count(),
    ])
    storageInfo.database = {
      students,
      readAloudRecords: readAloud,
      dialogueRecords: dialogue,
      wordGameRecords: wordGame,
      scenes: scenes + readAloudScenes,
      totalRecords: students + readAloud + dialogue + wordGame,
    }
  } catch { /* ignore */ }

  // LanceDB 向量数据
  try {
    const candidates = [
      process.env.LANCEDB_PATH,
      path.resolve(process.cwd(), 'data/lancedb'),
      path.resolve(process.cwd(), 'backend/data/lancedb'),
    ].filter(Boolean) as string[]
    const lancedbPath = candidates.find(p => fs.existsSync(p))
    if (lancedbPath) {
      storageInfo.lancedb.available = true
      const files = fs.readdirSync(lancedbPath, { recursive: true }) as string[]
      storageInfo.lancedb.files = files.length
    }
  } catch { /* ignore */ }

  return success(res, storageInfo)
}))

/**
 * GET /api/admin/dashboard/recent-errors
 * 最近异常日志摘要
 */
router.get('/recent-errors', asyncHandler(async (_req: TeacherRequest, res) => {
  const errors: Array<{ time: string; level: string; module: string; message: string }> = []

  // 读取今天和昨天的日志文件，提取 error 级别日志
  const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs')

  try {
    if (fs.existsSync(logDir)) {
      const files = fs.readdirSync(logDir)
        .filter(f => f.endsWith('.log'))
        .sort()
        .reverse()
        .slice(0, 2) // 只看最近 2 个文件

      for (const file of files) {
        const content = fs.readFileSync(path.join(logDir, file), 'utf-8')
        const lines = content.split('\n').filter(Boolean)

        for (const line of lines.slice(-500)) { // 只看最后 500 行
          try {
            const parsed = JSON.parse(line)
            if (parsed.level >= 50 || parsed.level === 'error' || parsed.level === 'fatal') {
              errors.push({
                time: parsed.time || parsed.timestamp || '',
                level: parsed.level >= 60 ? 'fatal' : 'error',
                module: parsed.module || parsed.name || 'unknown',
                message: parsed.msg || parsed.message || JSON.stringify(parsed.err || '').slice(0, 200),
              })
            }
          } catch {
            // 非 JSON 行，跳过
          }
        }
      }
    }
  } catch { /* ignore */ }

  // 最近 20 条错误，按时间倒序
  const recent = errors
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 20)

  return success(res, { errors: recent, total: errors.length })
}))

/**
 * GET /api/admin/dashboard/server-metrics
 * 服务器 CPU / 内存 / 网络实时指标
 */
let prevNetRx = 0
let prevNetTx = 0
let prevNetTime = Date.now()

router.get('/server-metrics', asyncHandler(async (_req: TeacherRequest, res) => {
  // CPU 使用率（采样 100ms）
  const cpus = os.cpus()
  const startMeasure = cpus.map(c => ({ idle: c.times.idle, total: Object.values(c.times).reduce((a, b) => a + b, 0) }))
  await new Promise(r => setTimeout(r, 100))
  const cpus2 = os.cpus()
  const endMeasure = cpus2.map(c => ({ idle: c.times.idle, total: Object.values(c.times).reduce((a, b) => a + b, 0) }))
  let idleDiff = 0, totalDiff = 0
  for (let i = 0; i < startMeasure.length; i++) {
    idleDiff += endMeasure[i].idle - startMeasure[i].idle
    totalDiff += endMeasure[i].total - startMeasure[i].total
  }
  const cpuUsage = totalDiff > 0 ? ((1 - idleDiff / totalDiff) * 100) : 0

  // 内存
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
    return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  }

  // 网络（Linux /proc/net/dev）
  let rxRate = '0 B/s', txRate = '0 B/s'
  try {
    const netData = fs.readFileSync('/proc/net/dev', 'utf-8')
    const lines = netData.split('\n').slice(2)
    let totalRx = 0, totalTx = 0
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 10) continue
      const iface = parts[0].replace(':', '')
      if (iface === 'lo') continue
      totalRx += parseInt(parts[1]) || 0
      totalTx += parseInt(parts[9]) || 0
    }
    const now = Date.now()
    const elapsed = (now - prevNetTime) / 1000
    if (prevNetRx > 0 && elapsed > 0) {
      const rxBps = (totalRx - prevNetRx) / elapsed
      const txBps = (totalTx - prevNetTx) / elapsed
      const formatRate = (bps: number) => {
        if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
        if (bps >= 1024) return `${(bps / 1024).toFixed(1)} KB/s`
        return `${Math.round(bps)} B/s`
      }
      rxRate = formatRate(rxBps)
      txRate = formatRate(txBps)
    }
    prevNetRx = totalRx
    prevNetTx = totalTx
    prevNetTime = now
  } catch {
    // macOS 或无 /proc 的系统，网络信息不可用
    rxRate = 'N/A'
    txRate = 'N/A'
  }

  return success(res, {
    cpu: { usage: Math.round(cpuUsage * 10) / 10, cores: cpus.length },
    memory: {
      total: formatBytes(totalMem),
      used: formatBytes(usedMem),
      usedPercent: Math.round((usedMem / totalMem) * 1000) / 10,
    },
    network: { rxRate, txRate },
  })
}))

/**
 * GET /api/admin/dashboard/changelog
 * 从 git 提交历史获取版本更新日志
 */
router.get('/changelog', asyncHandler(async (req: TeacherRequest, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 30, 100)
  const page = parseInt(req.query.page as string) || 1

  try {
    // 找到 git 仓库根目录
    const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8', timeout: 5000 }).trim()
    // 获取 git log
    const offset = (page - 1) * limit
    const format = '%H||%h||%s||%an||%ai||%D'
    const raw = execSync(
      `git log --format="${format}" --skip=${offset} -n ${limit}`,
      { encoding: 'utf-8', cwd: gitRoot, timeout: 10000 }
    ).trim()

    if (!raw) {
      return success(res, { commits: [], total: 0, page, limit })
    }

    const commits = raw.split('\n').map(line => {
      const [hash, shortHash, message, author, date, refs] = line.split('||')
      return { hash, shortHash, message, author, date, refs: refs || '' }
    })

    // 获取总提交数
    const totalStr = execSync('git rev-list --count HEAD', { encoding: 'utf-8', cwd: gitRoot, timeout: 5000 }).trim()
    const total = parseInt(totalStr) || 0

    return success(res, { commits, total, page, limit })
  } catch (err) {
    return success(res, { commits: [], total: 0, page, limit, error: 'Git 不可用' })
  }
}))

// 辅助函数
async function testService(name: string, testFn: () => Promise<void>): Promise<ServiceTestResult> {
  const start = Date.now()
  try {
    await testFn()
    return { name, status: 'ok', latency: Date.now() - start }
  } catch (err) {
    return {
      name,
      status: 'error',
      latency: Date.now() - start,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 5000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export default router
