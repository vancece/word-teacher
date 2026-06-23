/**
 * Admin 路由入口
 * 整合所有管理功能子路由
 */
import { Router } from 'express'
import { authenticateTeacher } from '../../middleware/auth.js'

// 导入子路由
import statsRoutes from './stats.routes.js'
import classesRoutes from './classes.routes.js'
import studentsRoutes from './students.routes.js'
import scenesRoutes from './scenes.routes.js'
import progressRoutes from './progress.routes.js'
import teachersRoutes from './teachers.routes.js'
import wordPacksRoutes from './word-packs.routes.js'
import assistantRoutes from './assistant.routes.js'
import logsRoutes from './logs.routes.js'
import dashboardRoutes from './dashboard.routes.js'

const router = Router()

// 所有管理路由需要教师认证
router.use(authenticateTeacher)

// 挂载子路由
router.use('/stats', statsRoutes)             // GET /stats
router.use('/classes', classesRoutes)         // GET/POST/PUT/DELETE /classes
router.use('/students', studentsRoutes)       // GET/POST/PUT/DELETE /students
router.use('/scenes', scenesRoutes)           // 对话场景 CRUD
router.use('/progress', progressRoutes)       // GET /progress/overview, /progress/student/:id
router.use('/teachers', teachersRoutes)       // GET/POST/PUT/DELETE /teachers
router.use('/word-packs', wordPacksRoutes)    // 单词包 CRUD
router.use('/assistant', assistantRoutes)    // AI 助手 + 知识库管理
router.use('/logs', logsRoutes)              // 日志查询（管理员）
router.use('/dashboard', dashboardRoutes)    // 仪表盘增强（AI连通性、趋势、存储、异常）

// 导出文件下载已移到 routes/index.ts 作为公开路由（浏览器直接打开链接无法携带 JWT）

// 向后兼容：旧路径映射
// /read-aloud-records -> /read-aloud/records
// /read-aloud-scenes/* -> /read-aloud/scenes/*
import { asyncHandler } from '../../utils/asyncHandler.js'
import { prisma } from '../../config/database.js'
import { success } from '../../utils/response.js'
import { uploadBase64Image, isMinioAvailable } from '../../services/minio.service.js'
import { sceneLogger as logger } from '../../utils/logger.js'
import type { TeacherRequest } from '../../types/index.js'

/**
 * 处理封面图片上传（跟读场景用）
 */
async function processCoverImage(coverImage: string | undefined, sceneId: string): Promise<string | undefined> {
  if (!coverImage) return undefined
  if (coverImage.startsWith('http://') || coverImage.startsWith('https://')) return coverImage
  if (coverImage.startsWith('data:image/') || coverImage.length > 1000) {
    try {
      if (!await isMinioAvailable()) {
        logger.warn('MinIO not available, storing base64 directly')
        return coverImage
      }
      const url = await uploadBase64Image(coverImage, `read_aloud_${sceneId}`)
      logger.info({ sceneId, url }, 'Cover image uploaded to MinIO')
      return url
    } catch (error) {
      logger.error({ error }, 'Failed to upload cover image')
      return coverImage
    }
  }
  return coverImage
}

/**
 * GET /api/admin/learning-records
 * 统一学习记录列表（跟读 + 对话），支持班级筛选、搜索、类型筛选
 */
router.get('/learning-records', asyncHandler(async (req: TeacherRequest, res) => {
  const { teacherId, isAdmin } = req.teacher!
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 15
  const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined
  const search = req.query.search as string | undefined
  const type = req.query.type as string | undefined // 'readAloud' | 'dialogue' | undefined(全部)
  const status = req.query.status as string | undefined

  // 权限：非管理员只能看自己负责的班级
  let allowedStudentIds: number[] | undefined
  if (!isAdmin) {
    const teacherClasses = await prisma.classTeacher.findMany({
      where: { teacherId },
      select: { classId: true },
    })
    const classIds = teacherClasses.map(tc => tc.classId)
    if (classIds.length === 0) {
      return success(res, { records: [], total: 0, page, limit })
    }
    const students = await prisma.student.findMany({
      where: { classId: { in: classIds } },
      select: { id: true },
    })
    allowedStudentIds = students.map(s => s.id)
    if (allowedStudentIds.length === 0) {
      return success(res, { records: [], total: 0, page, limit })
    }
  }

  // 班级筛选 + 搜索
  let studentFilter: number[] | undefined = allowedStudentIds
  if (classId || search) {
    const studentWhere: any = {}
    if (classId) studentWhere.classId = classId
    if (search) {
      studentWhere.OR = [
        { name: { contains: search } },
        { studentNo: { contains: search } },
      ]
    }
    if (allowedStudentIds) {
      studentWhere.id = { in: allowedStudentIds }
    }
    const filteredStudents = await prisma.student.findMany({
      where: studentWhere,
      select: { id: true },
    })
    studentFilter = filteredStudents.map(s => s.id)
    if (studentFilter.length === 0) {
      return success(res, { records: [], total: 0, page, limit })
    }
  }

  const studentCondition = studentFilter ? { studentId: { in: studentFilter } } : {}
  const statusCondition = status ? { status: status as any } : {}

  const shouldFetchReadAloud = !type || type === 'readAloud'
  const shouldFetchDialogue = !type || type === 'dialogue'

  // 获取总数
  const [readAloudCount, dialogueCount] = await Promise.all([
    shouldFetchReadAloud
      ? prisma.readAloudRecord.count({ where: { ...studentCondition, ...statusCondition } })
      : 0,
    shouldFetchDialogue
      ? prisma.practiceRecord.count({ where: { ...studentCondition, ...statusCondition } })
      : 0,
  ])
  const total = readAloudCount + dialogueCount

  // 合并查询：为了排序分页正确，先查所有记录的 id+createdAt，然后分页
  const [readAloudRecords, dialogueRecords] = await Promise.all([
    shouldFetchReadAloud
      ? prisma.readAloudRecord.findMany({
          where: { ...studentCondition, ...statusCondition },
          include: {
            student: { select: { id: true, name: true, studentNo: true, class: { select: { name: true } } } },
            scene: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [],
    shouldFetchDialogue
      ? prisma.practiceRecord.findMany({
          where: { ...studentCondition, ...statusCondition },
          include: {
            student: { select: { id: true, name: true, studentNo: true, class: { select: { name: true } } } },
            scene: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [],
  ])

  // 合并 + 按时间排序
  const merged = [
    ...readAloudRecords.map(r => ({
      id: r.id,
      type: 'readAloud' as const,
      studentId: r.studentId,
      student: { ...r.student, className: r.student.class?.name || null },
      scene: r.scene,
      totalScore: r.totalScore,
      status: r.status,
      completedCount: r.completedCount,
      totalCount: r.totalCount,
      feedback: r.feedback || null,
      createdAt: r.createdAt,
    })),
    ...dialogueRecords.map(r => ({
      id: r.id,
      type: 'dialogue' as const,
      studentId: r.studentId,
      student: { ...r.student, className: r.student.class?.name || null },
      scene: r.scene,
      totalScore: r.totalScore,
      status: r.status,
      completedCount: r.roundsCompleted || 0,
      totalCount: 0,
      feedback: r.feedbackText || null,
      createdAt: r.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // 分页
  const paged = merged.slice((page - 1) * limit, page * limit)

  return success(res, { records: paged, total, page, limit })
}))

router.get('/read-aloud-records', asyncHandler(async (req: TeacherRequest, res) => {
  const { teacherId, isAdmin } = req.teacher!
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 10
  const studentId = req.query.studentId ? parseInt(req.query.studentId as string) : undefined
  const sceneId = req.query.sceneId as string | undefined
  const status = req.query.status as string | undefined

  let allowedStudentIds: number[] | undefined
  if (!isAdmin) {
    const teacherClasses = await prisma.classTeacher.findMany({
      where: { teacherId },
      select: { classId: true },
    })
    const classIds = teacherClasses.map(tc => tc.classId)
    if (classIds.length === 0) {
      return success(res, { records: [], total: 0, page, limit })
    }
    const students = await prisma.student.findMany({
      where: { classId: { in: classIds } },
      select: { id: true },
    })
    allowedStudentIds = students.map(s => s.id)
    if (allowedStudentIds.length === 0) {
      return success(res, { records: [], total: 0, page, limit })
    }
  }

  const where: any = {
    ...(studentId && { studentId }),
    ...(sceneId && { sceneId }),
    ...(status && { status: status as any }),
  }

  if (allowedStudentIds) {
    where.studentId = studentId
      ? (allowedStudentIds.includes(studentId) ? studentId : -1)
      : { in: allowedStudentIds }
  }

  const [records, total] = await Promise.all([
    prisma.readAloudRecord.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, studentNo: true, class: { select: { name: true } } } },
        scene: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.readAloudRecord.count({ where }),
  ])

  const formattedRecords = records.map(r => ({
    ...r,
    student: { ...r.student, className: r.student.class?.name || null },
  }))

  return success(res, { records: formattedRecords, total, page, limit })
}))

// read-aloud-scenes 兼容路由
router.get('/read-aloud-scenes', asyncHandler(async (_req: TeacherRequest, res) => {
  const scenes = await prisma.readAloudScene.findMany({
    include: { creator: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return success(res, scenes)
}))

router.post('/read-aloud-scenes', asyncHandler(async (req: TeacherRequest, res) => {
  const { name, description, grade, sentences, visible = true, coverImage } = req.body
  const teacherId = req.teacher!.teacherId

  const sceneId = `ras_${Date.now().toString(36)}`
  const processedCoverImage = await processCoverImage(coverImage, sceneId)

  const scene = await prisma.readAloudScene.create({
    data: {
      id: sceneId,
      name,
      description,
      grade: grade || '基础',
      sentences: sentences || [],
      visible,
      coverImage: processedCoverImage,
      creatorId: teacherId,
    },
    include: {
      creator: { select: { id: true, name: true } }
    },
  })
  return success(res, scene, '创建成功', 201)
}))

router.put('/read-aloud-scenes/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const id = req.params.id as string
  const { name, description, grade, sentences, visible, coverImage } = req.body
  const { teacherId, isAdmin } = req.teacher!
  if (!isAdmin) {
    const scene = await prisma.readAloudScene.findUnique({ where: { id }, select: { creatorId: true } })
    if (scene?.creatorId !== teacherId) {
      return res.status(403).json({ success: false, message: '只能编辑自己创建的场景' })
    }
  }

  const processedCoverImage = await processCoverImage(coverImage, id)

  const scene = await prisma.readAloudScene.update({
    where: { id },
    data: { name, description, grade, sentences, visible, coverImage: processedCoverImage },
    include: {
      creator: { select: { id: true, name: true } }
    },
  })
  return success(res, scene)
}))

router.delete('/read-aloud-scenes/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const id = req.params.id as string
  const { teacherId, isAdmin } = req.teacher!
  const scene = await prisma.readAloudScene.findUnique({ where: { id }, select: { creatorId: true } })
  if (!scene) return res.status(404).json({ success: false, message: '场景不存在' })
  if (!isAdmin && scene.creatorId !== teacherId) {
    return res.status(403).json({ success: false, message: '只能删除自己创建的场景' })
  }
  await prisma.$transaction([
    prisma.readAloudRecord.deleteMany({ where: { sceneId: id } }),
    prisma.readAloudScene.delete({ where: { id } }),
  ])
  res.status(204).send()
}))

// AI 场景补充代理 - 调用 Agent 服务
import { env } from '../../config/env.js'

router.post('/scene/supplement', asyncHandler(async (req: TeacherRequest, res) => {
  const agentUrl = env.agent.url.replace('/api/agent', '') // 去掉 /api/agent 后缀
  const response = await fetch(`${agentUrl}/api/agent/scene/supplement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-api-key': env.agent.apiKey,
    },
    body: JSON.stringify(req.body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return res.status(response.status).json({ success: false, message: errorText || 'AI supplement failed' })
  }

  const data = await response.json()
  return success(res, data)
}))

/**
 * GET /api/admin/word-game-records
 * 游戏记录列表，支持班级筛选、游戏类型筛选、搜索
 */
router.get('/word-game-records', asyncHandler(async (req: TeacherRequest, res) => {
  const { teacherId, isAdmin } = req.teacher!
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 15
  const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined
  const gameType = req.query.gameType as string | undefined
  const search = req.query.search as string | undefined

  // 权限：非管理员只能看自己负责的班级
  let allowedStudentIds: number[] | undefined
  if (!isAdmin) {
    const teacherClasses = await prisma.classTeacher.findMany({
      where: { teacherId },
      select: { classId: true },
    })
    const classIds = teacherClasses.map(tc => tc.classId)
    if (classIds.length === 0) {
      return success(res, { records: [], total: 0, page, limit })
    }
    const students = await prisma.student.findMany({
      where: { classId: { in: classIds } },
      select: { id: true },
    })
    allowedStudentIds = students.map(s => s.id)
    if (allowedStudentIds.length === 0) {
      return success(res, { records: [], total: 0, page, limit })
    }
  }

  // 班级 + 搜索筛选
  let studentFilter: number[] | undefined = allowedStudentIds
  if (classId || search) {
    const studentWhere: any = {}
    if (classId) studentWhere.classId = classId
    if (search) {
      studentWhere.OR = [
        { name: { contains: search } },
        { studentNo: { contains: search } },
      ]
    }
    if (allowedStudentIds) {
      studentWhere.id = { in: allowedStudentIds }
    }
    const filteredStudents = await prisma.student.findMany({
      where: studentWhere,
      select: { id: true },
    })
    studentFilter = filteredStudents.map(s => s.id)
    if (studentFilter.length === 0) {
      return success(res, { records: [], total: 0, page, limit })
    }
  }

  const where: any = {}
  if (studentFilter) where.studentId = { in: studentFilter }
  if (gameType) where.gameType = gameType

  const [records, total] = await Promise.all([
    prisma.wordGameRecord.findMany({
      where,
      include: {
        student: {
          select: { id: true, name: true, studentNo: true, class: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.wordGameRecord.count({ where }),
  ])

  return success(res, { records, total, page, limit })
}))

/**
 * DELETE /api/admin/word-game-records/:id
 * 删除游戏记录
 */
router.delete('/word-game-records/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const id = parseInt(req.params.id as string)
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的记录ID' })

  const record = await prisma.wordGameRecord.findUnique({ where: { id } })
  if (!record) return res.status(404).json({ success: false, message: '记录不存在' })

  await prisma.wordGameRecord.delete({ where: { id } })
  res.status(204).send()
}))

/**
 * DELETE /api/admin/learning-records/:type/:id
 * 删除学习记录（跟读或对话）
 */
router.delete('/learning-records/:type/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const { type, id: idStr } = req.params as Record<string, string>
  const id = parseInt(idStr)
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的记录ID' })

  if (type === 'readAloud') {
    const record = await prisma.readAloudRecord.findUnique({ where: { id } })
    if (!record) return res.status(404).json({ success: false, message: '记录不存在' })
    await prisma.readAloudRecord.delete({ where: { id } })
  } else if (type === 'dialogue') {
    const record = await prisma.practiceRecord.findUnique({ where: { id } })
    if (!record) return res.status(404).json({ success: false, message: '记录不存在' })
    await prisma.practiceRecord.delete({ where: { id } })
  } else {
    return res.status(400).json({ success: false, message: '无效的记录类型' })
  }

  res.status(204).send()
}))

export default router

