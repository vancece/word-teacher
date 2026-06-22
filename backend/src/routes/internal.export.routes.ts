/**
 * 通用 Excel 导出路由
 * 支持两种模式：
 * 1. 查询模式（source + params）：后端直接查询数据生成 Excel
 * 2. 数据模式（title + sheets）：AI 传入数据直接生成 Excel
 */
import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { prisma } from '../config/database.js'
import { logger } from '../utils/logger.js'
import ExcelJS from 'exceljs'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import type { Request, Response } from 'express'

const router = Router()

const EXPORT_DIR = path.resolve(process.cwd(), 'tmp/exports')
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true })
}

const FILE_EXPIRY_MS = 30 * 60 * 1000

/**
 * POST /api/internal/export/excel - 通用 Excel 导出
 */
router.post('/excel', asyncHandler(async (req: Request, res: Response) => {
  const { source, params, title, sheets } = req.body

  let workbook: ExcelJS.Workbook
  let filename: string
  let message: string

  if (source) {
    // 查询模式
    const result = await handleQueryMode(source, params || {}, req)
    workbook = result.workbook
    filename = result.filename
    message = result.message
  } else if (sheets && Array.isArray(sheets)) {
    // 数据模式
    const result = handleDataMode(title || '导出数据', sheets)
    workbook = result.workbook
    filename = result.filename
    message = result.message
  } else {
    return res.status(400).json({ success: false, message: '请指定 source（查询模式）或 sheets（数据模式）' })
  }

  // 写入文件
  const filepath = path.join(EXPORT_DIR, filename)
  await workbook.xlsx.writeFile(filepath)
  logger.info({ filename, source }, '[Export] Excel generated')

  const downloadUrl = `/api/internal/export/download/${encodeURIComponent(filename)}`
  res.json({ success: true, data: { downloadUrl, filename, message } })
}))

/**
 * 数据模式：AI 直接传 sheets 数据
 */
function handleDataMode(title: string, sheets: Array<{ name: string; headers: string[]; rows: any[][] }>) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Echo Kid AI 助手'
  workbook.created = new Date()

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name)
    ws.columns = sheet.headers.map(h => ({ header: h, key: h, width: Math.max(h.length * 2 + 4, 10) }))
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }

    for (const row of sheet.rows) {
      const rowData: Record<string, any> = {}
      sheet.headers.forEach((h, i) => { rowData[h] = row[i] ?? '' })
      ws.addRow(rowData)
    }
  }

  const filename = `${title}_${crypto.randomBytes(4).toString('hex')}.xlsx`
  return { workbook, filename, message: `已生成"${title}"Excel 文件，链接 30 分钟内有效` }
}

/**
 * 查询模式：根据 source 类型查询数据并生成 Excel
 */
async function handleQueryMode(source: string, params: any, req: Request) {
  switch (source) {
    case 'studentScores':
      return await exportStudentScores(params, req)
    default:
      throw Object.assign(new Error(`不支持的 source: ${source}`), { statusCode: 400 })
  }
}

/**
 * 学生成绩导出（source: studentScores）
 */
async function exportStudentScores(params: any, req: Request) {
  const { classId, type, startDate, endDate } = params
  const teacherIdStr = req.headers['x-teacher-id'] as string
  const teacherId = teacherIdStr ? parseInt(teacherIdStr) : null

  // 确定导出范围
  let classIds: number[] = []
  let exportLabel = ''

  if (classId) {
    const classInfo = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, name: true },
    })
    if (!classInfo) {
      throw Object.assign(new Error('班级不存在'), { statusCode: 404 })
    }

    if (teacherId && !isNaN(teacherId)) {
      const teacher = await prisma.teacher.findUnique({
        where: { id: teacherId },
        select: { isAdmin: true },
      })
      if (teacher && !teacher.isAdmin) {
        const hasAccess = await prisma.classTeacher.findFirst({
          where: { classId, teacherId },
        })
        if (!hasAccess) {
          throw Object.assign(new Error('无权导出该班级数据'), { statusCode: 403 })
        }
      }
    }

    classIds = [classId]
    exportLabel = classInfo.name
  } else {
    let isAdmin = true
    if (teacherId && !isNaN(teacherId)) {
      const teacher = await prisma.teacher.findUnique({
        where: { id: teacherId },
        select: { isAdmin: true },
      })
      if (teacher && !teacher.isAdmin) isAdmin = false
    }

    if (isAdmin) {
      const allClasses = await prisma.class.findMany({ select: { id: true } })
      classIds = allClasses.map(c => c.id)
      exportLabel = '全部班级'
    } else {
      const teacherClasses = await prisma.classTeacher.findMany({
        where: { teacherId: teacherId! },
        select: { classId: true },
      })
      classIds = teacherClasses.map(tc => tc.classId)
      if (classIds.length === 0) {
        throw Object.assign(new Error('您当前没有负责的班级'), { statusCode: 400 })
      }
      exportLabel = '所属班级'
    }
  }

  // 查学生
  const students = await prisma.student.findMany({
    where: { classId: { in: classIds } },
    select: { id: true, name: true, studentNo: true, seatNo: true, class: { select: { name: true } } },
    orderBy: [{ classId: 'asc' }, { seatNo: 'asc' }, { name: 'asc' }],
  })

  if (students.length === 0) {
    throw Object.assign(new Error('导出范围内暂无学生'), { statusCode: 400 })
  }

  const studentIds = students.map(s => s.id)
  const multiClass = classIds.length > 1

  // 日期条件
  const dateCondition: any = {}
  if (startDate) dateCondition.gte = new Date(startDate)
  if (endDate) {
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    dateCondition.lte = end
  }
  const createdAtFilter = Object.keys(dateCondition).length > 0 ? { createdAt: dateCondition } : {}

  // 创建 Excel
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Echo Kid AI 助手'
  workbook.created = new Date()

  const exportType = type || 'all'
  const periodLabel = startDate ? `${startDate}${endDate ? ' ~ ' + endDate : ' ~ 至今'}` : '全部'

  // 对话成绩
  if (exportType === 'all' || exportType === 'dialogue') {
    const records = await prisma.practiceRecord.findMany({
      where: { studentId: { in: studentIds }, status: 'COMPLETED', ...createdAtFilter },
      select: {
        studentId: true, totalScore: true, pronunciationScore: true,
        fluencyScore: true, grammarScore: true, roundsCompleted: true,
        durationSeconds: true, createdAt: true,
        scene: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const sheet = workbook.addWorksheet('对话练习成绩')
    const cols: any[] = []
    if (multiClass) cols.push({ header: '班级', key: 'className', width: 12 })
    cols.push(
      { header: '学号', key: 'studentNo', width: 12 },
      { header: '姓名', key: 'name', width: 10 },
      { header: '场景', key: 'scene', width: 18 },
      { header: '总分', key: 'totalScore', width: 8 },
      { header: '发音', key: 'pronunciation', width: 8 },
      { header: '流利', key: 'fluency', width: 8 },
      { header: '语法', key: 'grammar', width: 8 },
      { header: '对话轮次', key: 'rounds', width: 10 },
      { header: '用时(秒)', key: 'duration', width: 10 },
      { header: '日期', key: 'date', width: 16 },
    )
    sheet.columns = cols
    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }

    for (const record of records) {
      const student = students.find(s => s.id === record.studentId)
      const row: any = {
        studentNo: student?.studentNo || '',
        name: student?.name || '',
        scene: record.scene?.name || '',
        totalScore: record.totalScore,
        pronunciation: record.pronunciationScore,
        fluency: record.fluencyScore,
        grammar: record.grammarScore,
        rounds: record.roundsCompleted,
        duration: record.durationSeconds,
        date: new Date(record.createdAt).toLocaleString('zh-CN'),
      }
      if (multiClass) row.className = student?.class?.name || ''
      sheet.addRow(row)
    }

    if (records.length > 0) {
      sheet.addRow({})
      const summaryRow = sheet.addRow({
        studentNo: '汇总',
        name: `共 ${records.length} 条`,
        totalScore: Math.round(records.reduce((s, r) => s + (r.totalScore || 0), 0) / records.length * 10) / 10,
      })
      summaryRow.font = { bold: true }
    }
  }

  // 跟读成绩
  if (exportType === 'all' || exportType === 'readAloud') {
    const records = await prisma.readAloudRecord.findMany({
      where: { studentId: { in: studentIds }, status: 'COMPLETED', ...createdAtFilter },
      select: {
        studentId: true, totalScore: true, intonationScore: true,
        fluencyScore: true, accuracyScore: true, expressionScore: true,
        completedCount: true, totalCount: true, durationSeconds: true, createdAt: true,
        scene: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const sheet = workbook.addWorksheet('跟读练习成绩')
    const cols: any[] = []
    if (multiClass) cols.push({ header: '班级', key: 'className', width: 12 })
    cols.push(
      { header: '学号', key: 'studentNo', width: 12 },
      { header: '姓名', key: 'name', width: 10 },
      { header: '场景', key: 'scene', width: 18 },
      { header: '总分', key: 'totalScore', width: 8 },
      { header: '语调', key: 'intonation', width: 8 },
      { header: '流利', key: 'fluency', width: 8 },
      { header: '准确', key: 'accuracy', width: 8 },
      { header: '表现力', key: 'expression', width: 8 },
      { header: '完成句数', key: 'progress', width: 10 },
      { header: '用时(秒)', key: 'duration', width: 10 },
      { header: '日期', key: 'date', width: 16 },
    )
    sheet.columns = cols
    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } }

    for (const record of records) {
      const student = students.find(s => s.id === record.studentId)
      const row: any = {
        studentNo: student?.studentNo || '',
        name: student?.name || '',
        scene: record.scene?.name || '',
        totalScore: record.totalScore,
        intonation: record.intonationScore,
        fluency: record.fluencyScore,
        accuracy: record.accuracyScore,
        expression: record.expressionScore,
        progress: `${record.completedCount}/${record.totalCount}`,
        duration: record.durationSeconds,
        date: new Date(record.createdAt).toLocaleString('zh-CN'),
      }
      if (multiClass) row.className = student?.class?.name || ''
      sheet.addRow(row)
    }

    if (records.length > 0) {
      sheet.addRow({})
      const summaryRow = sheet.addRow({
        studentNo: '汇总',
        name: `共 ${records.length} 条`,
        totalScore: Math.round(records.reduce((s, r) => s + (r.totalScore || 0), 0) / records.length * 10) / 10,
      })
      summaryRow.font = { bold: true }
    }
  }

  // 游戏成绩
  if (exportType === 'all' || exportType === 'game') {
    const records = await prisma.wordGameRecord.findMany({
      where: { studentId: { in: studentIds }, ...createdAtFilter },
      select: {
        studentId: true, gameType: true, score: true,
        packName: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const sheet = workbook.addWorksheet('游戏成绩')
    const cols: any[] = []
    if (multiClass) cols.push({ header: '班级', key: 'className', width: 12 })
    cols.push(
      { header: '学号', key: 'studentNo', width: 12 },
      { header: '姓名', key: 'name', width: 10 },
      { header: '游戏类型', key: 'gameType', width: 12 },
      { header: '词包', key: 'packName', width: 16 },
      { header: '得分', key: 'score', width: 8 },
      { header: '日期', key: 'date', width: 16 },
    )
    sheet.columns = cols
    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } }

    const gameTypeMap: Record<string, string> = {
      shooter: '保卫城堡', match: '魔法配对', spell: '美食餐车', miner: '黄金矿工',
    }

    for (const record of records) {
      const student = students.find(s => s.id === record.studentId)
      const row: any = {
        studentNo: student?.studentNo || '',
        name: student?.name || '',
        gameType: gameTypeMap[record.gameType] || record.gameType,
        packName: record.packName,
        score: record.score,
        date: new Date(record.createdAt).toLocaleString('zh-CN'),
      }
      if (multiClass) row.className = student?.class?.name || ''
      sheet.addRow(row)
    }

    if (records.length > 0) {
      sheet.addRow({})
      const summaryRow = sheet.addRow({
        studentNo: '汇总',
        name: `共 ${records.length} 条`,
        score: Math.round(records.reduce((s, r) => s + r.score, 0) / records.length * 10) / 10,
      })
      summaryRow.font = { bold: true }
    }
  }

  // 学生汇总表
  if (exportType === 'all') {
    const sheet = workbook.addWorksheet('学生成绩汇总')
    const cols: any[] = []
    if (multiClass) cols.push({ header: '班级', key: 'className', width: 12 })
    cols.push(
      { header: '学号', key: 'studentNo', width: 12 },
      { header: '姓名', key: 'name', width: 10 },
      { header: '座号', key: 'seatNo', width: 6 },
      { header: '对话次数', key: 'dialogueCount', width: 10 },
      { header: '对话均分', key: 'dialogueAvg', width: 10 },
      { header: '跟读次数', key: 'readAloudCount', width: 10 },
      { header: '跟读均分', key: 'readAloudAvg', width: 10 },
      { header: '游戏次数', key: 'gameCount', width: 10 },
      { header: '游戏均分', key: 'gameAvg', width: 10 },
    )
    sheet.columns = cols
    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E5F5' } }

    for (const student of students) {
      const [dRecords, rRecords, gRecords] = await Promise.all([
        prisma.practiceRecord.findMany({
          where: { studentId: student.id, status: 'COMPLETED', ...createdAtFilter },
          select: { totalScore: true },
        }),
        prisma.readAloudRecord.findMany({
          where: { studentId: student.id, status: 'COMPLETED', ...createdAtFilter },
          select: { totalScore: true },
        }),
        prisma.wordGameRecord.findMany({
          where: { studentId: student.id, ...createdAtFilter },
          select: { score: true },
        }),
      ])

      const dScores = dRecords.map(r => r.totalScore || 0).filter(s => s > 0)
      const rScores = rRecords.map(r => r.totalScore || 0).filter(s => s > 0)
      const gScores = gRecords.map(r => r.score)

      const row: any = {
        studentNo: student.studentNo,
        name: student.name,
        seatNo: student.seatNo,
        dialogueCount: dRecords.length,
        dialogueAvg: dScores.length > 0 ? Math.round(dScores.reduce((a, b) => a + b, 0) / dScores.length * 10) / 10 : '-',
        readAloudCount: rRecords.length,
        readAloudAvg: rScores.length > 0 ? Math.round(rScores.reduce((a, b) => a + b, 0) / rScores.length * 10) / 10 : '-',
        gameCount: gRecords.length,
        gameAvg: gScores.length > 0 ? Math.round(gScores.reduce((a, b) => a + b, 0) / gScores.length * 10) / 10 : '-',
      }
      if (multiClass) row.className = student?.class?.name || ''
      sheet.addRow(row)
    }
  }

  const filename = `${exportLabel}_成绩_${crypto.randomBytes(4).toString('hex')}.xlsx`
  const message = `已生成 ${exportLabel} 的成绩报表（${periodLabel}），链接 30 分钟内有效`

  return { workbook, filename, message }
}

/**
 * GET /api/internal/export/download/:filename - 下载导出文件
 */
router.get('/download/:filename', asyncHandler(async (req, res) => {
  const filename = decodeURIComponent(req.params.filename as string)

  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ success: false, message: '无效文件名' })
  }

  const filepath = path.join(EXPORT_DIR, filename)

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ success: false, message: '文件不存在或已过期' })
  }

  const stat = fs.statSync(filepath)
  if (Date.now() - stat.mtimeMs > FILE_EXPIRY_MS) {
    fs.unlinkSync(filepath)
    return res.status(410).json({ success: false, message: '文件已过期，请重新导出' })
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)

  const stream = fs.createReadStream(filepath)
  stream.pipe(res)

  stream.on('end', () => {
    setTimeout(() => {
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath)
    }, 5000)
  })
}))

// 定期清理过期文件（每 10 分钟）
setInterval(() => {
  try {
    if (!fs.existsSync(EXPORT_DIR)) return
    const files = fs.readdirSync(EXPORT_DIR)
    for (const file of files) {
      const filepath = path.join(EXPORT_DIR, file)
      const stat = fs.statSync(filepath)
      if (Date.now() - stat.mtimeMs > FILE_EXPIRY_MS) {
        fs.unlinkSync(filepath)
        logger.info({ file }, '[Export] Cleaned expired file')
      }
    }
  } catch (err) {
    logger.error({ err }, '[Export] Cleanup error')
  }
}, 10 * 60 * 1000)

export default router
