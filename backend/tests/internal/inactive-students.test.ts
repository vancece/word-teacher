/**
 * Internal API - 不活跃学生测试
 */
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { prismaMock, resetPrismaMocks } from '../mocks/prisma.js'
import { createTestApp, agentHeaders } from '../helpers/app.js'

const app = createTestApp()

describe('Internal API - GET /api/internal/inactive-students', () => {
  beforeEach(() => {
    resetPrismaMocks()
  })

  it('应正确识别不活跃学生', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      {
        id: 1, name: '张三', studentNo: '2024001', class: { name: '三年级1班' },
        practiceRecords: [{ id: 1 }], // 有记录
        readAloudRecords: [],
        wordGameRecords: [],
      },
      {
        id: 2, name: '李四', studentNo: '2024002', class: { name: '三年级1班' },
        practiceRecords: [],
        readAloudRecords: [],
        wordGameRecords: [], // 完全没记录
      },
      {
        id: 3, name: '王五', studentNo: '2024003', class: { name: '三年级1班' },
        practiceRecords: [],
        readAloudRecords: [],
        wordGameRecords: [], // 完全没记录
      },
    ] as any)

    const res = await request(app)
      .get('/api/internal/inactive-students?days=7')
      .set(agentHeaders)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    expect(data.inactiveCount).toBe(2)
    expect(data.totalStudents).toBe(3)
    expect(data.inactiveRate).toBe('67%')
    expect(data.students).toHaveLength(2)
    expect(data.students[0].name).toBe('李四')
    expect(data.students[1].name).toBe('王五')
  })

  it('所有学生都活跃时应返回空列表', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      {
        id: 1, name: '张三', studentNo: '2024001', class: { name: '三年级1班' },
        practiceRecords: [{ id: 1 }],
        readAloudRecords: [],
        wordGameRecords: [],
      },
    ] as any)

    const res = await request(app)
      .get('/api/internal/inactive-students')
      .set(agentHeaders)

    expect(res.status).toBe(200)
    expect(res.body.data.inactiveCount).toBe(0)
    expect(res.body.data.students).toHaveLength(0)
  })

  it('应支持按班级筛选', async () => {
    prismaMock.student.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/internal/inactive-students?classId=1&days=14')
      .set(agentHeaders)

    expect(res.status).toBe(200)

    // 验证 findMany 被调用时传了 classId
    expect(prismaMock.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ classId: 1 }),
      })
    )
  })
})
