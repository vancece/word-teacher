import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import { env } from './config/env.js'
import { errorHandler } from './middleware/errorHandler.js'
import { requestLogger, timeoutMiddleware } from './middleware/request.js'
import routes from './routes/index.js'

const app = express()

// 信任代理（Nginx 反向代理时需要）
if (env.isProd) {
  app.set('trust proxy', 1)
}

// 安全中间件
app.use(helmet())

// CORS 配置
app.use(cors({
  origin: env.cors.origins,
  credentials: true,
}))

// 全局 Rate Limiting - 每 IP 每 15 分钟最多 1000 次请求
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isDev ? 10000 : 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: '请求过于频繁，请稍后再试' },
  skip: () => env.isDev, // 开发环境跳过
})
app.use(globalLimiter)

// 登录接口严格限流 - 每 IP 每 15 分钟最多 10 次登录尝试
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isDev ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: '登录尝试过多，请 15 分钟后再试' },
  skip: () => env.isDev,
})
app.use('/api/auth/login', authLimiter)

// 解析 JSON（增加限制以支持音频数据）
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// 设置默认响应字符集为 UTF-8，解决中文乱码问题
app.use((_req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  next()
})

// 请求日志
app.use(requestLogger)

// 请求超时控制（默认 30 秒，AI 相关接口 120 秒）
app.use(timeoutMiddleware(30000))
app.use('/api/dialogue', timeoutMiddleware(120000))
app.use('/api/read-aloud', timeoutMiddleware(120000))
app.use('/api/admin/students/:id/summary', timeoutMiddleware(120000))

// API 路由
app.use('/api', routes)

// 404 处理
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  })
})

// 错误处理
app.use(errorHandler)

export default app

