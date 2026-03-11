import pino from 'pino'
import { env } from '../config/env.js'

// 创建 logger 实例
export const logger = pino({
  level: env.isDev ? 'debug' : 'info',
  transport: env.isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined, // 生产环境输出 JSON 格式，便于日志收集
  base: {
    env: env.nodeEnv,
  },
})

// 创建子 logger 用于不同模块
export const createLogger = (module: string) => logger.child({ module })

// 常用模块 logger
export const dbLogger = createLogger('database')
export const authLogger = createLogger('auth')
export const apiLogger = createLogger('api')
export const agentLogger = createLogger('agent')

