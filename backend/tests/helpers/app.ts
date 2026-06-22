/**
 * 测试用 Express app 工厂
 * 直接挂载 internal routes，跳过不需要的中间件
 */
import express from 'express'
import internalRoutes from '../../src/routes/internal.routes.js'

export function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/internal', internalRoutes)
  return app
}

/** 默认测试 headers（通过 Agent API Key 认证） */
export const agentHeaders = {
  'x-agent-api-key': 'test-agent-api-key',
  'Content-Type': 'application/json',
}

/** 带教师ID的 headers */
export function headersWithTeacher(teacherId: number) {
  return {
    ...agentHeaders,
    'x-teacher-id': String(teacherId),
  }
}
