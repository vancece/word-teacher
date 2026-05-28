/**
 * 单词包公开路由（学生端）
 * 只返回 visible=true 的单词包
 */
import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { prisma } from '../config/database.js'
import { success } from '../utils/response.js'

const router = Router()

/**
 * GET /api/word-packs?gameType=shooter
 * 获取可见的单词包列表，支持按游戏类型筛选
 */
router.get('/', asyncHandler(async (req, res) => {
  const gameType = req.query.gameType as string | undefined

  const where: any = { visible: true }
  if (gameType) where.gameType = gameType

  const packs = await prisma.wordPack.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
      gameType: true,
      grade: true,
      words: {
        select: {
          english: true,
          chinese: true,
          phonetic: true,
          difficulty: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })

  return success(res, packs)
}))

/**
 * GET /api/word-packs/:id
 * 获取单个单词包详情
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string)

  const pack = await prisma.wordPack.findFirst({
    where: { id, visible: true },
    select: {
      id: true,
      name: true,
      description: true,
      gameType: true,
      grade: true,
      words: {
        select: {
          english: true,
          chinese: true,
          phonetic: true,
          difficulty: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  if (!pack) {
    return res.status(404).json({ success: false, message: '单词包不存在' })
  }

  return success(res, pack)
}))

export default router
