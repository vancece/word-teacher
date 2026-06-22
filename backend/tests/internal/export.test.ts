/**
 * Internal API - Export Excel 路由测试
 * 验证查询模式和数据模式的基本逻辑
 */
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { prismaMock, resetPrismaMocks } from '../mocks/prisma.js'
import { createTestApp, headersWithTeacher } from '../helpers/app.js'

const app = createTestApp()

describe('Internal API - Export Excel', () => {
  beforeEach(() => {
    resetPrismaMocks()
  })

  describe('参数校验', () => {
    it('既无 source 也无 sheets 应返回 400', async () => {
      const res = await request(app)
        .post('/api/internal/export/excel')
        .set(headersWithTeacher(1))
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.message).toContain('source')
    })
  })

  describe('数据模式', () => {
    it('传入 sheets 数据应成功生成 Excel', async () => {
      const res = await request(app)
        .post('/api/internal/export/excel')
        .set(headersWithTeacher(1))
        .send({
          title: '测试数据',
          sheets: [
            {
              name: '汇总',
              headers: ['姓名', '分数'],
              rows: [['张三', 90], ['李四', 85]],
            },
          ],
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.filename).toContain('测试数据')
      expect(res.body.data.filename).toContain('.xlsx')
      expect(res.body.data.downloadUrl).toContain('/api/internal/export/download/')
      expect(res.body.data.message).toContain('测试数据')
    })

    it('多 sheet 导出应成功', async () => {
      const res = await request(app)
        .post('/api/internal/export/excel')
        .set(headersWithTeacher(1))
        .send({
          title: '多Sheet测试',
          sheets: [
            { name: 'Sheet1', headers: ['列A', '列B'], rows: [['a', 'b']] },
            { name: 'Sheet2', headers: ['列C'], rows: [['c']] },
          ],
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe('查询模式 - studentScores', () => {
    it('管理员未指定 classId 应导出全部班级', async () => {
      prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: true } as any)
      prismaMock.class.findMany.mockResolvedValue([
        { id: 1 }, { id: 2 },
      ] as any)
      prismaMock.student.findMany.mockResolvedValue([
        { id: 1, name: '张三', studentNo: '001', seatNo: 1, class: { name: '1班' } },
        { id: 2, name: '李四', studentNo: '002', seatNo: 2, class: { name: '2班' } },
      ] as any)
      prismaMock.practiceRecord.findMany.mockResolvedValue([])
      prismaMock.readAloudRecord.findMany.mockResolvedValue([])
      prismaMock.wordGameRecord.findMany.mockResolvedValue([])

      const res = await request(app)
        .post('/api/internal/export/excel')
        .set(headersWithTeacher(1))
        .send({ source: 'studentScores', params: {} })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.filename).toContain('全部班级')
    })

    it('普通教师未指定 classId 应导出所属班级', async () => {
      prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: false } as any)
      prismaMock.classTeacher.findMany.mockResolvedValue([
        { classId: 3 },
      ] as any)
      prismaMock.student.findMany.mockResolvedValue([
        { id: 5, name: '王五', studentNo: '005', seatNo: 1, class: { name: '3班' } },
      ] as any)
      prismaMock.practiceRecord.findMany.mockResolvedValue([])
      prismaMock.readAloudRecord.findMany.mockResolvedValue([])
      prismaMock.wordGameRecord.findMany.mockResolvedValue([])

      const res = await request(app)
        .post('/api/internal/export/excel')
        .set(headersWithTeacher(5))
        .send({ source: 'studentScores', params: {} })

      expect(res.status).toBe(200)
      expect(res.body.data.filename).toContain('所属班级')
    })

    it('指定 classId 但教师无权限应返回错误', async () => {
      prismaMock.teacher.findUnique.mockResolvedValue({ isAdmin: false } as any)
      prismaMock.class.findUnique.mockResolvedValue({ id: 99, name: '别人的班' } as any)
      prismaMock.classTeacher.findFirst.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/internal/export/excel')
        .set(headersWithTeacher(5))
        .send({ source: 'studentScores', params: { classId: 99 } })

      // asyncHandler 会把带 statusCode 的 Error 以对应状态码返回
      expect(res.status).toBe(403)
    })

    it('不支持的 source 应返回错误', async () => {
      const res = await request(app)
        .post('/api/internal/export/excel')
        .set(headersWithTeacher(1))
        .send({ source: 'unknownSource', params: {} })

      expect(res.status).toBeGreaterThanOrEqual(400)
    })
  })

  describe('文件下载', () => {
    it('路径穿越（含斜杠）应返回 400', async () => {
      const res = await request(app)
        .get('/api/internal/export/download/foo%2F..%2F..%2Fetc%2Fpasswd')
        .set(headersWithTeacher(1))

      expect(res.status).toBe(400)
      expect(res.body.message).toContain('无效文件名')
    })

    it('不存在的文件应返回 404', async () => {
      const res = await request(app)
        .get('/api/internal/export/download/nonexistent_file.xlsx')
        .set(headersWithTeacher(1))

      expect(res.status).toBe(404)
      expect(res.body.message).toContain('不存在')
    })
  })
})
