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

// 向后兼容：旧路径映射
// /read-aloud-records -> /read-aloud/records
// /read-aloud-scenes/* -> /read-aloud/scenes/*
import { asyncHandler } from '../../utils/asyncHandler.js'
import { prisma } from '../../config/database.js'
import { success } from '../../utils/response.js'
import { uploadBase64Image, isMinioAvailable } from '../../services/minio.service.js'
import { logger } from '../../utils/logger.js'
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
        logger.warn('[ReadAloudScenes] MinIO not available, storing base64 directly')
        return coverImage
      }
      const url = await uploadBase64Image(coverImage, `read_aloud_${sceneId}`)
      logger.info({ sceneId, url }, '[ReadAloudScenes] Cover image uploaded to MinIO')
      return url
    } catch (error) {
      logger.error({ error }, '[ReadAloudScenes] Failed to upload cover image')
      return coverImage
    }
  }
  return coverImage
}

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

export default router

