/**
 * Internal API - 班级排名测试
 * 覆盖：排名排序、日期过滤、Top/Bottom、类型切换
 */
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { prismaMock, resetPrismaMocks } from '../mocks/prisma.js'
import { createTestApp, agentHeaders } from '../helpers/app.js'

const app = createTestApp()

describe('Internal API - GET /api/internal/class-ranking', () => {
  beforeEach(() => {
    resetPrismaMocks()
  })

  it('应返回对话练习 Top 排名（默认参数）', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      {
        id: 1, name: '张三', studentNo: '2024001', class: { name: '三年级1班' },
        practiceRecords: [{ totalScore: 90 }, { totalScore: 85 }],
      },
      {
        id: 2, name: '李四', studentNo: '2024002', class: { name: '三年级1班' },
        practiceRecords: [{ totalScore: 70 }, { totalScore: 75 }],
      },
      {
        id: 3, name: '王五', studentNo: '2024003', class: { name: '三年级1班' },
        practiceRecords: [{ totalScore: 95 }],
      },
    ] as any)

    const res = await request(app)
      .get('/api/internal/class-ranking')
      .set(agentHeaders)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const { ranking } = res.body.data
    expect(ranking).toHaveLength(3)
    // 应按平均分从高到低排序
    expect(ranking[0].name).toBe('王五') // 95
    expect(ranking[1].name).toBe('张三') // 87.5
    expect(ranking[2].name).toBe('李四') // 72.5
  })

  it('应支持 Bottom 排名', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      {
        id: 1, name: '张三', studentNo: '2024001', class: { name: '三年级1班' },
        practiceRecords: [{ totalScore: 90 }],
      },
      {
        id: 2, name: '李四', studentNo: '2024002', class: { name: '三年级1班' },
        practiceRecords: [{ totalScore: 60 }],
      },
    ] as any)

    const res = await request(app)
      .get('/api/internal/class-ranking?order=bottom')
      .set(agentHeaders)

    expect(res.status).toBe(200)
    const { ranking } = res.body.data
    // 从低到高
    expect(ranking[0].name).toBe('李四')
    expect(ranking[1].name).toBe('张三')
  })

  it('应按班级筛选', async () => {
    // 先查班级学生
    prismaMock.student.findMany
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }] as any) // 第一次：查班级学生ID
      .mockResolvedValueOnce([ // 第二次：查学生 + 成绩
        {
          id: 1, name: '张三', studentNo: '2024001', class: { name: '三年级1班' },
          practiceRecords: [{ totalScore: 80 }],
        },
        {
          id: 2, name: '李四', studentNo: '2024002', class: { name: '三年级1班' },
          practiceRecords: [{ totalScore: 85 }],
        },
      ] as any)

    const res = await request(app)
      .get('/api/internal/class-ranking?classId=1')
      .set(agentHeaders)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('应过滤掉没有成绩的学生', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      {
        id: 1, name: '张三', studentNo: '2024001', class: { name: '三年级1班' },
        practiceRecords: [{ totalScore: 80 }],
      },
      {
        id: 2, name: '李四', studentNo: '2024002', class: { name: '三年级1班' },
        practiceRecords: [], // 没有成绩
      },
    ] as any)

    const res = await request(app)
      .get('/api/internal/class-ranking')
      .set(agentHeaders)

    expect(res.status).toBe(200)
    const { ranking } = res.body.data
    expect(ranking).toHaveLength(1)
    expect(ranking[0].name).toBe('张三')
  })

  it('应支持跟读类型排名', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      {
        id: 1, name: '张三', studentNo: '2024001', class: { name: '三年级1班' },
        readAloudRecords: [{ totalScore: 4 }, { totalScore: 5 }],
      },
    ] as any)

    const res = await request(app)
      .get('/api/internal/class-ranking?type=readAloud')
      .set(agentHeaders)

    expect(res.status).toBe(200)
    expect(res.body.data.type).toBe('readAloud')
    expect(res.body.data.ranking[0].avgScore).toBe(4.5)
  })

  it('应支持 limit 参数', async () => {
    const students = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1, name: `学生${i + 1}`, studentNo: `2024${String(i + 1).padStart(3, '0')}`,
      class: { name: '三年级1班' },
      practiceRecords: [{ totalScore: 50 + i * 2 }],
    }))
    prismaMock.student.findMany.mockResolvedValue(students as any)

    const res = await request(app)
      .get('/api/internal/class-ranking?limit=5')
      .set(agentHeaders)

    expect(res.status).toBe(200)
    expect(res.body.data.ranking).toHaveLength(5)
  })
})
