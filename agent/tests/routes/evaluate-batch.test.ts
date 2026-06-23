/**
 * POST /evaluate-batch 路由测试
 * 验证参数校验和响应格式
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import express from 'express'
import request from 'supertest'

// Mock agents/index.js
vi.mock('../../src/agents/index.js', () => ({
  readAloudAgent: {
    evaluateBatch: vi.fn(),
    evaluateAudio: vi.fn(),
  },
  readAloudScoringAgent: {
    evaluate: vi.fn(),
  },
}))

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  readAloudLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  iseLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { readAloudAgent } from '../../src/agents/index.js'

let app: express.Express

beforeAll(async () => {
  app = express()
  app.use(express.json({ limit: '50mb' }))

  // 动态导入路由（mock 已生效）
  const { default: routes } = await import('../../src/routes/read-aloud.routes.js')
  app.use('/api/agent/read-aloud', routes)
})

describe('POST /api/agent/read-aloud/evaluate-batch', () => {
  it('缺少 sentences 字段返回 400', async () => {
    const res = await request(app)
      .post('/api/agent/read-aloud/evaluate-batch')
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('sentences')
  })

  it('sentences 为空数组返回 400', async () => {
    const res = await request(app)
      .post('/api/agent/read-aloud/evaluate-batch')
      .send({ sentences: [] })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('sentences')
  })

  it('sentences 中某项缺少 text 返回 400', async () => {
    const res = await request(app)
      .post('/api/agent/read-aloud/evaluate-batch')
      .send({
        sentences: [
          { audioBase64: 'abc123' }, // 缺少 text
        ],
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('sentences[0]')
  })

  it('sentences 中某项缺少 audioBase64 返回 400', async () => {
    const res = await request(app)
      .post('/api/agent/read-aloud/evaluate-batch')
      .send({
        sentences: [
          { text: 'Hello world' }, // 缺少 audioBase64
        ],
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('sentences[0]')
  })

  it('合法请求返回 200 和正确格式', async () => {
    vi.mocked(readAloudAgent.evaluateBatch).mockResolvedValue([
      {
        words: [{ text: 'Hello', status: 'correct', accuracy: 90, matchTag: 'correct' }],
        accuracy: 90,
        feedback: 'Good!',
        fluency: 85,
        completeness: 100,
        suggestedScore: 88,
        evaluationMethod: 'ise',
      },
    ])

    const res = await request(app)
      .post('/api/agent/read-aloud/evaluate-batch')
      .send({
        sentences: [
          { text: 'Hello', audioBase64: 'UklGRgAAAA==' },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.results).toHaveLength(1)
    expect(res.body.data.results[0].accuracy).toBe(90)
    expect(res.body.data.results[0].evaluationMethod).toBe('ise')
  })

  it('agent 抛异常时返回 500', async () => {
    vi.mocked(readAloudAgent.evaluateBatch).mockRejectedValue(new Error('ISE connection failed'))

    const res = await request(app)
      .post('/api/agent/read-aloud/evaluate-batch')
      .send({
        sentences: [
          { text: 'Hello', audioBase64: 'UklGRgAAAA==' },
        ],
      })

    expect(res.status).toBe(500)
    expect(res.body.error).toContain('batch evaluate')
  })

  it('多句请求正确传递给 agent', async () => {
    vi.mocked(readAloudAgent.evaluateBatch).mockResolvedValue([
      { words: [], accuracy: 80, feedback: '', fluency: 75, completeness: 90, suggestedScore: 78, evaluationMethod: 'ise' },
      { words: [], accuracy: 70, feedback: '', fluency: 65, completeness: 80, suggestedScore: 68, evaluationMethod: 'ise' },
      { words: [], accuracy: 90, feedback: '', fluency: 88, completeness: 100, suggestedScore: 90, evaluationMethod: 'ise' },
    ])

    const sentences = [
      { text: 'Hello world', audioBase64: 'audio1base64' },
      { text: 'Good morning', audioBase64: 'audio2base64' },
      { text: 'Thank you', audioBase64: 'audio3base64' },
    ]

    const res = await request(app)
      .post('/api/agent/read-aloud/evaluate-batch')
      .send({ sentences })

    expect(res.status).toBe(200)
    expect(res.body.data.results).toHaveLength(3)
    expect(readAloudAgent.evaluateBatch).toHaveBeenCalledWith(sentences)
  })
})
