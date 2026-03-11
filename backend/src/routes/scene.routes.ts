import { Router } from 'express'
import { prisma } from '../config/database.js'
import { success, notFound } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authenticateStudent } from '../middleware/auth.js'

const router = Router()

// 所有场景路由需要学生认证
router.use(authenticateStudent)

// 获取所有场景列表（仅返回 visible=true 的场景）
// coverImage 现在存储的是 URL（MinIO），不再是 base64
router.get('/', asyncHandler(async (_req, res) => {
  const scenes = await prisma.scene.findMany({
    where: { visible: true },
    select: {
      id: true,
      name: true,
      description: true,
      rounds: true,
      icon: true,
      coverImage: true,  // 现在是 URL，传输量小
      grade: true,
      vocabulary: true,
    },
    orderBy: { id: 'asc' },
  })

  return success(res, scenes)
}))

// 获取单个场景详情
router.get('/:id', asyncHandler(async (req, res) => {
  const scene = await prisma.scene.findUnique({
    where: { id: req.params.id as string },
  })

  if (!scene) {
    return notFound(res, '场景不存在')
  }

  return success(res, scene)
}))

export default router

