/**
 * 学生认证路由
 * /api/student/auth/*
 */
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../../config/database.js'
import { generateStudentToken } from '../../utils/jwt.js'
import { success, error, unauthorized } from '../../utils/response.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { authenticateStudent } from '../../middleware/auth.js'
import type { StudentRequest } from '../../types/index.js'

const router = Router()

// 登录验证 schema
const loginSchema = z.object({
  studentNo: z.string().min(1, '请输入学号'),
  password: z.string().min(1, '请输入密码'),
})

// 注册验证 schema
const registerSchema = z.object({
  studentNo: z.string().min(3, '学号至少3个字符').max(50),
  password: z.string().min(6, '密码至少6个字符').max(100),
  name: z.string().min(1, '请输入姓名').max(50),
  classId: z.number({ required_error: '请选择班级' }),
})

// 学生登录
router.post('/login', asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body)

  const student = await prisma.student.findUnique({
    where: { studentNo: data.studentNo },
    include: { class: { select: { name: true } } },
  })

  if (!student) {
    return unauthorized(res, '学号或密码错误')
  }

  const isValid = await bcrypt.compare(data.password, student.password)
  if (!isValid) {
    return unauthorized(res, '学号或密码错误')
  }

  const token = generateStudentToken({
    studentId: student.id,
    studentNo: student.studentNo,
    name: student.name,
    classId: student.classId,
  })

  return success(res, {
    student: {
      id: student.id,
      studentNo: student.studentNo,
      name: student.name,
      classId: student.classId,
      className: student.class.name,
    },
    token,
  }, '登录成功')
}))

// 学生注册
router.post('/register', asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body)

  // 检查学号是否已存在
  const existing = await prisma.student.findUnique({
    where: { studentNo: data.studentNo },
  })

  if (existing) {
    return error(res, '该学号已被注册', 409)
  }

  // 检查班级是否存在
  const classExists = await prisma.class.findUnique({
    where: { id: data.classId },
  })

  if (!classExists) {
    return error(res, '班级不存在', 400)
  }

  const hashedPassword = await bcrypt.hash(data.password, 10)

  const student = await prisma.student.create({
    data: {
      studentNo: data.studentNo,
      password: hashedPassword,
      name: data.name,
      classId: data.classId,
    },
    include: { class: { select: { name: true } } },
  })

  const token = generateStudentToken({
    studentId: student.id,
    studentNo: student.studentNo,
    name: student.name,
    classId: student.classId,
  })

  return success(res, {
    student: {
      id: student.id,
      studentNo: student.studentNo,
      name: student.name,
      classId: student.classId,
      className: student.class.name,
    },
    token,
  }, '注册成功', 201)
}))

// 获取当前学生信息
router.get('/me', authenticateStudent, asyncHandler(async (req: StudentRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { id: req.student!.studentId },
    include: { class: { select: { name: true } } },
  })

  if (!student) {
    return unauthorized(res, '学生不存在')
  }

  return success(res, {
    id: student.id,
    studentNo: student.studentNo,
    name: student.name,
    classId: student.classId,
    className: student.class.name,
    createdAt: student.createdAt,
  })
}))

// 获取班级列表（公开接口，用于注册时选择班级）
router.get('/classes', asyncHandler(async (_req, res) => {
  const classes = await prisma.class.findMany({
    select: { id: true, name: true, grade: true },
    orderBy: [{ grade: 'asc' }, { name: 'asc' }],
  })
  return success(res, classes)
}))

export default router

