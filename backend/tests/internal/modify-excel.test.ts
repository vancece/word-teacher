/**
 * Internal API - Modify Excel 路由测试
 * 验证各种 Excel 修改操作
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { resetPrismaMocks } from '../mocks/prisma.js'
import { createTestApp, headersWithTeacher } from '../helpers/app.js'
import ExcelJS from 'exceljs'
import path from 'path'
import fs from 'fs'

const app = createTestApp()
const EXPORT_DIR = path.resolve(process.cwd(), 'tmp/exports')

// 创建测试用 Excel 文件
async function createTestExcel(filename: string, sheets: Array<{ name: string; headers: string[]; rows: any[][] }>) {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true })
  }
  const workbook = new ExcelJS.Workbook()
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name)
    ws.columns = sheet.headers.map(h => ({ header: h, key: h, width: 12 }))
    for (const row of sheet.rows) {
      const rowData: Record<string, any> = {}
      sheet.headers.forEach((h, i) => { rowData[h] = row[i] })
      ws.addRow(rowData)
    }
  }
  const filepath = path.join(EXPORT_DIR, filename)
  await workbook.xlsx.writeFile(filepath)
  return `/api/internal/export/download/${filename}`
}

// 读取结果 Excel
async function readResultExcel(downloadUrl: string): Promise<ExcelJS.Workbook> {
  const filename = downloadUrl.split('/').pop()!
  const filepath = path.join(EXPORT_DIR, decodeURIComponent(filename))
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filepath)
  return workbook
}

// 获取 Sheet 的表头
function getHeaders(ws: ExcelJS.Worksheet): string[] {
  const headers: string[] = []
  const row = ws.getRow(1)
  for (let col = 1; col <= ws.columnCount; col++) {
    headers.push(String(row.getCell(col).value || ''))
  }
  return headers
}

// 获取某列所有数据
function getColumnValues(ws: ExcelJS.Worksheet, colIdx: number): any[] {
  const values: any[] = []
  for (let row = 2; row <= ws.rowCount; row++) {
    const val = ws.getRow(row).getCell(colIdx).value
    if (val !== null && val !== undefined) values.push(val)
  }
  return values
}

describe('Internal API - Modify Excel', () => {
  const testFile = 'test_modify_source.xlsx'
  let downloadUrl: string

  beforeEach(async () => {
    resetPrismaMocks()
    downloadUrl = await createTestExcel(testFile, [
      {
        name: '对话成绩',
        headers: ['姓名', '班级', '总分', '发音', '流利', '日期'],
        rows: [
          ['张三', '3年级1班', 92, 90, 95, '2026-06-20'],
          ['李四', '3年级1班', 78, 75, 80, '2026-06-21'],
          ['王五', '3年级2班', 85, 88, 82, '2026-06-21'],
          ['赵六', '3年级2班', 65, 60, 70, '2026-06-22'],
        ],
      },
      {
        name: '跟读成绩',
        headers: ['姓名', '班级', '总分', '语调', '准确'],
        rows: [
          ['张三', '3年级1班', 88, 90, 86],
          ['李四', '3年级1班', 72, 70, 74],
        ],
      },
    ])
  })

  afterEach(() => {
    // 清理测试文件
    if (fs.existsSync(EXPORT_DIR)) {
      const files = fs.readdirSync(EXPORT_DIR)
      for (const file of files) {
        fs.unlinkSync(path.join(EXPORT_DIR, file))
      }
    }
  })

  describe('参数校验', () => {
    it('缺少 downloadUrl 应返回 400', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({ operations: [{ type: 'renameColumns' }] })
      expect(res.status).toBe(400)
    })

    it('缺少 operations 应返回 400', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({ downloadUrl })
      expect(res.status).toBe(400)
    })

    it('文件不存在应返回 404', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl: '/api/internal/export/download/nonexistent.xlsx',
          operations: [{ type: 'renameColumns', renameMap: {} }],
        })
      expect(res.status).toBe(404)
    })

    it('指定不存在的 Sheet 应返回 400', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl,
          sheetName: '不存在的Sheet',
          operations: [{ type: 'renameColumns', renameMap: {} }],
        })
      expect(res.status).toBe(400)
      expect(res.body.message).toContain('不存在')
    })
  })

  describe('renameColumns - 重命名列', () => {
    it('应正确重命名指定列', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl,
          sheetName: '对话成绩',
          operations: [{
            type: 'renameColumns',
            renameMap: { '姓名': 'Name', '总分': 'Score', '班级': 'Class' },
          }],
        })

      expect(res.status).toBe(200)
      expect(res.body.data.downloadUrl).toContain('/download/')

      const wb = await readResultExcel(res.body.data.downloadUrl)
      const ws = wb.getWorksheet('对话成绩')!
      const headers = getHeaders(ws)
      expect(headers).toContain('Name')
      expect(headers).toContain('Score')
      expect(headers).toContain('Class')
      expect(headers).not.toContain('姓名')
    })
  })

  describe('deleteColumns - 删除列', () => {
    it('应正确删除指定列', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl,
          sheetName: '对话成绩',
          operations: [{
            type: 'deleteColumns',
            columns: ['发音', '流利', '日期'],
          }],
        })

      expect(res.status).toBe(200)
      const wb = await readResultExcel(res.body.data.downloadUrl)
      const ws = wb.getWorksheet('对话成绩')!
      const headers = getHeaders(ws)
      expect(headers).toEqual(['姓名', '班级', '总分'])
    })
  })

  describe('sortRows - 排序', () => {
    it('应按总分降序排列', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl,
          sheetName: '对话成绩',
          operations: [{
            type: 'sortRows',
            sortBy: '总分',
            sortOrder: 'desc',
          }],
        })

      expect(res.status).toBe(200)
      const wb = await readResultExcel(res.body.data.downloadUrl)
      const ws = wb.getWorksheet('对话成绩')!
      // 第一行数据应该是最高分（张三 92）
      expect(ws.getRow(2).getCell(1).value).toBe('张三')
      expect(ws.getRow(2).getCell(3).value).toBe(92)
      // 最后一行应该是最低分（赵六 65）
      expect(ws.getRow(5).getCell(1).value).toBe('赵六')
    })

    it('应按总分升序排列', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl,
          sheetName: '对话成绩',
          operations: [{
            type: 'sortRows',
            sortBy: '总分',
            sortOrder: 'asc',
          }],
        })

      expect(res.status).toBe(200)
      const wb = await readResultExcel(res.body.data.downloadUrl)
      const ws = wb.getWorksheet('对话成绩')!
      expect(ws.getRow(2).getCell(1).value).toBe('赵六')
    })
  })

  describe('filterRows - 筛选', () => {
    it('应筛选总分>=80的行', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl,
          sheetName: '对话成绩',
          operations: [{
            type: 'filterRows',
            column: '总分',
            operator: 'gte',
            value: 80,
          }],
        })

      expect(res.status).toBe(200)
      const wb = await readResultExcel(res.body.data.downloadUrl)
      const ws = wb.getWorksheet('对话成绩')!
      // 只剩张三(92)和王五(85)
      const names = getColumnValues(ws, 1)
      expect(names).toContain('张三')
      expect(names).toContain('王五')
      expect(names).not.toContain('李四')
      expect(names).not.toContain('赵六')
    })

    it('应筛选班级包含"1班"的行', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl,
          sheetName: '对话成绩',
          operations: [{
            type: 'filterRows',
            column: '班级',
            operator: 'contains',
            value: '1班',
          }],
        })

      expect(res.status).toBe(200)
      const wb = await readResultExcel(res.body.data.downloadUrl)
      const ws = wb.getWorksheet('对话成绩')!
      const names = getColumnValues(ws, 1)
      expect(names).toEqual(['张三', '李四'])
    })
  })

  describe('addColumn - 新增列', () => {
    it('应根据条件公式新增评级列', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl,
          sheetName: '对话成绩',
          operations: [{
            type: 'addColumn',
            headerName: '评级',
            formula: {
              sourceColumn: '总分',
              rules: [
                { gte: 90, label: '优秀' },
                { gte: 80, label: '良好' },
                { gte: 60, label: '及格' },
              ],
              default: '不及格',
            },
          }],
        })

      expect(res.status).toBe(200)
      const wb = await readResultExcel(res.body.data.downloadUrl)
      const ws = wb.getWorksheet('对话成绩')!
      const headers = getHeaders(ws)
      expect(headers).toContain('评级')

      const ratingColIdx = headers.indexOf('评级') + 1
      expect(ws.getRow(2).getCell(ratingColIdx).value).toBe('优秀')  // 张三 92
      expect(ws.getRow(3).getCell(ratingColIdx).value).toBe('及格')  // 李四 78
      expect(ws.getRow(4).getCell(ratingColIdx).value).toBe('良好')  // 王五 85
      expect(ws.getRow(5).getCell(ratingColIdx).value).toBe('及格')  // 赵六 65
    })

    it('应新增固定值列', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl,
          sheetName: '对话成绩',
          operations: [{
            type: 'addColumn',
            headerName: '学期',
            value: '2026春季',
          }],
        })

      expect(res.status).toBe(200)
      const wb = await readResultExcel(res.body.data.downloadUrl)
      const ws = wb.getWorksheet('对话成绩')!
      const headers = getHeaders(ws)
      const colIdx = headers.indexOf('学期') + 1
      expect(ws.getRow(2).getCell(colIdx).value).toBe('2026春季')
      expect(ws.getRow(5).getCell(colIdx).value).toBe('2026春季')
    })
  })

  describe('replaceValues - 批量替换', () => {
    it('应替换指定列的值', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl,
          sheetName: '对话成绩',
          operations: [{
            type: 'replaceValues',
            column: '班级',
            searchValue: '3年级',
            replaceWith: '三年级',
          }],
        })

      expect(res.status).toBe(200)
      const wb = await readResultExcel(res.body.data.downloadUrl)
      const ws = wb.getWorksheet('对话成绩')!
      expect(ws.getRow(2).getCell(2).value).toBe('三年级1班')
      expect(ws.getRow(4).getCell(2).value).toBe('三年级2班')
    })
  })

  describe('deleteSheet - 删除 Sheet', () => {
    it('应删除指定 Sheet', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl,
          operations: [{
            type: 'deleteSheet',
            targetSheet: '跟读成绩',
          }],
        })

      expect(res.status).toBe(200)
      const wb = await readResultExcel(res.body.data.downloadUrl)
      expect(wb.worksheets.length).toBe(1)
      expect(wb.worksheets[0].name).toBe('对话成绩')
    })
  })

  describe('renameSheet - 重命名 Sheet', () => {
    it('应重命名指定 Sheet', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl,
          operations: [{
            type: 'renameSheet',
            targetSheet: '对话成绩',
            newName: 'Dialogue Scores',
          }],
        })

      expect(res.status).toBe(200)
      const wb = await readResultExcel(res.body.data.downloadUrl)
      const sheetNames = wb.worksheets.map(s => s.name)
      expect(sheetNames).toContain('Dialogue Scores')
      expect(sheetNames).not.toContain('对话成绩')
    })
  })

  describe('mergeSheets - 合并 Sheet', () => {
    it('应合并两个同结构 Sheet', async () => {
      // 创建一个两个 Sheet 表头一致的文件
      const mergeUrl = await createTestExcel('test_merge.xlsx', [
        {
          name: 'Sheet1',
          headers: ['姓名', '分数'],
          rows: [['张三', 90], ['李四', 85]],
        },
        {
          name: 'Sheet2',
          headers: ['姓名', '分数'],
          rows: [['王五', 78], ['赵六', 92]],
        },
      ])

      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl: mergeUrl,
          operations: [{
            type: 'mergeSheets',
            sourceSheets: ['Sheet1', 'Sheet2'],
          }],
        })

      expect(res.status).toBe(200)
      const wb = await readResultExcel(res.body.data.downloadUrl)
      // 合并后只剩一个 Sheet
      expect(wb.worksheets.length).toBe(1)
      const ws = wb.worksheets[0]
      // 应有 4 行数据 + 1 行表头
      const names = getColumnValues(ws, 1)
      expect(names).toContain('张三')
      expect(names).toContain('王五')
      expect(names).toContain('赵六')
      expect(names.length).toBe(4)
    })
  })

  describe('addSummaryRow - 汇总行', () => {
    it('应在末尾添加平均分汇总行', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl,
          sheetName: '对话成绩',
          operations: [{
            type: 'addSummaryRow',
            summaryType: 'avg',
            summaryColumns: ['总分'],
          }],
        })

      expect(res.status).toBe(200)
      const wb = await readResultExcel(res.body.data.downloadUrl)
      const ws = wb.getWorksheet('对话成绩')!
      // 找到汇总行（应该在数据最后）
      let summaryRowIdx = -1
      for (let row = 2; row <= ws.rowCount; row++) {
        if (ws.getRow(row).getCell(1).value === '汇总') {
          summaryRowIdx = row
          break
        }
      }
      expect(summaryRowIdx).toBeGreaterThan(0)
      // 平均分 = (92 + 78 + 85 + 65) / 4 = 80
      const avgCell = ws.getRow(summaryRowIdx).getCell(3).value
      expect(avgCell).toBe(80)
    })
  })

  describe('组合操作', () => {
    it('应按顺序执行多个操作：筛选 + 排序 + 改列名', async () => {
      const res = await request(app)
        .post('/api/internal/export/modify-excel')
        .set(headersWithTeacher(1))
        .send({
          downloadUrl,
          sheetName: '对话成绩',
          operations: [
            { type: 'filterRows', column: '总分', operator: 'gte', value: 80 },
            { type: 'sortRows', sortBy: '总分', sortOrder: 'desc' },
            { type: 'renameColumns', renameMap: { '姓名': 'Name', '总分': 'Score' } },
          ],
        })

      expect(res.status).toBe(200)
      const wb = await readResultExcel(res.body.data.downloadUrl)
      const ws = wb.getWorksheet('对话成绩')!
      const headers = getHeaders(ws)
      expect(headers).toContain('Name')
      expect(headers).toContain('Score')
      // 只剩2行数据，按分数降序
      expect(ws.getRow(2).getCell(1).value).toBe('张三') // 92
      expect(ws.getRow(3).getCell(1).value).toBe('王五') // 85
    })
  })
})
