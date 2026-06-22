/**
 * Internal API - queryDatabase 路由测试
 * 验证 SQL 安全校验、权限过滤、exportExcel 导出
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { prismaMock, resetPrismaMocks } from '../mocks/prisma.js'
import { createTestApp, headersWithTeacher } from '../helpers/app.js'

const app = createTestApp()

// 给 prismaMock 添加 $queryRawUnsafe 方法
;(prismaMock as any).$queryRawUnsafe = vi.fn()

describe('Internal API - QueryDB', () => {
  beforeEach(() => {
    resetPrismaMocks()
    ;(prismaMock as any).$queryRawUnsafe.mockReset()
  })

  describe('安全校验', () => {
    it('sql 为空应返回 400', async () => {
      const res = await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: '' })

      expect(res.status).toBe(400)
      expect(res.body.message).toContain('sql')
    })

    it('非 SELECT 语句应返回 403', async () => {
      const res = await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: 'DELETE FROM students WHERE id = 1' })

      expect(res.status).toBe(403)
      expect(res.body.message).toContain('只允许 SELECT')
    })

    it('包含 INSERT 关键字应返回 403', async () => {
      const res = await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: 'SELECT * FROM students; INSERT INTO students VALUES (1)' })

      expect(res.status).toBe(403)
      expect(res.body.message).toContain('INSERT')
    })

    it('包含 DROP 关键字应返回 403', async () => {
      const res = await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: 'SELECT * FROM students; DROP TABLE students' })

      expect(res.status).toBe(403)
      expect(res.body.message).toContain('DROP')
    })

    it('查询 password 敏感字段应返回 403', async () => {
      const res = await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: 'SELECT password FROM students' })

      expect(res.status).toBe(403)
      // PASSWORD 同时在 FORBIDDEN_KEYWORDS 中，先被拦截
      expect(res.body.message).toContain('PASSWORD')
    })

    it('查询不在白名单中的表应返回 403', async () => {
      const res = await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: 'SELECT * FROM secret_table' })

      expect(res.status).toBe(403)
      expect(res.body.message).toContain('不允许查询表')
    })

    it('无法识别表名应返回 400', async () => {
      const res = await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: 'SELECT 1+1' })

      expect(res.status).toBe(400)
      expect(res.body.message).toContain('无法识别')
    })
  })

  describe('管理员查询', () => {
    it('管理员可查询任意数据', async () => {
      prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: true } as any)
      ;(prismaMock as any).$queryRawUnsafe.mockResolvedValue([
        { id: 1, name: '张三' },
        { id: 2, name: '李四' },
      ])

      const res = await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: 'SELECT id, name FROM students' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.rows).toHaveLength(2)
      expect(res.body.data.rowCount).toBe(2)
      expect(res.body.data.truncated).toBe(false)
    })

    it('结果满 100 行时 truncated=true', async () => {
      prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: true } as any)
      ;(prismaMock as any).$queryRawUnsafe.mockResolvedValue(
        Array(100).fill({ id: 1, name: 'test' })
      )

      const res = await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: 'SELECT * FROM students' })

      expect(res.status).toBe(200)
      expect(res.body.data.truncated).toBe(true)
    })

    it('应自动添加 LIMIT', async () => {
      prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: true } as any)
      ;(prismaMock as any).$queryRawUnsafe.mockResolvedValue([])

      await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: 'SELECT * FROM students' })

      const executedSql = (prismaMock as any).$queryRawUnsafe.mock.calls[0][0] as string
      expect(executedSql).toMatch(/LIMIT 100$/)
    })

    it('用户 LIMIT 超限时应被截断', async () => {
      prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: true } as any)
      ;(prismaMock as any).$queryRawUnsafe.mockResolvedValue([])

      await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: 'SELECT * FROM students LIMIT 500' })

      const executedSql = (prismaMock as any).$queryRawUnsafe.mock.calls[0][0] as string
      expect(executedSql).toMatch(/LIMIT 100$/)
    })
  })

  describe('权限过滤（普通教师）', () => {
    beforeEach(() => {
      // 设置非管理员教师
      prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: false } as any)
      // 教师负责班级 1 和 2
      prismaMock.classTeacher.findMany.mockResolvedValue([
        { classId: 1 },
        { classId: 2 },
      ] as any)
      // 班级内的学生
      prismaMock.student.findMany.mockResolvedValue([
        { id: 10 },
        { id: 11 },
        { id: 12 },
      ] as any)
    })

    it('查询 students 表应注入 class_id 过滤子查询', async () => {
      ;(prismaMock as any).$queryRawUnsafe.mockResolvedValue([
        { id: 10, name: '张三' },
      ])

      await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(5))
        .send({ sql: 'SELECT * FROM students' })

      const executedSql = (prismaMock as any).$queryRawUnsafe.mock.calls[0][0] as string
      expect(executedSql).toContain('SELECT * FROM students WHERE class_id IN (1,2)')
    })

    it('查询 students 带别名时应保留别名', async () => {
      ;(prismaMock as any).$queryRawUnsafe.mockResolvedValue([])

      await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(5))
        .send({ sql: 'SELECT s.name FROM students s' })

      const executedSql = (prismaMock as any).$queryRawUnsafe.mock.calls[0][0] as string
      expect(executedSql).toContain('(SELECT * FROM students WHERE class_id IN (1,2)) s')
    })

    it('查询成绩表应注入 student_id 过滤', async () => {
      ;(prismaMock as any).$queryRawUnsafe.mockResolvedValue([])

      await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(5))
        .send({ sql: 'SELECT * FROM practice_records' })

      const executedSql = (prismaMock as any).$queryRawUnsafe.mock.calls[0][0] as string
      expect(executedSql).toContain('SELECT * FROM practice_records WHERE student_id IN (10,11,12)')
    })

    it('查询 classes 表应注入 id 过滤', async () => {
      ;(prismaMock as any).$queryRawUnsafe.mockResolvedValue([])

      await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(5))
        .send({ sql: 'SELECT * FROM classes' })

      const executedSql = (prismaMock as any).$queryRawUnsafe.mock.calls[0][0] as string
      expect(executedSql).toContain('SELECT * FROM classes WHERE id IN (1,2)')
    })

    it('没有班级的教师应返回 403', async () => {
      prismaMock.classTeacher.findMany.mockResolvedValue([])

      const res = await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(5))
        .send({ sql: 'SELECT * FROM students' })

      expect(res.status).toBe(403)
      expect(res.body.message).toContain('没有负责的班级')
    })
  })

  describe('exportExcel 模式', () => {
    it('exportExcel=true 且有数据应返回下载链接', async () => {
      prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: true } as any)
      ;(prismaMock as any).$queryRawUnsafe.mockResolvedValue([
        { name: '张三', score: 85 },
        { name: '李四', score: 92 },
      ])

      const res = await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: 'SELECT name, score FROM students', exportExcel: true, exportTitle: '测试导出' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.downloadUrl).toContain('/api/internal/export/download/')
      expect(res.body.data.filename).toContain('测试导出')
      expect(res.body.data.filename).toContain('.xlsx')
      expect(res.body.data.message).toContain('2 行')
    })

    it('exportExcel=true 时 LIMIT 放宽到 1000', async () => {
      prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: true } as any)
      ;(prismaMock as any).$queryRawUnsafe.mockResolvedValue([])

      await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: 'SELECT * FROM students', exportExcel: true })

      const executedSql = (prismaMock as any).$queryRawUnsafe.mock.calls[0][0] as string
      expect(executedSql).toMatch(/LIMIT 1000$/)
    })

    it('exportExcel=true 但结果为空应返回普通查询结果', async () => {
      prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: true } as any)
      ;(prismaMock as any).$queryRawUnsafe.mockResolvedValue([])

      const res = await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: 'SELECT * FROM students', exportExcel: true })

      expect(res.status).toBe(200)
      // 空结果不走 Excel 导出路径，走普通返回
      expect(res.body.data.rows).toEqual([])
    })
  })

  describe('SQL 执行错误处理', () => {
    it('SQL 语法错误应返回 400 和错误信息', async () => {
      prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: true } as any)
      ;(prismaMock as any).$queryRawUnsafe.mockRejectedValue(
        new Error("You have an error in your SQL syntax near 'FORM'")
      )

      const res = await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: 'SELECT * FROM students WHERE' })

      expect(res.status).toBe(400)
      expect(res.body.message).toContain('SQL 执行失败')
    })

    it('BigInt 字段应正确序列化为 Number', async () => {
      prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: true } as any)
      ;(prismaMock as any).$queryRawUnsafe.mockResolvedValue([
        { id: BigInt(123456789), name: '测试' },
      ])

      const res = await request(app)
        .post('/api/internal/query-db')
        .set(headersWithTeacher(1))
        .send({ sql: 'SELECT id, name FROM students' })

      expect(res.status).toBe(200)
      expect(res.body.data.rows[0].id).toBe(123456789)
      expect(typeof res.body.data.rows[0].id).toBe('number')
    })
  })
})
