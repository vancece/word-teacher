/**
 * Internal API - 权限过滤测试
 * 验证 getAllowedStudentIds 的行为：管理员无限制，普通教师只能看自己班的
 */
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { prismaMock, resetPrismaMocks } from '../mocks/prisma.js'
import { createTestApp, headersWithTeacher } from '../helpers/app.js'

const app = createTestApp()

describe('Internal API - Permission Filtering', () => {
  beforeEach(() => {
    resetPrismaMocks()
  })

  it('管理员应能看到所有学生', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: true } as any)
    prismaMock.student.findMany.mockResolvedValue([
      { id: 1, name: '张三', studentNo: '001', seatNo: 1, class: { id: 1, name: '三年级1班' } },
      { id: 2, name: '李四', studentNo: '002', seatNo: 2, class: { id: 2, name: '四年级1班' } },
    ] as any)

    const res = await request(app)
      .get('/api/internal/students')
      .set(headersWithTeacher(1))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })

  it('普通教师只能看自己班的学生', async () => {
    // 非管理员
    prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: false } as any)
    // 教师负责的班级
    prismaMock.classTeacher.findMany.mockResolvedValue([{ classId: 1 }] as any)
    // 该班级的学生
    prismaMock.student.findMany
      .mockResolvedValueOnce([{ id: 1 }, { id: 3 }] as any) // getAllowedStudentIds
      .mockResolvedValueOnce([ // 实际查询
        { id: 1, name: '张三', studentNo: '001', seatNo: 1, class: { id: 1, name: '三年级1班' } },
        { id: 3, name: '王五', studentNo: '003', seatNo: 3, class: { id: 1, name: '三年级1班' } },
      ] as any)

    const res = await request(app)
      .get('/api/internal/students')
      .set(headersWithTeacher(2))

    expect(res.status).toBe(200)
    // 只返回了自己班的
    expect(res.body.data).toHaveLength(2)
  })

  it('没有班级的教师应看不到任何学生', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: false } as any)
    prismaMock.classTeacher.findMany.mockResolvedValue([]) // 没有负责任何班级
    prismaMock.student.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/internal/students')
      .set(headersWithTeacher(3))

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })

  it('教师列表应仅管理员可见', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: false } as any)

    const res = await request(app)
      .get('/api/internal/teachers')
      .set(headersWithTeacher(5))

    expect(res.status).toBe(403)
    expect(res.body.message).toContain('管理员')
  })

  it('管理员可查看教师列表', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: true } as any)
    prismaMock.teacher.findMany.mockResolvedValue([
      { id: 1, username: 'admin', name: '管理员', isAdmin: true, createdAt: new Date(), classes: [] },
    ] as any)

    const res = await request(app)
      .get('/api/internal/teachers')
      .set(headersWithTeacher(1))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
  })
})
