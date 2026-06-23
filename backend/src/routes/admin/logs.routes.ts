/**
 * 日志查询路由
 * 支持：查看日志文件列表、按日期/级别/模块/关键词搜索日志、实时尾部日志
 */
import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { success } from '../../utils/response.js'
import type { TeacherRequest } from '../../types/index.js'
import { readdir, stat, readFile } from 'fs/promises'
import { readdirSync, statSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOG_DIR = join(__dirname, '../../../logs')

const router = Router()

// 仅管理员可访问日志
router.use((req: TeacherRequest, res, next) => {
  if (!req.teacher?.isAdmin) {
    return res.status(403).json({ success: false, message: '仅管理员可查看日志' })
  }
  next()
})

/**
 * GET /api/admin/logs/files
 * 获取所有日志文件列表（按日期倒序）
 */
router.get('/files', asyncHandler(async (_req: TeacherRequest, res) => {
  if (!existsSync(LOG_DIR)) {
    return success(res, [])
  }

  const files = await readdir(LOG_DIR)
  const logFiles = files.filter(f => f.endsWith('.log'))

  const fileInfos = await Promise.all(
    logFiles.map(async (filename) => {
      const filepath = join(LOG_DIR, filename)
      const stats = await stat(filepath)
      return {
        filename,
        size: stats.size,
        sizeHuman: formatFileSize(stats.size),
        lastModified: stats.mtime.toISOString(),
        date: extractDateFromFilename(filename),
      }
    })
  )

  // 按日期倒序
  fileInfos.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  return success(res, fileInfos)
}))

/**
 * GET /api/admin/logs/query
 * 查询日志内容
 * Query params:
 *   - date: 日期（如 2026-06-23），默认今天
 *   - level: 日志级别筛选（info/warn/error/debug）
 *   - module: 模块筛选（database/auth/api/agent 等）
 *   - keyword: 关键词搜索
 *   - page: 页码，默认 1
 *   - limit: 每页条数，默认 100
 *   - order: 排序 asc/desc，默认 desc（最新在前）
 */
router.get('/query', asyncHandler(async (req: TeacherRequest, res) => {
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0]
  const level = req.query.level as string | undefined
  const module = req.query.module as string | undefined
  const keyword = req.query.keyword as string | undefined
  const page = parseInt(req.query.page as string) || 1
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500)
  const order = (req.query.order as string) === 'asc' ? 'asc' : 'desc'

  // 查找对应日期的日志文件
  const logFile = findLogFileByDate(date)
  if (!logFile) {
    return success(res, { logs: [], total: 0, page, limit, date, availableFile: null })
  }

  const content = await readFile(logFile, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim())

  // 解析每行 JSON 日志
  let entries = lines.map(parseLine).filter(Boolean) as LogEntry[]

  // 按级别筛选
  if (level) {
    const levelNum = LEVEL_MAP[level.toLowerCase()]
    if (levelNum !== undefined) {
      entries = entries.filter(e => e.level === levelNum)
    }
  }

  // 按模块筛选
  if (module) {
    entries = entries.filter(e =>
      e.module?.toLowerCase().includes(module.toLowerCase())
    )
  }

  // 按关键词搜索
  if (keyword) {
    const kw = keyword.toLowerCase()
    entries = entries.filter(e =>
      e.msg?.toLowerCase().includes(kw) ||
      e.raw?.toLowerCase().includes(kw)
    )
  }

  // 排序
  if (order === 'desc') {
    entries.reverse()
  }

  const total = entries.length
  const paged = entries.slice((page - 1) * limit, page * limit)

  return success(res, {
    logs: paged,
    total,
    page,
    limit,
    date,
    filename: logFile.split('/').pop(),
  })
}))

/**
 * GET /api/admin/logs/tail
 * 获取最新 N 条日志（实时监控用）
 * Query params:
 *   - lines: 返回行数，默认 50，最大 200
 *   - level: 级别筛选
 */
router.get('/tail', asyncHandler(async (req: TeacherRequest, res) => {
  const lines = Math.min(parseInt(req.query.lines as string) || 50, 200)
  const level = req.query.level as string | undefined

  // 读取最新的日志文件
  const today = new Date().toISOString().split('T')[0]
  const logFile = findLogFileByDate(today)
  if (!logFile) {
    return success(res, { logs: [], filename: null })
  }

  const content = await readFile(logFile, 'utf-8')
  const allLines = content.split('\n').filter(line => line.trim())

  let entries = allLines.map(parseLine).filter(Boolean) as LogEntry[]

  // 按级别筛选
  if (level) {
    const levelNum = LEVEL_MAP[level.toLowerCase()]
    if (levelNum !== undefined) {
      entries = entries.filter(e => e.level === levelNum)
    }
  }

  // 取最后 N 条
  const tail = entries.slice(-lines)

  return success(res, {
    logs: tail,
    total: entries.length,
    filename: logFile.split('/').pop(),
  })
}))

/**
 * GET /api/admin/logs/stats
 * 日志统计（各级别数量、错误趋势等）
 * Query params:
 *   - date: 日期，默认今天
 */
router.get('/stats', asyncHandler(async (req: TeacherRequest, res) => {
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0]

  const logFile = findLogFileByDate(date)
  if (!logFile) {
    return success(res, { levelCounts: {}, moduleCounts: {}, hourlyErrors: [], totalLines: 0 })
  }

  const content = await readFile(logFile, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim())
  const entries = lines.map(parseLine).filter(Boolean) as LogEntry[]

  // 各级别统计
  const levelCounts: Record<string, number> = { debug: 0, info: 0, warn: 0, error: 0, fatal: 0 }
  // 各模块统计
  const moduleCounts: Record<string, number> = {}
  // 每小时错误数
  const hourlyErrors: number[] = new Array(24).fill(0)

  for (const entry of entries) {
    const levelName = LEVEL_NAME_MAP[entry.level] || 'unknown'
    levelCounts[levelName] = (levelCounts[levelName] || 0) + 1

    if (entry.module) {
      moduleCounts[entry.module] = (moduleCounts[entry.module] || 0) + 1
    }

    if (entry.level >= 50 && entry.time) { // error+
      const hour = new Date(entry.time).getHours()
      if (hour >= 0 && hour < 24) {
        hourlyErrors[hour]++
      }
    }
  }

  return success(res, {
    levelCounts,
    moduleCounts,
    hourlyErrors,
    totalLines: entries.length,
    date,
  })
}))

/**
 * GET /api/admin/logs/download/:filename
 * 下载日志文件
 */
router.get('/download/:filename', asyncHandler(async (req: TeacherRequest, res) => {
  const filename = req.params.filename as string
  // 安全检查：防止路径穿越
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ success: false, message: '无效的文件名' })
  }

  const filepath = join(LOG_DIR, filename)
  if (!existsSync(filepath)) {
    return res.status(404).json({ success: false, message: '文件不存在' })
  }

  res.download(filepath, filename)
}))

// 辅助类型和函数
interface LogEntry {
  level: number
  time: string
  msg: string
  module?: string
  raw?: string
  [key: string]: any
}

const LEVEL_MAP: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
}

const LEVEL_NAME_MAP: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
}

function parseLine(line: string): LogEntry | null {
  try {
    const obj = JSON.parse(line)
    let module = obj.module || undefined
    let msg = obj.msg || ''

    // 兼容老日志：从消息前缀 [xxx] 中提取 module
    if (!module && msg) {
      const prefixMatch = msg.match(/^\[([^\]]+)\]\s*(.*)$/)
      if (prefixMatch) {
        module = prefixMatch[1].toLowerCase()
        msg = prefixMatch[2]
      }
    }

    return {
      level: obj.level || 30,
      time: obj.time ? new Date(obj.time).toISOString() : '',
      msg,
      module,
      raw: line,
      // 保留额外字段（如 err, req 等）
      ...(obj.err && { err: typeof obj.err === 'object' ? { message: obj.err.message, stack: obj.err.stack } : obj.err }),
      ...(obj.req && { req: { method: obj.req.method, url: obj.req.url } }),
      ...(obj.res && { res: { statusCode: obj.res.statusCode } }),
      ...(obj.responseTime && { responseTime: obj.responseTime }),
    }
  } catch {
    // 非 JSON 格式的行，按纯文本处理
    return {
      level: 30,
      time: '',
      msg: line,
      raw: line,
    }
  }
}

function findLogFileByDate(date: string): string | null {
  if (!existsSync(LOG_DIR)) return null

  // pino-roll 生成的文件名格式：backend.1 (当前) 或 backend-YYYY-MM-DD.log
  // 尝试多种可能的命名格式
  const candidates = [
    `backend-${date}.log`,
    `backend.${date}.log`,
    `backend.log`,
  ]

  for (const candidate of candidates) {
    const filepath = join(LOG_DIR, candidate)
    if (existsSync(filepath)) return filepath
  }

  // 如果精确匹配不到，遍历目录找包含日期的文件
  try {
    const files = readdirSync(LOG_DIR)
    const match = files.find((f) => f.includes(date) && f.endsWith('.log'))
    if (match) return join(LOG_DIR, match)

    // 如果今天的文件不存在，返回最新的文件（可能就是 backend.1 这种）
    if (date === new Date().toISOString().split('T')[0]) {
      const logFiles = files.filter((f) => f.startsWith('backend') && (f.endsWith('.log') || /\.\d+$/.test(f)))
      if (logFiles.length > 0) {
        // 按修改时间排序取最新
        const sorted = logFiles
          .map((f) => ({ name: f, mtime: statSync(join(LOG_DIR, f)).mtime.getTime() }))
          .sort((a, b) => b.mtime - a.mtime)
        return join(LOG_DIR, sorted[0].name)
      }
    }
  } catch { /* ignore */ }

  return null
}

function extractDateFromFilename(filename: string): string {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

export default router
