/**
 * 数据库直接查询路由 — 让 AI 通过 SQL 查询数据
 * 安全限制：
 * 1. 只允许 SELECT
 * 2. 禁止访问敏感字段（password）
 * 3. 白名单表限制
 * 4. 结果行数限制（普通查询 100 行，导出 1000 行）
 * 5. 普通教师自动注入班级权限过滤
 * 6. 支持 exportExcel 模式直接生成 Excel 文件
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

const EXPORT_DIR = path.resolve(process.cwd(), 'tmp/exports')
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true })
}

const router = Router()

// 允许查询的表白名单
const ALLOWED_TABLES = new Set([
  'students', 'classes', 'class_teachers', 'teachers',
  'practice_records', 'read_aloud_records', 'word_game_records',
  'scenes', 'read_aloud_scenes', 'word_packs', 'words',
])

// 禁止出现的关键字（防止写操作和危险操作）
const FORBIDDEN_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
  'TRUNCATE', 'REPLACE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE',
  'CALL', 'INTO OUTFILE', 'INTO DUMPFILE', 'LOAD_FILE',
  'SLEEP(', 'BENCHMARK(', 'PASSWORD',
]

// 敏感字段（不允许出现在查询中）
const SENSITIVE_FIELDS = ['password']

/**
 * POST /api/internal/query-db — 执行只读 SQL 查询
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { sql, explanation, exportExcel, exportTitle } = req.body
  const maxRows = exportExcel ? 1000 : 100

  if (!sql || typeof sql !== 'string') {
    return res.status(400).json({ success: false, message: 'sql 参数必填' })
  }

  const trimmedSql = sql.trim()

  // 1. 必须以 SELECT 开头
  if (!/^SELECT\s/i.test(trimmedSql)) {
    return res.status(403).json({ success: false, message: '只允许 SELECT 查询' })
  }

  // 2. 检查禁止关键字（用单词边界匹配，避免 created_at 被 CREATE 误匹配）
  const upperSql = trimmedSql.toUpperCase()
  for (const keyword of FORBIDDEN_KEYWORDS) {
    // 含特殊字符的关键字（如 SLEEP(、INTO OUTFILE）用 includes，其余用单词边界正则
    const hasSpecialChar = /[^A-Z]/.test(keyword)
    const matched = hasSpecialChar
      ? upperSql.includes(keyword)
      : new RegExp(`\\b${keyword}\\b`).test(upperSql)
    if (matched) {
      return res.status(403).json({ success: false, message: `禁止使用关键字: ${keyword}` })
    }
  }

  // 3. 检查敏感字段
  for (const field of SENSITIVE_FIELDS) {
    if (trimmedSql.toLowerCase().includes(field)) {
      return res.status(403).json({ success: false, message: `禁止查询敏感字段: ${field}` })
    }
  }

  // 4. 提取并验证表名（简单正则，覆盖 FROM / JOIN）
  const tablePattern = /(?:FROM|JOIN)\s+`?(\w+)`?/gi
  let match: RegExpExecArray | null
  const usedTables: string[] = []
  while ((match = tablePattern.exec(trimmedSql)) !== null) {
    const table = match[1].toLowerCase()
    if (!ALLOWED_TABLES.has(table)) {
      return res.status(403).json({ success: false, message: `不允许查询表: ${table}` })
    }
    usedTables.push(table)
  }

  if (usedTables.length === 0) {
    return res.status(400).json({ success: false, message: '无法识别查询的表，请检查 SQL 语法' })
  }

  // 5. 权限检查：普通教师只能查所属班级数据
  const teacherIdStr = req.headers['x-teacher-id'] as string
  let allowedStudentIds: Set<number> | null = null // null 表示不限制（管理员）
  let allowedClassIds: Set<number> | null = null

  if (teacherIdStr) {
    const teacherId = parseInt(teacherIdStr)
    if (!isNaN(teacherId)) {
      const teacher = await prisma.teacher.findUnique({
        where: { id: teacherId },
        select: { isAdmin: true },
      })

      if (teacher && !teacher.isAdmin) {
        const teacherClasses = await prisma.classTeacher.findMany({
          where: { teacherId },
          select: { classId: true },
        })
        const classIds = teacherClasses.map(tc => tc.classId)

        if (classIds.length === 0) {
          return res.status(403).json({ success: false, message: '您当前没有负责的班级，无法查询' })
        }

        allowedClassIds = new Set(classIds)

        // 获取允许的学生 ID
        const allowedStudents = await prisma.student.findMany({
          where: { classId: { in: classIds } },
          select: { id: true },
        })
        allowedStudentIds = new Set(allowedStudents.map(s => s.id))

        if (allowedStudentIds.size === 0) {
          return res.json({ success: true, data: { rows: [], rowCount: 0, truncated: false } })
        }
      }
    }
  }

  // 6. 构建最终 SQL：普通教师通过替换表名为带 WHERE 的子查询来注入权限
  let finalSql = trimmedSql.replace(/;?\s*$/, '') // 去掉末尾分号

  if (allowedStudentIds !== null && allowedClassIds !== null) {
    const classIdList = [...allowedClassIds].join(',')
    const studentIdList = [...allowedStudentIds].join(',')

    // 替换 students 表为带 class_id 过滤的子查询，保留别名
    // 匹配: FROM students / JOIN students / FROM students s / JOIN students AS s
    finalSql = finalSql.replace(
      /\b(FROM|JOIN)\s+students\b(\s+(?:AS\s+)?(\w+))?/gi,
      (_, keyword, aliasPart, alias) => {
        const subquery = `(SELECT * FROM students WHERE class_id IN (${classIdList}))`
        const finalAlias = alias || 'students'
        return `${keyword} ${subquery} ${finalAlias}`
      }
    )

    // 替换成绩表为带 student_id 过滤的子查询
    const recordTables = ['practice_records', 'read_aloud_records', 'word_game_records']
    for (const table of recordTables) {
      if (usedTables.includes(table)) {
        finalSql = finalSql.replace(
          new RegExp(`\\b(FROM|JOIN)\\s+${table}\\b(\\s+(?:AS\\s+)?(\\w+))?`, 'gi'),
          (_, keyword, aliasPart, alias) => {
            const subquery = `(SELECT * FROM ${table} WHERE student_id IN (${studentIdList}))`
            const finalAlias = alias || table
            return `${keyword} ${subquery} ${finalAlias}`
          }
        )
      }
    }

    // classes 表也加过滤
    if (usedTables.includes('classes')) {
      finalSql = finalSql.replace(
        /\b(FROM|JOIN)\s+classes\b(\s+(?:AS\s+)?(\w+))?/gi,
        (_, keyword, aliasPart, alias) => {
          const subquery = `(SELECT * FROM classes WHERE id IN (${classIdList}))`
          const finalAlias = alias || 'classes'
          return `${keyword} ${subquery} ${finalAlias}`
        }
      )
    }
  }

  // 确保有 LIMIT
  if (!/LIMIT\s+\d+/i.test(finalSql)) {
    finalSql += ` LIMIT ${maxRows}`
  } else {
    finalSql = finalSql.replace(/LIMIT\s+(\d+)/i, (_, n) => `LIMIT ${Math.min(parseInt(n), maxRows)}`)
  }

  // 7. 执行查询
  logger.info({ sql: finalSql, originalSql: trimmedSql, explanation, teacherId: teacherIdStr }, '[QueryDB] Executing')

  try {
    const rows: any[] = await prisma.$queryRawUnsafe(finalSql)

    // 处理 BigInt 序列化
    const serialized: any[] = JSON.parse(JSON.stringify(rows, (_, v) =>
      typeof v === 'bigint' ? Number(v) : v
    ))

    logger.info({ rowCount: serialized.length, exportExcel, explanation }, '[QueryDB] Success')

    // 导出 Excel 模式
    if (exportExcel && serialized.length === 0) {
      return res.json({
        success: true,
        data: { rows: [], rowCount: 0, truncated: false, message: '查询结果为空，没有数据可以导出' },
      })
    }
    if (exportExcel && serialized.length > 0) {
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Echo Kid AI 助手'
      workbook.created = new Date()

      const sheetName = (exportTitle || '查询结果').slice(0, 31) // Excel sheet 名最长 31 字符
      const sheet = workbook.addWorksheet(sheetName)

      // 从第一行数据推断列
      const headers = Object.keys(serialized[0])
      sheet.columns = headers.map(h => ({ header: h, key: h, width: Math.max(h.length * 2 + 4, 12) }))
      sheet.getRow(1).font = { bold: true }
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } }

      for (const row of serialized) {
        sheet.addRow(row)
      }

      const filename = `${exportTitle || '查询结果'}_${crypto.randomBytes(4).toString('hex')}.xlsx`
      const filepath = path.join(EXPORT_DIR, filename)
      await workbook.xlsx.writeFile(filepath)

      const downloadUrl = `/api/internal/export/download/${encodeURIComponent(filename)}`
      return res.json({
        success: true,
        data: {
          downloadUrl,
          filename,
          message: `已导出 ${serialized.length} 行数据为 Excel，链接 30 分钟内有效`,
        },
      })
    }

    // 普通查询模式
    const truncated = serialized.length >= maxRows

    res.json({
      success: true,
      data: { rows: serialized, rowCount: serialized.length, truncated },
    })
  } catch (err: any) {
    logger.warn({ error: err.message, sql: finalSql }, '[QueryDB] Query failed')
    res.status(400).json({
      success: false,
      message: `SQL 执行失败: ${err.message?.replace(/[\r\n]+/g, ' ').slice(0, 200)}`,
    })
  }
}))

export default router
