/**
 * 教师认证路由
 * /api/teacher/auth/*
 */
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../../config/database.js'
import { generateTeacherToken } from '../../utils/jwt.js'
import { success, error, unauthorized } from '../../utils/response.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { authenticateTeacher } from '../../middleware/auth.js'
import type { TeacherRequest } from '../../types/index.js'

const router = Router()

// 登录验证 schema
const loginSchema = z.object({
  username: z.string().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
})

// 教师登录
router.post('/login', asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body)

  const teacher = await prisma.teacher.findUnique({
    where: { username: data.username },
  })

  if (!teacher) {
    return unauthorized(res, '账号或密码错误')
  }

  const isValid = await bcrypt.compare(data.password, teacher.password)
  if (!isValid) {
    return unauthorized(res, '账号或密码错误')
  }

  const token = generateTeacherToken({
    teacherId: teacher.id,
    username: teacher.username,
    name: teacher.name,
    isAdmin: teacher.isAdmin,
  })

  return success(res, {
    teacher: {
      id: teacher.id,
      username: teacher.username,
      name: teacher.name,
      isAdmin: teacher.isAdmin,
    },
    token,
  }, '登录成功')
}))

// 获取当前教师信息
router.get('/me', authenticateTeacher, asyncHandler(async (req: TeacherRequest, res) => {
  const teacher = await prisma.teacher.findUnique({
    where: { id: req.teacher!.teacherId },
    include: {
      classes: {
        include: {
          class: { select: { id: true, name: true, grade: true } },
        },
      },
    },
  })

  if (!teacher) {
    return unauthorized(res, '教师不存在')
  }

  return success(res, {
    id: teacher.id,
    username: teacher.username,
    name: teacher.name,
    isAdmin: teacher.isAdmin,
    classes: teacher.classes.map((ct) => ct.class),
    createdAt: teacher.createdAt,
  })
}))

// 修改密码
router.put('/password', authenticateTeacher, asyncHandler(async (req: TeacherRequest, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6, '新密码至少6个字符'),
  })

  const data = schema.parse(req.body)

  const teacher = await prisma.teacher.findUnique({
    where: { id: req.teacher!.teacherId },
  })

  if (!teacher) {
    return unauthorized(res, '教师不存在')
  }

  const isValid = await bcrypt.compare(data.currentPassword, teacher.password)
  if (!isValid) {
    return error(res, '当前密码错误', 400)
  }

  const hashedPassword = await bcrypt.hash(data.newPassword, 10)

  await prisma.teacher.update({
    where: { id: teacher.id },
    data: { password: hashedPassword },
  })

  return success(res, null, '密码修改成功')
}))

export default router

