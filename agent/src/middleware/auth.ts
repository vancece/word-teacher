import type { Request, Response, NextFunction } from 'express'
import { env } from '../config.js'

/**
 * Agent API Key 认证中间件
 * 验证来自 Backend 的请求是否携带正确的 API Key
 * 来自 nginx 内网代理的请求也允许通过
 */
export function agentAuth(req: Request, res: Response, next: NextFunction) {
  // 开发环境跳过认证
  if (env.server.isDev) {
    return next()
  }

  // 未配置 API Key 时跳过（但会在启动时警告）
  if (!env.auth.apiKey) {
    return next()
  }

  // 检查是否来自内网代理（nginx 会设置 X-Forwarded-For）
  // 在 Docker 网络内，nginx 代理的请求是可信的
  const forwardedFor = req.headers['x-forwarded-for']
  const realIp = req.headers['x-real-ip']

  // 如果请求带有 X-Forwarded-For 或 X-Real-IP，说明是通过 nginx 代理的
  // 在 Docker compose 网络中，只有 nginx 能访问 agent
  if (forwardedFor || realIp) {
    return next()
  }

  const apiKey = req.headers['x-agent-api-key'] as string

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'Missing API key',
    })
  }

  if (apiKey !== env.auth.apiKey) {
    return res.status(403).json({
      success: false,
      message: 'Invalid API key',
    })
  }

  next()
}

