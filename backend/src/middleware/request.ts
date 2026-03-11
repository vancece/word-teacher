import type { Request, Response, NextFunction } from 'express'
import { apiLogger } from '../utils/logger.js'
import { env } from '../config/env.js'

/**
 * 请求日志中间件
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()
  
  // 请求开始日志
  if (env.isDev) {
    apiLogger.debug({ method: req.method, path: req.path }, 'Request started')
  }

  // 响应完成后记录
  res.on('finish', () => {
    const duration = Date.now() - start
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    
    apiLogger[level]({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.headers['x-forwarded-for'],
    }, `${req.method} ${req.path} ${res.statusCode}`)
  })

  next()
}

/**
 * 请求超时中间件
 * @param timeout 超时时间（毫秒）
 */
export function timeoutMiddleware(timeout: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 设置响应超时
    res.setTimeout(timeout, () => {
      if (!res.headersSent) {
        apiLogger.warn({
          method: req.method,
          path: req.path,
          timeout,
        }, 'Request timeout')
        
        res.status(504).json({
          success: false,
          message: '请求超时，请稍后重试',
        })
      }
    })

    next()
  }
}

