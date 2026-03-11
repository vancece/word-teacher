/**
 * 教师管理路由（仅管理员）
 */
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../../config/database.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { adminOnly } from '../../middleware/auth.js'
import { success } from '../../utils/response.js'
import type { TeacherRequest } from '../../types/index.js'

const router = Router()

/**
 * GET /api/admin/teachers
 */
router.get('/', adminOnly, asyncHandler(async (_req: TeacherRequest, res) => {
  const teachers = await prisma.teacher.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      isAdmin: true,
      createdAt: true,
      classes: {
        select: {
          class: { select: { id: true, name: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' },
  })

  const formattedTeachers = teachers.map(t => ({
    id: t.id,
    username: t.username,
    name: t.name,
    isAdmin: t.isAdmin,
    createdAt: t.createdAt,
    classes: t.classes.map(tc => tc.class),
  }))

  return success(res, formattedTeachers)
}))

/**
 * POST /api/admin/teachers
 */
router.post('/', adminOnly, asyncHandler(async (req: TeacherRequest, res) => {
  const { username, password, name, isAdmin = false } = req.body

  const existing = await prisma.teacher.findUnique({ where: { username } })
  if (existing) {
    return res.status(400).json({ success: false, message: '用户名已存在' })
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  const teacher = await prisma.teacher.create({
    data: {
      username,
      password: hashedPassword,
      name,
      isAdmin,
    },
    select: {
      id: true,
      username: true,
      name: true,
      isAdmin: true,
      createdAt: true,
    },
  })

  return success(res, { ...teacher, classes: [] }, '创建成功', 201)
}))

/**
 * PUT /api/admin/teachers/:id
 */
router.put('/:id', adminOnly, asyncHandler(async (req: TeacherRequest, res) => {
  const id = parseInt(req.params.id as string)
  const { name, isAdmin, password } = req.body

  const updateData: any = {}
  if (name !== undefined) updateData.name = name
  if (isAdmin !== undefined) updateData.isAdmin = isAdmin
  if (password) updateData.password = await bcrypt.hash(password, 10)

  const teacher = await prisma.teacher.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      username: true,
      name: true,
      isAdmin: true,
      createdAt: true,
      classes: {
        select: {
          class: { select: { id: true, name: true } }
        }
      }
    },
  })

  return success(res, {
    ...teacher,
    classes: teacher.classes.map(tc => tc.class),
  })
}))

/**
 * DELETE /api/admin/teachers/:id
 */
router.delete('/:id', adminOnly, asyncHandler(async (req: TeacherRequest, res) => {
  const id = parseInt(req.params.id as string)

  if (id === req.teacher!.teacherId) {
    return res.status(400).json({ success: false, message: '不能删除自己' })
  }

  // 检查教师是否存在
  const teacher = await prisma.teacher.findUnique({ where: { id } })
  if (!teacher) {
    return res.status(404).json({ success: false, message: '教师不存在' })
  }

  // 删除教师相关的班级关联
  await prisma.$transaction([
    prisma.classTeacher.deleteMany({ where: { teacherId: id } }),
    prisma.teacher.delete({ where: { id } }),
  ])

  return res.status(200).json({ success: true, message: '删除成功' })
}))

export default router

