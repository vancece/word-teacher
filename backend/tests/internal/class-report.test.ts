/**
 * Internal API - 班级报告测试
 * 覆盖：平均分计算、参与率、维度评分、全校对比
 */
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { prismaMock, resetPrismaMocks } from '../mocks/prisma.js'
import { createTestApp, agentHeaders } from '../helpers/app.js'

const app = createTestApp()

describe('Internal API - GET /api/internal/class-report', () => {
  beforeEach(() => {
    resetPrismaMocks()
  })

  it('classId 缺失应返回 400', async () => {
    const res = await request(app)
      .get('/api/internal/class-report')
      .set(agentHeaders)

    expect(res.status).toBe(400)
    expect(res.body.message).toContain('classId')
  })

  it('班级不存在应返回 404', async () => {
    prismaMock.class.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/internal/class-report?classId=999')
      .set(agentHeaders)

    expect(res.status).toBe(404)
  })

  it('应正确计算班级报告', async () => {
    // Mock 班级信息
    prismaMock.class.findUnique.mockResolvedValue({
      id: 1, name: '三年级1班', grade: '三年级', _count: { students: 30 },
    } as any)

    // Mock 班级学生
    prismaMock.student.findMany.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => ({ id: i + 1 })) as any
    )

    // Mock 对话记录
    prismaMock.practiceRecord.findMany.mockResolvedValue([
      { totalScore: 80, pronunciationScore: 85, fluencyScore: 75, grammarScore: 80, studentId: 1 },
      { totalScore: 90, pronunciationScore: 90, fluencyScore: 88, grammarScore: 92, studentId: 2 },
      { totalScore: 70, pronunciationScore: 72, fluencyScore: 68, grammarScore: 70, studentId: 3 },
    ] as any)

    // Mock 跟读记录
    prismaMock.readAloudRecord.findMany.mockResolvedValue([
      { totalScore: 4, studentId: 1 },
      { totalScore: 5, studentId: 4 },
    ] as any)

    // Mock 游戏记录
    prismaMock.wordGameRecord.findMany.mockResolvedValue([
      { score: 100, studentId: 5 },
    ] as any)

    // Mock 全校对比
    prismaMock.practiceRecord.aggregate.mockResolvedValue({ _avg: { totalScore: 78 } } as any)
    prismaMock.readAloudRecord.aggregate.mockResolvedValue({ _avg: { totalScore: 3.8 } } as any)

    const res = await request(app)
      .get('/api/internal/class-report?classId=1&days=7')
      .set(agentHeaders)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    expect(data.class.name).toBe('三年级1班')
    expect(data.activeStudentCount).toBe(5) // 5 个不同学生有记录
    expect(data.dialogue.count).toBe(3)
    expect(data.dialogue.avgScore).toBe(80) // (80+90+70)/3 = 80
    expect(data.dialogue.avgPronunciation).toBe(82.3) // (85+90+72)/3 ≈ 82.3
    expect(data.readAloud.count).toBe(2)
    expect(data.game.count).toBe(1)
    expect(data.dialogue.schoolAvg).toBe(78)
  })

  it('无学生的班级应正确处理', async () => {
    prismaMock.class.findUnique.mockResolvedValue({
      id: 2, name: '新班级', grade: '一年级', _count: { students: 0 },
    } as any)
    prismaMock.student.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/internal/class-report?classId=2')
      .set(agentHeaders)

    expect(res.status).toBe(200)
    expect(res.body.data.message).toContain('暂无学生')
  })
})
