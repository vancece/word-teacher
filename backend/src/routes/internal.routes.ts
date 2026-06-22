/**
 * 内部 API 路由 — 供 Agent 服务回调使用
 * 认证方式：x-agent-api-key header（与 AGENT_API_KEY 匹配）
 * 不走教师 JWT 认证，但拥有管理员级别的数据访问权限
 */
import { Router, type Request, type Response, type NextFunction } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { prisma } from '../config/database.js'
import { env } from '../config/env.js'
import { knowledgeVectorService } from '../services/knowledge-vector.service.js'
import { logger } from '../utils/logger.js'
import bcrypt from 'bcryptjs'
import exportRoutes from './internal.export.routes.js'
import queryDbRoutes from './internal.query-db.routes.js'

const router = Router()

/**
 * Agent API Key 认证中间件
 * 同时解析 x-teacher-id header 用于权限过滤
 */
function authenticateAgent(req: Request, res: Response, next: NextFunction) {
  // 开发环境 + 无 key 配置时放行
  if (env.isDev && !env.agent.apiKey) {
    return next()
  }

  const apiKey = req.headers['x-agent-api-key'] as string || req.headers['x-internal-call'] as string

  if (!apiKey || apiKey !== env.agent.apiKey) {
    if (env.isDev && req.headers['x-internal-call'] === 'true') {
      return next()
    }
    return res.status(401).json({ success: false, message: 'Unauthorized: invalid agent api key' })
  }

  next()
}

router.use(authenticateAgent)

// 挂载子路由
router.use('/export', exportRoutes)
router.use('/query-db', queryDbRoutes)

/**
 * 根据 x-teacher-id 获取该教师可访问的学生 ID 列表
 * 管理员返回 undefined（不限制），普通教师返回其班级学生 ID
 */
async function getAllowedStudentIds(req: Request): Promise<number[] | undefined> {
  const teacherIdStr = req.headers['x-teacher-id'] as string
  if (!teacherIdStr) return undefined // 无 teacherId = 不限制（兜底）

  const teacherId = parseInt(teacherIdStr)
  if (isNaN(teacherId)) return undefined

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { isAdmin: true },
  })

  // 管理员不限制
  if (!teacher || teacher.isAdmin) return undefined

  // 普通教师：只能看自己负责的班级的学生
  const teacherClasses = await prisma.classTeacher.findMany({
    where: { teacherId },
    select: { classId: true },
  })
  const classIds = teacherClasses.map(tc => tc.classId)
  if (classIds.length === 0) return []

  const students = await prisma.student.findMany({
    where: { classId: { in: classIds } },
    select: { id: true },
  })
  return students.map(s => s.id)
}

// GET /api/internal/knowledge/search - 知识库向量搜索
router.get('/knowledge/search', asyncHandler(async (req, res) => {
  const query = req.query.query as string || ''

  const results = await searchKnowledge(query)
  res.json({ success: true, data: results })
}))

// GET /api/internal/students - 学生列表查询
router.get('/students', asyncHandler(async (req, res) => {
  const search = req.query.search as string | undefined
  const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50)

  const allowedIds = await getAllowedStudentIds(req)

  const where: any = {}
  if (classId) where.classId = classId
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { studentNo: { contains: search } },
    ]
  }
  // 权限过滤
  if (allowedIds !== undefined) {
    if (allowedIds.length === 0) {
      return res.json({ success: true, data: [] })
    }
    where.id = { in: allowedIds }
  }

  const students = await prisma.student.findMany({
    where,
    select: {
      id: true,
      name: true,
      studentNo: true,
      seatNo: true,
      class: { select: { id: true, name: true } },
    },
    take: limit,
    orderBy: { name: 'asc' },
  })

  res.json({ success: true, data: students })
}))

// GET /api/internal/students/:id - 学生详情（含最近记录）
router.get('/students/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string)

  const student = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      studentNo: true,
      seatNo: true,
      class: { select: { id: true, name: true } },
    },
  })

  if (!student) {
    return res.status(404).json({ success: false, message: '学生不存在' })
  }

  // 最近 5 条对话记录
  const recentDialogues = await prisma.practiceRecord.findMany({
    where: { studentId: id },
    select: {
      id: true, totalScore: true, status: true, createdAt: true,
      scene: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  // 最近 5 条跟读记录
  const recentReadAlouds = await prisma.readAloudRecord.findMany({
    where: { studentId: id },
    select: {
      id: true, totalScore: true, status: true, createdAt: true,
      scene: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  // 最近 5 条游戏记录
  const recentGames = await prisma.wordGameRecord.findMany({
    where: { studentId: id },
    select: {
      id: true, gameType: true, score: true, packName: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  res.json({
    success: true,
    data: {
      ...student,
      recentDialogues,
      recentReadAlouds,
      recentGames,
    },
  })
}))

// GET /api/internal/classes - 班级列表
router.get('/classes', asyncHandler(async (req, res) => {
  const classes = await prisma.class.findMany({
    select: {
      id: true,
      name: true,
      grade: true,
      _count: { select: { students: true } },
      teachers: {
        select: { teacher: { select: { id: true, name: true } } },
      },
    },
    orderBy: { name: 'asc' },
  })

  const formatted = classes.map(c => ({
    id: c.id,
    name: c.name,
    grade: c.grade,
    studentCount: c._count.students,
    teachers: c.teachers.map(t => t.teacher),
  }))

  res.json({ success: true, data: formatted })
}))

// GET /api/internal/learning-records - 学习记录（支持日期范围）
router.get('/learning-records', asyncHandler(async (req, res) => {
  const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined
  const search = req.query.search as string | undefined
  const type = req.query.type as string | undefined
  const startDate = req.query.startDate as string | undefined
  const endDate = req.query.endDate as string | undefined
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50)

  const allowedIds = await getAllowedStudentIds(req)

  // 日期条件
  const dateCondition: any = {}
  if (startDate) dateCondition.gte = new Date(startDate)
  if (endDate) {
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    dateCondition.lte = end
  }
  const createdAtFilter = Object.keys(dateCondition).length > 0 ? { createdAt: dateCondition } : {}

  // 筛选学生
  let studentIds: number[] | undefined = allowedIds
  if (classId || search) {
    const studentWhere: any = {}
    if (classId) studentWhere.classId = classId
    if (search) {
      studentWhere.OR = [
        { name: { contains: search } },
        { studentNo: { contains: search } },
      ]
    }
    if (allowedIds !== undefined) {
      if (allowedIds.length === 0) {
        return res.json({ success: true, data: { records: [], total: 0 } })
      }
      studentWhere.id = { in: allowedIds }
    }
    const students = await prisma.student.findMany({
      where: studentWhere,
      select: { id: true },
    })
    studentIds = students.map(s => s.id)
    if (studentIds.length === 0) {
      return res.json({ success: true, data: { records: [], total: 0 } })
    }
  }

  const studentCondition = studentIds ? { studentId: { in: studentIds } } : {}
  const baseWhere = { ...studentCondition, ...createdAtFilter }

  const records: any[] = []

  if (!type || type === 'dialogue') {
    const dialogues = await prisma.practiceRecord.findMany({
      where: baseWhere,
      select: {
        id: true, totalScore: true, status: true, createdAt: true, roundsCompleted: true,
        student: { select: { name: true, studentNo: true } },
        scene: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    records.push(...dialogues.map(r => ({
      type: 'dialogue', id: r.id, score: r.totalScore, status: r.status,
      studentName: r.student.name, sceneName: r.scene?.name || '未知',
      rounds: r.roundsCompleted, createdAt: r.createdAt,
    })))
  }

  if (!type || type === 'readAloud') {
    const readAlouds = await prisma.readAloudRecord.findMany({
      where: baseWhere,
      select: {
        id: true, totalScore: true, status: true, createdAt: true,
        completedCount: true, totalCount: true,
        student: { select: { name: true, studentNo: true } },
        scene: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    records.push(...readAlouds.map(r => ({
      type: 'readAloud', id: r.id, score: r.totalScore, status: r.status,
      studentName: r.student.name, sceneName: r.scene?.name || '未知',
      progress: `${r.completedCount}/${r.totalCount}`, createdAt: r.createdAt,
    })))
  }

  if (type === 'game') {
    const games = await prisma.wordGameRecord.findMany({
      where: baseWhere,
      select: {
        id: true, gameType: true, score: true, packName: true, createdAt: true,
        student: { select: { name: true, studentNo: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    records.push(...games.map(r => ({
      type: 'game', id: r.id, score: r.score, gameType: r.gameType,
      studentName: r.student.name, packName: r.packName, createdAt: r.createdAt,
    })))
  }

  // 按时间排序
  records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  res.json({ success: true, data: { records: records.slice(0, limit), total: records.length } })
}))

// GET /api/internal/progress/overview - 进步概览
router.get('/progress/overview', asyncHandler(async (req, res) => {
  const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined
  const days = parseInt(req.query.days as string) || 7
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  let studentIds: number[] | undefined
  if (classId) {
    const students = await prisma.student.findMany({
      where: { classId },
      select: { id: true },
    })
    studentIds = students.map(s => s.id)
  }

  const studentCondition = studentIds ? { studentId: { in: studentIds } } : {}

  // 近 N 天的练习统计
  const [dialogueCount, readAloudCount, gameCount] = await Promise.all([
    prisma.practiceRecord.count({ where: { ...studentCondition, createdAt: { gte: since } } }),
    prisma.readAloudRecord.count({ where: { ...studentCondition, createdAt: { gte: since } } }),
    prisma.wordGameRecord.count({ where: { ...studentCondition, createdAt: { gte: since } } }),
  ])

  // 平均分
  const [dialogueAvg, readAloudAvg] = await Promise.all([
    prisma.practiceRecord.aggregate({
      where: { ...studentCondition, createdAt: { gte: since }, status: 'COMPLETED' },
      _avg: { totalScore: true },
    }),
    prisma.readAloudRecord.aggregate({
      where: { ...studentCondition, createdAt: { gte: since }, status: 'COMPLETED' },
      _avg: { totalScore: true },
    }),
  ])

  // 最活跃学生 Top 5
  const topStudents = await prisma.student.findMany({
    where: studentIds ? { id: { in: studentIds } } : {},
    select: {
      id: true, name: true,
      _count: {
        select: {
          practiceRecords: { where: { createdAt: { gte: since } } },
          readAloudRecords: { where: { createdAt: { gte: since } } },
        },
      },
    },
    orderBy: { practiceRecords: { _count: 'desc' } },
    take: 5,
  })

  res.json({
    success: true,
    data: {
      period: `近${days}天`,
      totalPractices: dialogueCount + readAloudCount + gameCount,
      dialogueCount,
      readAloudCount,
      gameCount,
      avgDialogueScore: dialogueAvg._avg.totalScore ? Math.round(dialogueAvg._avg.totalScore * 10) / 10 : null,
      avgReadAloudScore: readAloudAvg._avg.totalScore ? Math.round(readAloudAvg._avg.totalScore * 10) / 10 : null,
      topStudents: topStudents.map(s => ({
        id: s.id,
        name: s.name,
        practiceCount: s._count.practiceRecords + s._count.readAloudRecords,
      })),
    },
  })
}))

// GET /api/internal/progress/student/:id - 学生进步详情
router.get('/progress/student/:id', asyncHandler(async (req, res) => {
  const studentId = parseInt(req.params.id as string)
  const days = parseInt(req.query.days as string) || 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, studentNo: true, class: { select: { name: true } } },
  })

  if (!student) {
    return res.status(404).json({ success: false, message: '学生不存在' })
  }

  // 近 N 天的对话成绩
  const dialogues = await prisma.practiceRecord.findMany({
    where: { studentId, createdAt: { gte: since }, status: 'COMPLETED' },
    select: { totalScore: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  // 近 N 天的跟读成绩
  const readAlouds = await prisma.readAloudRecord.findMany({
    where: { studentId, createdAt: { gte: since }, status: 'COMPLETED' },
    select: { totalScore: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  // 计算趋势
  const avgScore = (records: { totalScore: number | null }[]) => {
    const valid = records.filter(r => r.totalScore != null)
    if (valid.length === 0) return null
    return Math.round(valid.reduce((sum, r) => sum + (r.totalScore || 0), 0) / valid.length * 10) / 10
  }

  res.json({
    success: true,
    data: {
      student,
      period: `近${days}天`,
      dialogue: {
        count: dialogues.length,
        avgScore: avgScore(dialogues),
        scores: dialogues.map(d => ({ score: d.totalScore, date: d.createdAt })),
      },
      readAloud: {
        count: readAlouds.length,
        avgScore: avgScore(readAlouds),
        scores: readAlouds.map(r => ({ score: r.totalScore, date: r.createdAt })),
      },
    },
  })
}))

// GET /api/internal/stats - 平台整体统计
router.get('/stats', asyncHandler(async (req, res) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [studentCount, teacherCount, classCount, todayDialogues, todayReadAlouds, todayGames] = await Promise.all([
    prisma.student.count(),
    prisma.teacher.count(),
    prisma.class.count(),
    prisma.practiceRecord.count({ where: { createdAt: { gte: today } } }),
    prisma.readAloudRecord.count({ where: { createdAt: { gte: today } } }),
    prisma.wordGameRecord.count({ where: { createdAt: { gte: today } } }),
  ])

  res.json({
    success: true,
    data: {
      studentCount,
      teacherCount,
      classCount,
      todayPractices: todayDialogues + todayReadAlouds + todayGames,
      todayDialogues,
      todayReadAlouds,
      todayGames,
    },
  })
}))

// PUT /api/internal/students/:id/password - 重置学生密码
router.put('/students/:id/password', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string)
  let { password } = req.body

  const student = await prisma.student.findUnique({
    where: { id },
    select: { id: true, name: true, studentNo: true },
  })

  if (!student) {
    return res.status(404).json({ success: false, message: '学生不存在' })
  }

  // 未提供密码时，重置为学号后 6 位
  if (!password) {
    password = student.studentNo.slice(-6)
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: '密码长度至少 6 位' })
  }

  const hashedPassword = await bcrypt.hash(password, 10)
  await prisma.student.update({
    where: { id },
    data: { password: hashedPassword },
  })

  res.json({
    success: true,
    data: { studentName: student.name, studentNo: student.studentNo, message: '密码已重置' },
  })
}))

// GET /api/internal/scenes - 场景列表
router.get('/scenes', asyncHandler(async (req, res) => {
  const type = req.query.type as string | undefined
  const results: any = {}

  if (!type || type === 'dialogue') {
    const scenes = await prisma.scene.findMany({
      select: {
        id: true, name: true, description: true, grade: true, visible: true, icon: true, createdAt: true,
        creator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    results.dialogueScenes = scenes
  }

  if (!type || type === 'readAloud') {
    const scenes = await prisma.readAloudScene.findMany({
      select: {
        id: true, name: true, description: true, grade: true, visible: true, createdAt: true,
        creator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    results.readAloudScenes = scenes
  }

  res.json({ success: true, data: results })
}))

// GET /api/internal/word-packs - 单词包列表
router.get('/word-packs', asyncHandler(async (req, res) => {
  const gameType = req.query.gameType as string | undefined
  const where: any = {}
  if (gameType) where.gameType = gameType

  const packs = await prisma.wordPack.findMany({
    where,
    select: {
      id: true, name: true, description: true, gameType: true, grade: true,
      visible: true, sortOrder: true, createdAt: true,
      _count: { select: { words: true } },
      creator: { select: { id: true, name: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })

  const formatted = packs.map(p => ({
    id: p.id, name: p.name, description: p.description, gameType: p.gameType,
    grade: p.grade, visible: p.visible, wordCount: p._count.words,
    creator: p.creator, createdAt: p.createdAt,
  }))

  res.json({ success: true, data: formatted })
}))

// GET /api/internal/word-packs/:id - 单词包详情（含单词列表）
router.get('/word-packs/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string)
  const pack = await prisma.wordPack.findUnique({
    where: { id },
    include: {
      words: { orderBy: { sortOrder: 'asc' } },
      creator: { select: { id: true, name: true } },
    },
  })

  if (!pack) {
    return res.status(404).json({ success: false, message: '单词包不存在' })
  }

  res.json({ success: true, data: pack })
}))

// GET /api/internal/students/:studentId/practice-records/:recordId - 对话练习详情
router.get('/students/:studentId/practice-records/:recordId', asyncHandler(async (req, res) => {
  const studentId = parseInt(req.params.studentId as string)
  const recordId = parseInt(req.params.recordId as string)

  const record = await prisma.practiceRecord.findUnique({
    where: { id: recordId },
    include: { scene: { select: { id: true, name: true, icon: true } } },
  })

  if (!record || record.studentId !== studentId) {
    return res.status(404).json({ success: false, message: '记录不存在' })
  }

  res.json({
    success: true,
    data: {
      id: record.id,
      scene: record.scene,
      totalScore: record.totalScore,
      pronunciationScore: record.pronunciationScore,
      fluencyScore: record.fluencyScore,
      grammarScore: record.grammarScore,
      roundsCompleted: record.roundsCompleted,
      durationSeconds: record.durationSeconds,
      feedbackText: record.feedbackText,
      dialogueHistory: record.dialogueHistory,
      status: record.status,
      createdAt: record.createdAt,
    },
  })
}))

// GET /api/internal/students/:studentId/read-aloud-records/:recordId - 跟读练习详情
router.get('/students/:studentId/read-aloud-records/:recordId', asyncHandler(async (req, res) => {
  const studentId = parseInt(req.params.studentId as string)
  const recordId = parseInt(req.params.recordId as string)

  const record = await prisma.readAloudRecord.findUnique({
    where: { id: recordId },
    include: { scene: { select: { id: true, name: true } } },
  })

  if (!record || record.studentId !== studentId) {
    return res.status(404).json({ success: false, message: '记录不存在' })
  }

  res.json({
    success: true,
    data: {
      id: record.id,
      scene: record.scene,
      totalScore: record.totalScore,
      intonationScore: record.intonationScore,
      fluencyScore: record.fluencyScore,
      accuracyScore: record.accuracyScore,
      expressionScore: record.expressionScore,
      completedCount: record.completedCount,
      totalCount: record.totalCount,
      durationSeconds: record.durationSeconds,
      feedback: record.feedback,
      strengths: record.strengths,
      improvements: record.improvements,
      sentenceResults: record.sentenceResults,
      status: record.status,
      createdAt: record.createdAt,
    },
  })
}))

// GET /api/internal/progress/student/:id/summary - AI 学习总结
router.get('/progress/student/:id/summary', asyncHandler(async (req, res) => {
  const studentId = parseInt(req.params.id as string)

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, studentNo: true, class: { select: { name: true } } },
  })

  if (!student) {
    return res.status(404).json({ success: false, message: '学生不存在' })
  }

  const className = student.class?.name || null

  const [practiceRecords, readAloudRecords] = await Promise.all([
    prisma.practiceRecord.findMany({
      where: { studentId, status: 'COMPLETED' },
      include: { scene: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.readAloudRecord.findMany({
      where: { studentId, status: 'COMPLETED' },
      include: { scene: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ])

  const practiceScores = practiceRecords.map(r => r.totalScore || 0).filter(s => s > 0)
  const readAloudScores = readAloudRecords.map(r => r.totalScore || 0).filter(s => s > 0)

  const practiceAvg = practiceScores.length > 0 ? practiceScores.reduce((sum, s) => sum + s, 0) / practiceScores.length : 0
  const readAloudAvg = readAloudScores.length > 0 ? readAloudScores.reduce((sum, s) => sum + s, 0) / readAloudScores.length : 0

  const calcTrend = (scores: number[]) => {
    if (scores.length < 4) return { trend: 'insufficient', change: 0 }
    const half = Math.floor(scores.length / 2)
    const firstHalf = scores.slice(0, half)
    const secondHalf = scores.slice(-half)
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
    const change = Math.round((secondAvg - firstAvg) * 10) / 10
    return { trend: change > 3 ? 'improving' : change < -3 ? 'declining' : 'stable', change }
  }

  const practiceTrend = calcTrend(practiceScores)
  const readAloudTrend = calcTrend(readAloudScores)

  const practiceMax = practiceScores.length > 0 ? Math.max(...practiceScores) : 0
  const practiceMin = practiceScores.length > 0 ? Math.min(...practiceScores) : 0

  const pronunciationScores = practiceRecords.map(r => r.pronunciationScore).filter((s): s is number => s !== null)
  const fluencyScores = practiceRecords.map(r => r.fluencyScore).filter((s): s is number => s !== null)
  const grammarScores = practiceRecords.map(r => r.grammarScore).filter((s): s is number => s !== null)
  const pronunciationAvg = pronunciationScores.length > 0 ? Math.round(pronunciationScores.reduce((a, b) => a + b, 0) / pronunciationScores.length) : 0
  const fluencyAvgScore = fluencyScores.length > 0 ? Math.round(fluencyScores.reduce((a, b) => a + b, 0) / fluencyScores.length) : 0
  const grammarAvgScore = grammarScores.length > 0 ? Math.round(grammarScores.reduce((a, b) => a + b, 0) / grammarScores.length) : 0

  const feedbackHistory: string[] = []
  practiceRecords.forEach(r => {
    const date = new Date(r.createdAt).toLocaleDateString('zh-CN')
    const feedback = r.feedbackText || ''
    if (feedback) {
      feedbackHistory.push(`[${date}] 对话「${r.scene.name}」- ${r.totalScore}分：${feedback}`)
    } else if (r.totalScore) {
      feedbackHistory.push(`[${date}] 对话「${r.scene.name}」- ${r.totalScore}分，发音${r.pronunciationScore}，流利${r.fluencyScore}，语法${r.grammarScore}`)
    }
  })
  readAloudRecords.forEach(r => {
    const date = new Date(r.createdAt).toLocaleDateString('zh-CN')
    const strengths = Array.isArray(r.strengths) ? (r.strengths as string[]).join('、') : ''
    const improvements = Array.isArray(r.improvements) ? (r.improvements as string[]).join('、') : ''
    let text = `[${date}] 跟读「${r.scene.name}」- ${r.totalScore}分`
    if (strengths) text += `，亮点：${strengths}`
    if (improvements) text += `，建议：${improvements}`
    feedbackHistory.push(text)
  })

  // 调用 Agent summary 服务
  try {
    const response = await fetch(`${env.agent.url}/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Api-Key': env.agent.apiKey },
      body: JSON.stringify({
        studentName: student.name, className,
        practiceCount: practiceRecords.length, readAloudCount: readAloudRecords.length,
        totalCount: practiceRecords.length + readAloudRecords.length,
        practiceAvg: Math.round(practiceAvg * 10) / 10, readAloudAvg: Math.round(readAloudAvg * 10) / 10,
        practiceMax, practiceMin, practiceTrend, readAloudTrend,
        pronunciationAvg, fluencyAvg: fluencyAvgScore, grammarAvg: grammarAvgScore,
        feedbackHistory: feedbackHistory.slice(0, 25).join('\n') || '暂无评价记录',
      }),
    })

    if (!response.ok) throw new Error(`Agent service error: ${response.status}`)
    const result = await response.json() as { success: boolean; data: any }
    res.json({ success: true, data: result.data })
  } catch (error: any) {
    logger.error({ err: error }, '[Internal] Summary generation failed')
    res.json({
      success: true,
      data: {
        strengths: ['积极参与英语学习'],
        weaknesses: ['需要更多练习机会'],
        overallComment: '该学生参与了英语练习，建议继续保持学习热情。',
        suggestions: ['坚持每天练习', '多进行口语训练'],
      },
    })
  }
}))

// GET /api/internal/teachers - 教师列表（仅管理员可用）
router.get('/teachers', asyncHandler(async (req, res) => {
  const teacherIdStr = req.headers['x-teacher-id'] as string
  if (teacherIdStr) {
    const teacherId = parseInt(teacherIdStr)
    if (!isNaN(teacherId)) {
      const teacher = await prisma.teacher.findUnique({
        where: { id: teacherId },
        select: { isAdmin: true },
      })
      if (teacher && !teacher.isAdmin) {
        return res.status(403).json({ success: false, message: '仅管理员可查看教师列表' })
      }
    }
  }

  const teachers = await prisma.teacher.findMany({
    select: {
      id: true, username: true, name: true, isAdmin: true, createdAt: true,
      classes: {
        select: { class: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const formatted = teachers.map(t => ({
    id: t.id, username: t.username, name: t.name, isAdmin: t.isAdmin, createdAt: t.createdAt,
    classes: t.classes.map(tc => tc.class),
  }))

  res.json({ success: true, data: formatted })
}))

// GET /api/internal/class-ranking - 班级/全校成绩排名
router.get('/class-ranking', asyncHandler(async (req, res) => {
  const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined
  const type = (req.query.type as string) || 'dialogue'
  const order = (req.query.order as string) || 'top'
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50)
  const startDate = req.query.startDate as string | undefined
  const endDate = req.query.endDate as string | undefined

  // 日期条件
  const dateCondition: any = {}
  if (startDate) dateCondition.gte = new Date(startDate)
  if (endDate) {
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    dateCondition.lte = end
  }
  const createdAtFilter = Object.keys(dateCondition).length > 0 ? { createdAt: dateCondition } : {}

  // 学生范围
  let studentIds: number[] | undefined
  if (classId) {
    const students = await prisma.student.findMany({
      where: { classId },
      select: { id: true },
    })
    studentIds = students.map(s => s.id)
    if (studentIds.length === 0) {
      return res.json({ success: true, data: { ranking: [], classId, type } })
    }
  }

  const studentCondition = studentIds ? { studentId: { in: studentIds } } : {}

  if (type === 'dialogue') {
    const students = await prisma.student.findMany({
      where: studentIds ? { id: { in: studentIds } } : {},
      select: {
        id: true, name: true, studentNo: true,
        class: { select: { name: true } },
        practiceRecords: {
          where: { status: 'COMPLETED', ...createdAtFilter },
          select: { totalScore: true },
        },
      },
    })

    const ranked = students
      .map(s => {
        const scores = s.practiceRecords.map(r => r.totalScore || 0).filter(sc => sc > 0)
        const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0
        const max = scores.length > 0 ? Math.max(...scores) : 0
        return { id: s.id, name: s.name, studentNo: s.studentNo, className: s.class?.name, avgScore: avg, maxScore: max, count: scores.length }
      })
      .filter(s => s.count > 0)
      .sort((a, b) => order === 'top' ? b.avgScore - a.avgScore : a.avgScore - b.avgScore)
      .slice(0, limit)

    res.json({ success: true, data: { ranking: ranked, type, order, total: ranked.length } })
  } else if (type === 'readAloud') {
    const students = await prisma.student.findMany({
      where: studentIds ? { id: { in: studentIds } } : {},
      select: {
        id: true, name: true, studentNo: true,
        class: { select: { name: true } },
        readAloudRecords: {
          where: { status: 'COMPLETED', ...createdAtFilter },
          select: { totalScore: true },
        },
      },
    })

    const ranked = students
      .map(s => {
        const scores = s.readAloudRecords.map(r => r.totalScore || 0).filter(sc => sc > 0)
        const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0
        const max = scores.length > 0 ? Math.max(...scores) : 0
        return { id: s.id, name: s.name, studentNo: s.studentNo, className: s.class?.name, avgScore: avg, maxScore: max, count: scores.length }
      })
      .filter(s => s.count > 0)
      .sort((a, b) => order === 'top' ? b.avgScore - a.avgScore : a.avgScore - b.avgScore)
      .slice(0, limit)

    res.json({ success: true, data: { ranking: ranked, type, order, total: ranked.length } })
  } else if (type === 'game') {
    const students = await prisma.student.findMany({
      where: studentIds ? { id: { in: studentIds } } : {},
      select: {
        id: true, name: true, studentNo: true,
        class: { select: { name: true } },
        wordGameRecords: {
          where: createdAtFilter,
          select: { score: true },
        },
      },
    })

    const ranked = students
      .map(s => {
        const scores = s.wordGameRecords.map(r => r.score)
        const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0
        const max = scores.length > 0 ? Math.max(...scores) : 0
        return { id: s.id, name: s.name, studentNo: s.studentNo, className: s.class?.name, avgScore: avg, maxScore: max, count: scores.length }
      })
      .filter(s => s.count > 0)
      .sort((a, b) => order === 'top' ? b.avgScore - a.avgScore : a.avgScore - b.avgScore)
      .slice(0, limit)

    res.json({ success: true, data: { ranking: ranked, type, order, total: ranked.length } })
  } else {
    res.status(400).json({ success: false, message: '不支持的类型' })
  }
}))

// GET /api/internal/class-report - 班级学习报告
router.get('/class-report', asyncHandler(async (req, res) => {
  const classId = parseInt(req.query.classId as string)
  if (isNaN(classId)) {
    return res.status(400).json({ success: false, message: 'classId 必填' })
  }

  const startDate = req.query.startDate as string | undefined
  const endDate = req.query.endDate as string | undefined
  const days = parseInt(req.query.days as string) || 7

  // 日期范围
  let since: Date
  let until: Date | undefined
  if (startDate) {
    since = new Date(startDate)
    until = endDate ? new Date(endDate + 'T23:59:59.999') : undefined
  } else {
    since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  }
  const dateCondition: any = { gte: since }
  if (until) dateCondition.lte = until

  // 班级信息
  const classInfo = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, name: true, grade: true, _count: { select: { students: true } } },
  })
  if (!classInfo) {
    return res.status(404).json({ success: false, message: '班级不存在' })
  }

  const students = await prisma.student.findMany({
    where: { classId },
    select: { id: true },
  })
  const studentIds = students.map(s => s.id)
  if (studentIds.length === 0) {
    return res.json({ success: true, data: { class: classInfo, message: '该班级暂无学生' } })
  }

  const studentCondition = { studentId: { in: studentIds } }

  // 对话练习统计
  const dialogueRecords = await prisma.practiceRecord.findMany({
    where: { ...studentCondition, createdAt: dateCondition, status: 'COMPLETED' },
    select: {
      totalScore: true, pronunciationScore: true, fluencyScore: true, grammarScore: true,
      studentId: true,
    },
  })

  // 跟读练习统计
  const readAloudRecords = await prisma.readAloudRecord.findMany({
    where: { ...studentCondition, createdAt: dateCondition, status: 'COMPLETED' },
    select: { totalScore: true, studentId: true },
  })

  // 游戏统计
  const gameRecords = await prisma.wordGameRecord.findMany({
    where: { ...studentCondition, createdAt: dateCondition },
    select: { score: true, studentId: true },
  })

  // 活跃学生数（有至少一条记录）
  const activeStudentIds = new Set([
    ...dialogueRecords.map(r => r.studentId),
    ...readAloudRecords.map(r => r.studentId),
    ...gameRecords.map(r => r.studentId),
  ])

  // 对话维度评分
  const dScores = dialogueRecords.filter(r => r.totalScore && r.totalScore > 0)
  const avgDialogue = dScores.length > 0 ? Math.round(dScores.reduce((s, r) => s + (r.totalScore || 0), 0) / dScores.length * 10) / 10 : null
  const pronScores = dialogueRecords.map(r => r.pronunciationScore).filter((s): s is number => s !== null && s > 0)
  const fluScores = dialogueRecords.map(r => r.fluencyScore).filter((s): s is number => s !== null && s > 0)
  const gramScores = dialogueRecords.map(r => r.grammarScore).filter((s): s is number => s !== null && s > 0)

  const avgPronunciation = pronScores.length > 0 ? Math.round(pronScores.reduce((a, b) => a + b, 0) / pronScores.length * 10) / 10 : null
  const avgFluency = fluScores.length > 0 ? Math.round(fluScores.reduce((a, b) => a + b, 0) / fluScores.length * 10) / 10 : null
  const avgGrammar = gramScores.length > 0 ? Math.round(gramScores.reduce((a, b) => a + b, 0) / gramScores.length * 10) / 10 : null

  // 跟读平均分
  const raScores = readAloudRecords.filter(r => r.totalScore && r.totalScore > 0)
  const avgReadAloud = raScores.length > 0 ? Math.round(raScores.reduce((s, r) => s + (r.totalScore || 0), 0) / raScores.length * 10) / 10 : null

  // 全校对比（同时间段）
  const [schoolDialogueAvg, schoolReadAloudAvg] = await Promise.all([
    prisma.practiceRecord.aggregate({
      where: { createdAt: dateCondition, status: 'COMPLETED' },
      _avg: { totalScore: true },
    }),
    prisma.readAloudRecord.aggregate({
      where: { createdAt: dateCondition, status: 'COMPLETED' },
      _avg: { totalScore: true },
    }),
  ])

  res.json({
    success: true,
    data: {
      class: { id: classInfo.id, name: classInfo.name, grade: classInfo.grade, studentCount: classInfo._count.students },
      period: startDate ? `${startDate} ~ ${endDate || '至今'}` : `近${days}天`,
      activeStudentCount: activeStudentIds.size,
      participationRate: Math.round(activeStudentIds.size / studentIds.length * 100) + '%',
      dialogue: {
        count: dialogueRecords.length,
        avgScore: avgDialogue,
        avgPronunciation,
        avgFluency,
        avgGrammar,
        schoolAvg: schoolDialogueAvg._avg.totalScore ? Math.round(schoolDialogueAvg._avg.totalScore * 10) / 10 : null,
      },
      readAloud: {
        count: readAloudRecords.length,
        avgScore: avgReadAloud,
        schoolAvg: schoolReadAloudAvg._avg.totalScore ? Math.round(schoolReadAloudAvg._avg.totalScore * 10) / 10 : null,
      },
      game: {
        count: gameRecords.length,
        avgScore: gameRecords.length > 0 ? Math.round(gameRecords.reduce((s, r) => s + r.score, 0) / gameRecords.length * 10) / 10 : null,
      },
    },
  })
}))

// GET /api/internal/inactive-students - 不活跃学生查询
router.get('/inactive-students', asyncHandler(async (req, res) => {
  const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined
  const days = parseInt(req.query.days as string) || 7
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const studentWhere: any = {}
  if (classId) studentWhere.classId = classId

  const students = await prisma.student.findMany({
    where: studentWhere,
    select: {
      id: true, name: true, studentNo: true,
      class: { select: { name: true } },
      practiceRecords: {
        where: { createdAt: { gte: since } },
        select: { id: true },
        take: 1,
      },
      readAloudRecords: {
        where: { createdAt: { gte: since } },
        select: { id: true },
        take: 1,
      },
      wordGameRecords: {
        where: { createdAt: { gte: since } },
        select: { id: true },
        take: 1,
      },
    },
  })

  // 找出没有任何近期记录的学生
  const inactive = students
    .filter(s => s.practiceRecords.length === 0 && s.readAloudRecords.length === 0 && s.wordGameRecords.length === 0)
    .map(s => ({ id: s.id, name: s.name, studentNo: s.studentNo, className: s.class?.name }))
    .slice(0, limit)

  res.json({
    success: true,
    data: {
      period: `近${days}天`,
      inactiveCount: inactive.length,
      totalStudents: students.length,
      inactiveRate: students.length > 0 ? Math.round(inactive.length / students.length * 100) + '%' : '0%',
      students: inactive,
    },
  })
}))

// PUT /api/internal/scenes/:sceneId/visibility - 修改场景可见性
router.put('/scenes/:sceneId/visibility', asyncHandler(async (req, res) => {
  const sceneId = req.params.sceneId as string
  const { type, visible } = req.body

  if (typeof visible !== 'boolean') {
    return res.status(400).json({ success: false, message: 'visible 必须是布尔值' })
  }

  if (type === 'dialogue') {
    const scene = await prisma.scene.findUnique({ where: { id: sceneId } })
    if (!scene) return res.status(404).json({ success: false, message: '对话场景不存在' })
    await prisma.scene.update({ where: { id: sceneId }, data: { visible } })
    res.json({ success: true, data: { sceneId, name: scene.name, type: 'dialogue', visible } })
  } else if (type === 'readAloud') {
    const scene = await prisma.readAloudScene.findUnique({ where: { id: sceneId } })
    if (!scene) return res.status(404).json({ success: false, message: '跟读场景不存在' })
    await prisma.readAloudScene.update({ where: { id: sceneId }, data: { visible } })
    res.json({ success: true, data: { sceneId, name: scene.name, type: 'readAloud', visible } })
  } else {
    res.status(400).json({ success: false, message: 'type 必须是 dialogue 或 readAloud' })
  }
}))

// PUT /api/internal/word-packs/:id/visibility - 修改单词包可见性
router.put('/word-packs/:id/visibility', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string)
  const { visible } = req.body

  if (typeof visible !== 'boolean') {
    return res.status(400).json({ success: false, message: 'visible 必须是布尔值' })
  }

  const pack = await prisma.wordPack.findUnique({ where: { id } })
  if (!pack) return res.status(404).json({ success: false, message: '单词包不存在' })

  await prisma.wordPack.update({ where: { id }, data: { visible } })
  res.json({ success: true, data: { packId: id, name: pack.name, visible } })
}))

// GET /api/internal/score-stats - 成绩统计（平均分/中位数/标准差/最高/最低）
router.get('/score-stats', asyncHandler(async (req, res) => {
  const classId = parseInt(req.query.classId as string)
  if (isNaN(classId)) {
    return res.status(400).json({ success: false, message: 'classId 必填' })
  }

  const type = (req.query.type as string) || 'dialogue'
  const startDate = req.query.startDate as string | undefined
  const endDate = req.query.endDate as string | undefined
  const days = parseInt(req.query.days as string) || 7

  // 日期范围
  let since: Date
  let until: Date | undefined
  if (startDate) {
    since = new Date(startDate)
    until = endDate ? new Date(endDate + 'T23:59:59.999') : undefined
  } else {
    since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  }
  const dateCondition: any = { gte: since }
  if (until) dateCondition.lte = until

  // 获取班级学生
  const students = await prisma.student.findMany({
    where: { classId },
    select: { id: true },
  })
  const studentIds = students.map(s => s.id)
  if (studentIds.length === 0) {
    return res.json({ success: true, data: { message: '该班级暂无学生', stats: null } })
  }

  const studentCondition = { studentId: { in: studentIds } }
  let scores: number[] = []

  if (type === 'dialogue') {
    const records = await prisma.practiceRecord.findMany({
      where: { ...studentCondition, createdAt: dateCondition, status: 'COMPLETED' },
      select: { totalScore: true },
    })
    scores = records.map(r => r.totalScore || 0).filter(s => s > 0)
  } else if (type === 'readAloud') {
    const records = await prisma.readAloudRecord.findMany({
      where: { ...studentCondition, createdAt: dateCondition, status: 'COMPLETED' },
      select: { totalScore: true },
    })
    scores = records.map(r => r.totalScore || 0).filter(s => s > 0)
  } else if (type === 'game') {
    const records = await prisma.wordGameRecord.findMany({
      where: { ...studentCondition, createdAt: dateCondition },
      select: { score: true },
    })
    scores = records.map(r => r.score)
  } else {
    return res.status(400).json({ success: false, message: '不支持的类型，可选: dialogue/readAloud/game' })
  }

  if (scores.length === 0) {
    return res.json({
      success: true,
      data: {
        type,
        period: startDate ? `${startDate} ~ ${endDate || '至今'}` : `近${days}天`,
        recordCount: 0,
        stats: null,
        message: '该时间段内没有完成的练习记录',
      },
    })
  }

  // 计算统计量
  const sorted = [...scores].sort((a, b) => a - b)
  const count = sorted.length
  const sum = sorted.reduce((a, b) => a + b, 0)
  const mean = sum / count
  const median = count % 2 === 0
    ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
    : sorted[Math.floor(count / 2)]
  const variance = sorted.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / count
  const stdDev = Math.sqrt(variance)
  const min = sorted[0]
  const max = sorted[count - 1]

  // 分位数
  const p25 = sorted[Math.floor(count * 0.25)]
  const p75 = sorted[Math.floor(count * 0.75)]

  // 分数分布
  const distribution = {
    '90-100': scores.filter(s => s >= 90).length,
    '80-89': scores.filter(s => s >= 80 && s < 90).length,
    '70-79': scores.filter(s => s >= 70 && s < 80).length,
    '60-69': scores.filter(s => s >= 60 && s < 70).length,
    '0-59': scores.filter(s => s < 60).length,
  }

  res.json({
    success: true,
    data: {
      type,
      period: startDate ? `${startDate} ~ ${endDate || '至今'}` : `近${days}天`,
      recordCount: count,
      studentCount: studentIds.length,
      stats: {
        mean: Math.round(mean * 10) / 10,
        median: Math.round(median * 10) / 10,
        stdDev: Math.round(stdDev * 10) / 10,
        min,
        max,
        p25,
        p75,
      },
      distribution,
    },
  })
}))

// 知识搜索（纯向量搜索）
async function searchKnowledge(question: string) {
  const results = await knowledgeVectorService.search(question, undefined, 5)
  return results.map(r => ({
    category: r.category,
    title: r.title,
    content: r.content,
  }))
}

/**
 * POST /api/internal/students/create - 创建学生
 * 强制学号格式：纯数字，8-12位
 */
router.post('/students/create', asyncHandler(async (req: Request, res: Response) => {
  const { studentNo, name, classId, password, seatNo } = req.body

  // 格式校验
  if (!studentNo || !/^\d{8,12}$/.test(studentNo)) {
    return res.status(400).json({
      success: false,
      message: '学号格式错误：必须为 8-12 位纯数字（如 2026050101）',
    })
  }
  if (!name || name.trim().length === 0 || name.trim().length > 20) {
    return res.status(400).json({
      success: false,
      message: '姓名不合法：1-20 个字符',
    })
  }
  if (!classId || isNaN(parseInt(classId))) {
    return res.status(400).json({
      success: false,
      message: '必须指定有效的班级 ID（数字）',
    })
  }

  const targetClass = await prisma.class.findUnique({ where: { id: parseInt(classId) } })
  if (!targetClass) {
    return res.status(404).json({ success: false, message: `班级 ID=${classId} 不存在` })
  }

  const existing = await prisma.student.findUnique({ where: { studentNo } })
  if (existing) {
    return res.status(409).json({ success: false, message: `学号 ${studentNo} 已存在` })
  }

  const finalPassword = password || studentNo.slice(-6) // 默认密码为学号后6位
  const hashedPassword = await bcrypt.hash(finalPassword, 10)

  const student = await prisma.student.create({
    data: {
      studentNo,
      name: name.trim(),
      classId: parseInt(classId),
      password: hashedPassword,
      seatNo: seatNo ? parseInt(seatNo) : null,
    },
    select: { id: true, studentNo: true, name: true, classId: true, seatNo: true },
  })

  res.status(201).json({
    success: true,
    data: { ...student, defaultPassword: finalPassword },
    message: `学生 ${student.name}（${student.studentNo}）创建成功，默认密码: ${finalPassword}`,
  })
}))

/**
 * POST /api/internal/teachers/create - 创建教师
 * 强制账号格式：小写字母/数字/下划线，3-20位，字母开头
 */
router.post('/teachers/create', asyncHandler(async (req: Request, res: Response) => {
  const { username, name, password, isAdmin } = req.body

  // 格式校验
  if (!username || !/^[a-z][a-z0-9_]{2,19}$/.test(username)) {
    return res.status(400).json({
      success: false,
      message: '教师账号格式错误：小写字母开头，3-20 位，仅允许小写字母、数字和下划线（如 wang_li）',
    })
  }
  if (!name || name.trim().length === 0 || name.trim().length > 20) {
    return res.status(400).json({
      success: false,
      message: '姓名不合法：1-20 个字符',
    })
  }

  const existing = await prisma.teacher.findUnique({ where: { username } })
  if (existing) {
    return res.status(409).json({ success: false, message: `账号 ${username} 已存在` })
  }

  const finalPassword = password || '123456' // 默认密码
  const hashedPassword = await bcrypt.hash(finalPassword, 10)

  const teacher = await prisma.teacher.create({
    data: {
      username,
      name: name.trim(),
      password: hashedPassword,
      isAdmin: isAdmin === true,
    },
    select: { id: true, username: true, name: true, isAdmin: true },
  })

  res.status(201).json({
    success: true,
    data: { ...teacher, defaultPassword: finalPassword },
    message: `教师 ${teacher.name}（${teacher.username}）创建成功，默认密码: ${finalPassword}`,
  })
}))

export default router
