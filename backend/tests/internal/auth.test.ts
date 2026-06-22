/**
 * Internal API 认证测试
 * 验证 Agent API Key 认证中间件的行为
 */
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { prismaMock, resetPrismaMocks } from '../mocks/prisma.js'
import { createTestApp, agentHeaders } from '../helpers/app.js'

const app = createTestApp()

describe('Internal API - Authentication', () => {
  beforeEach(() => {
    resetPrismaMocks()
  })

  it('应拒绝无 API Key 的请求', async () => {
    const res = await request(app)
      .get('/api/internal/stats')
      .set('Content-Type', 'application/json')

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toContain('Unauthorized')
  })

  it('应拒绝错误的 API Key', async () => {
    const res = await request(app)
      .get('/api/internal/stats')
      .set('x-agent-api-key', 'wrong-key')

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('应允许正确 API Key 的请求', async () => {
    prismaMock.student.count.mockResolvedValue(10)
    prismaMock.teacher.count.mockResolvedValue(3)
    prismaMock.class.count.mockResolvedValue(2)
    prismaMock.practiceRecord.count.mockResolvedValue(5)
    prismaMock.readAloudRecord.count.mockResolvedValue(3)
    prismaMock.wordGameRecord.count.mockResolvedValue(1)

    const res = await request(app)
      .get('/api/internal/stats')
      .set(agentHeaders)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})
