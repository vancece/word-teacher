/**
 * Backend 日志系统 - pino + pino-roll
 * 开发环境: console 美化输出 + 文件
 * 生产环境: JSON 格式 + 文件
 * 日志路径: backend/logs/backend-YYYY-MM-DD.log（按天切割）
 */
import pino from 'pino'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { env } from '../config/env.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOG_DIR = join(__dirname, '../../logs')

// 确保日志目录存在
mkdirSync(LOG_DIR, { recursive: true })

// 使用 createRequire 解析 pino-roll 的绝对路径，避免 pino transport worker 解析失败
const require = createRequire(import.meta.url)
const pinoRollPath = require.resolve('pino-roll')

// 构建 transport targets
const targets: pino.TransportTargetOptions[] = []

// 文件输出（按天切割）- 所有环境都写文件，供日志查询页面使用
targets.push({
  target: pinoRollPath,
  options: {
    file: join(LOG_DIR, 'backend'),
    frequency: 'daily',
    dateFormat: 'yyyy-MM-dd',
    extension: '.log',
    mkdir: true,
  },
  level: env.isDev ? 'debug' : 'info',
})

// 开发环境加 console 美化
if (env.isDev) {
  targets.push({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
    level: 'debug',
  })
} else {
  // 生产环境也输出到 stdout（Docker 采集用）
  targets.push({
    target: 'pino/file',
    options: { destination: 1 }, // stdout
    level: 'info',
  })
}

export const logger = pino(
  { level: env.isDev ? 'debug' : 'info' },
  pino.transport({ targets })
)

// 创建子 logger 用于不同模块
export const createLogger = (module: string) => logger.child({ module })

// 常用模块 logger
export const dbLogger = createLogger('database')
export const authLogger = createLogger('auth')
export const apiLogger = createLogger('api')
export const agentLogger = createLogger('agent')
