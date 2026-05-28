/**
 * 单词包管理路由（Admin）
 * CRUD 操作，支持按游戏类型筛选
 */
import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { prisma } from '../../config/database.js'
import { success } from '../../utils/response.js'
import type { TeacherRequest } from '../../types/index.js'

const router = Router()

/**
 * GET /api/admin/word-packs
 * 获取单词包列表，支持按游戏类型筛选
 */
router.get('/', asyncHandler(async (req: TeacherRequest, res) => {
  const gameType = req.query.gameType as string | undefined

  const where: any = {}
  if (gameType) where.gameType = gameType

  const packs = await prisma.wordPack.findMany({
    where,
    include: {
      words: { orderBy: { sortOrder: 'asc' } },
      creator: { select: { id: true, name: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })

  return success(res, packs)
}))

/**
 * GET /api/admin/word-packs/:id
 * 获取单个单词包详情
 */
router.get('/:id', asyncHandler(async (req: TeacherRequest, res) => {
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

  return success(res, pack)
}))

/**
 * POST /api/admin/word-packs
 * 创建单词包（含单词列表）
 */
router.post('/', asyncHandler(async (req: TeacherRequest, res) => {
  const { name, description, gameType, grade, visible = true, sortOrder = 0, words = [] } = req.body
  const teacherId = req.teacher!.teacherId

  if (!name || !gameType) {
    return res.status(400).json({ success: false, message: '名称和游戏类型不能为空' })
  }

  if (!['shooter', 'match', 'spell', 'miner'].includes(gameType)) {
    return res.status(400).json({ success: false, message: '游戏类型必须是 shooter / match / spell / miner' })
  }

  const pack = await prisma.wordPack.create({
    data: {
      name,
      description,
      gameType,
      grade: grade || '通用',
      visible,
      sortOrder,
      creatorId: teacherId,
      words: {
        create: words.map((w: any, index: number) => ({
          english: w.english,
          chinese: w.chinese,
          phonetic: w.phonetic || null,
          difficulty: w.difficulty || 1,
          sortOrder: index,
        })),
      },
    },
    include: {
      words: { orderBy: { sortOrder: 'asc' } },
      creator: { select: { id: true, name: true } },
    },
  })

  return success(res, pack, '创建成功', 201)
}))

/**
 * PUT /api/admin/word-packs/:id
 * 更新单词包（整体替换单词列表）
 */
router.put('/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const id = parseInt(req.params.id as string)
  const { name, description, gameType, grade, visible, sortOrder, words } = req.body
  const { teacherId, isAdmin } = req.teacher!

  // 权限检查
  if (!isAdmin) {
    const pack = await prisma.wordPack.findUnique({ where: { id }, select: { creatorId: true } })
    if (pack?.creatorId !== teacherId) {
      return res.status(403).json({ success: false, message: '只能编辑自己创建的单词包' })
    }
  }

  // 更新主体信息
  const updateData: any = {}
  if (name !== undefined) updateData.name = name
  if (description !== undefined) updateData.description = description
  if (gameType !== undefined) updateData.gameType = gameType
  if (grade !== undefined) updateData.grade = grade
  if (visible !== undefined) updateData.visible = visible
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder

  // 如果传了 words 则整体替换
  if (words !== undefined) {
    await prisma.$transaction([
      prisma.word.deleteMany({ where: { packId: id } }),
      prisma.wordPack.update({
        where: { id },
        data: {
          ...updateData,
          words: {
            create: words.map((w: any, index: number) => ({
              english: w.english,
              chinese: w.chinese,
              phonetic: w.phonetic || null,
              difficulty: w.difficulty || 1,
              sortOrder: index,
            })),
          },
        },
      }),
    ])
  } else {
    await prisma.wordPack.update({ where: { id }, data: updateData })
  }

  // 返回更新后的完整数据
  const updated = await prisma.wordPack.findUnique({
    where: { id },
    include: {
      words: { orderBy: { sortOrder: 'asc' } },
      creator: { select: { id: true, name: true } },
    },
  })

  return success(res, updated)
}))

/**
 * DELETE /api/admin/word-packs/:id
 * 删除单词包（级联删除所有单词）
 */
router.delete('/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const id = parseInt(req.params.id as string)
  const { teacherId, isAdmin } = req.teacher!

  const pack = await prisma.wordPack.findUnique({ where: { id }, select: { creatorId: true } })
  if (!pack) {
    return res.status(404).json({ success: false, message: '单词包不存在' })
  }
  if (!isAdmin && pack.creatorId !== teacherId) {
    return res.status(403).json({ success: false, message: '只能删除自己创建的单词包' })
  }

  await prisma.wordPack.delete({ where: { id } })
  res.status(204).send()
}))

export default router
