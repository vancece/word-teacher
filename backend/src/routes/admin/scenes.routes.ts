/**
 * 对话场景管理路由
 */
import { Router } from 'express'
import { prisma } from '../../config/database.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { success } from '../../utils/response.js'
import { uploadBase64Image, isMinioAvailable } from '../../services/minio.service.js'
import { logger } from '../../utils/logger.js'
import type { TeacherRequest } from '../../types/index.js'

const router = Router()

/**
 * 处理封面图片上传
 * 如果是 base64 数据，上传到 MinIO 并返回 URL
 * 如果已经是 URL，直接返回
 */
async function processCoverImage(coverImage: string | undefined, sceneId: string): Promise<string | undefined> {
  if (!coverImage) return undefined

  // 已经是 URL，直接返回
  if (coverImage.startsWith('http://') || coverImage.startsWith('https://')) {
    return coverImage
  }

  // 是 base64，上传到 MinIO
  if (coverImage.startsWith('data:image/') || coverImage.length > 1000) {
    try {
      const available = await isMinioAvailable()
      if (!available) {
        logger.warn('[Scenes] MinIO not available, storing base64 directly')
        return coverImage  // MinIO 不可用时，仍存储 base64
      }

      const url = await uploadBase64Image(coverImage, `scene_${sceneId}`)
      logger.info({ sceneId, url }, '[Scenes] Cover image uploaded to MinIO')
      return url
    } catch (error) {
      logger.error({ error }, '[Scenes] Failed to upload cover image')
      return coverImage  // 上传失败时，仍存储 base64
    }
  }

  return coverImage
}

/**
 * GET /api/admin/scenes
 */
router.get('/', asyncHandler(async (_req: TeacherRequest, res) => {
  const scenes = await prisma.scene.findMany({
    include: {
      creator: { select: { id: true, name: true } }
    },
    orderBy: { createdAt: 'asc' },
  })
  return success(res, scenes)
}))

/**
 * POST /api/admin/scenes
 */
router.post('/', asyncHandler(async (req: TeacherRequest, res) => {
  const { name, description, icon, grade, vocabulary, dialogueConfig, visible = true, coverImage, prompt } = req.body
  const teacherId = req.teacher!.teacherId

  const sceneId = `sc_${Date.now().toString(36)}`

  // 处理封面图片（如果是 base64，上传到 MinIO）
  const processedCoverImage = await processCoverImage(coverImage, sceneId)

  const scene = await prisma.scene.create({
    data: {
      id: sceneId,
      name,
      description,
      rounds: 5,
      icon: icon || '/images/scenes/default.png',
      grade: grade || '基础',
      vocabulary: vocabulary || [],
      dialogueConfig: dialogueConfig || {},
      visible,
      coverImage: processedCoverImage,
      prompt,
      creatorId: teacherId,
    },
    include: {
      creator: { select: { id: true, name: true } }
    },
  })
  return success(res, scene, '创建成功', 201)
}))

/**
 * PUT /api/admin/scenes/:id
 */
router.put('/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const id = req.params.id as string
  const { name, description, icon, grade, vocabulary, dialogueConfig, visible, coverImage, prompt } = req.body
  const { teacherId, isAdmin } = req.teacher!

  if (!isAdmin) {
    const existing = await prisma.scene.findUnique({ where: { id }, select: { creatorId: true } })
    if (existing?.creatorId !== teacherId) {
      return res.status(403).json({ success: false, message: '只能编辑自己创建的场景' })
    }
  }

  // 处理封面图片（如果是 base64，上传到 MinIO）
  const processedCoverImage = await processCoverImage(coverImage, id)

  const scene = await prisma.scene.update({
    where: { id },
    data: { name, description, icon, grade, vocabulary, dialogueConfig, visible, coverImage: processedCoverImage, prompt },
    include: {
      creator: { select: { id: true, name: true } }
    },
  })
  return success(res, scene)
}))

/**
 * DELETE /api/admin/scenes/:id
 */
router.delete('/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const id = req.params.id as string
  const { teacherId, isAdmin } = req.teacher!

  const existing = await prisma.scene.findUnique({ where: { id }, select: { creatorId: true } })
  if (!existing) {
    return res.status(404).json({ success: false, message: '场景不存在' })
  }

  if (!isAdmin && existing.creatorId !== teacherId) {
    return res.status(403).json({ success: false, message: '只能删除自己创建的场景' })
  }

  await prisma.$transaction([
    prisma.practiceRecord.deleteMany({ where: { sceneId: id } }),
    prisma.scene.delete({ where: { id } }),
  ])

  res.status(204).send()
}))

export default router

