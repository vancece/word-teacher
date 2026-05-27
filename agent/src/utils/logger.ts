/**
 * Agent 日志系统 - pino + pino-roll
 * 开发环境: console 美化输出 + 文件
 * 生产环境: JSON 格式 + 文件
 * 日志路径: agent/logs/agent-YYYY-MM-DD.log（按天切割）
 */
import pino from 'pino'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOG_DIR = join(__dirname, '../../logs')

// 确保日志目录存在
mkdirSync(LOG_DIR, { recursive: true })

const isDev = process.env.NODE_ENV !== 'production'

// 构建 transport targets
const targets: pino.TransportTargetOptions[] = [
  // 文件输出（按天切割）
  {
    target: 'pino-roll',
    options: {
      file: join(LOG_DIR, 'agent'),
      frequency: 'daily',
      dateFormat: 'yyyy-MM-dd',
      extension: '.log',
      mkdir: true,
    },
    level: 'debug',
  },
]

// 开发环境加 console 美化
if (isDev) {
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
  { level: 'debug' },
  pino.transport({ targets })
)

// 创建模块子 logger
export const createLogger = (module: string) => logger.child({ module })

// 预定义模块 logger
export const iseLogger = createLogger('xfyun-ise')
export const sttLogger = createLogger('aliyun-stt')
export const readAloudLogger = createLogger('read-aloud')
export const dialogueLogger = createLogger('dialogue')
