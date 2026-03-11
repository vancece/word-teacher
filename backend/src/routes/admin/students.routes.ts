/**
 * 学生管理路由
 */
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../../config/database.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { success } from '../../utils/response.js'
import type { TeacherRequest } from '../../types/index.js'

const router = Router()

/**
 * GET /api/admin/students
 * 获取学生列表
 */
router.get('/', asyncHandler(async (req: TeacherRequest, res) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 10
  const search = req.query.search as string || ''
  const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined
  const { teacherId, isAdmin } = req.teacher!

  let allowedClassIds: number[] | undefined
  if (!isAdmin) {
    const teacherClasses = await prisma.classTeacher.findMany({
      where: { teacherId },
      select: { classId: true }
    })
    allowedClassIds = teacherClasses.map(tc => tc.classId)
  }

  let classCondition: any = undefined
  if (classId) {
    if (!isAdmin && allowedClassIds && !allowedClassIds.includes(classId)) {
      return success(res, { students: [], total: 0, page, limit })
    }
    classCondition = classId
  } else if (!isAdmin && allowedClassIds) {
    classCondition = { in: allowedClassIds }
  }

  const where: any = {
    ...(classCondition && { classId: classCondition }),
    ...(search && {
      OR: [
        { name: { contains: search } },
        { studentNo: { contains: search } },
      ],
    }),
  }

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      select: {
        id: true,
        studentNo: true,
        name: true,
        classId: true,
        seatNo: true,
        class: { select: { id: true, name: true, grade: true } },
        createdAt: true,
        _count: {
          select: { practiceRecords: true, readAloudRecords: true },
        },
      },
      orderBy: [{ seatNo: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.student.count({ where }),
  ])

  const result = students.map((s: any) => ({
    id: s.id,
    studentNo: s.studentNo,
    name: s.name,
    classId: s.classId,
    seatNo: s.seatNo,
    className: s.class?.name || null,
    createdAt: s.createdAt,
    practiceCount: s._count.practiceRecords,
    readAloudCount: s._count.readAloudRecords,
  }))

  return success(res, { students: result, total, page, limit })
}))

/**
 * GET /api/admin/students/:id
 * 获取学生详情
 */
router.get('/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const id = parseInt(req.params.id as string)

  const student = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      studentNo: true,
      name: true,
      classId: true,
      class: { select: { id: true, name: true, grade: true } },
      createdAt: true,
    },
  })

  if (!student) {
    return res.status(404).json({ success: false, message: '学生不存在' })
  }

  const [readAloudRecords, practiceRecords] = await Promise.all([
    prisma.readAloudRecord.findMany({
      where: { studentId: id, status: 'COMPLETED' },
      include: { scene: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.practiceRecord.findMany({
      where: { studentId: id, status: 'COMPLETED' },
      include: { scene: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  return success(res, { student, readAloudRecords, practiceRecords })
}))

/**
 * DELETE /api/admin/students/:id
 */
router.delete('/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const id = parseInt(req.params.id as string)

  const student = await prisma.student.findUnique({
    where: { id },
  })

  if (!student) {
    return res.status(404).json({ success: false, message: '学生不存在' })
  }

  await prisma.student.delete({ where: { id } })
  res.status(204).send()
}))

/**
 * PUT /api/admin/students/:id/password
 */
router.put('/:id/password', asyncHandler(async (req: TeacherRequest, res) => {
  const id = parseInt(req.params.id as string)
  const { password } = req.body

  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, message: '密码长度至少6位' })
  }

  const student = await prisma.student.findUnique({
    where: { id },
  })

  if (!student) {
    return res.status(404).json({ success: false, message: '学生不存在' })
  }

  const hashedPassword = await bcrypt.hash(password, 10)
  await prisma.student.update({
    where: { id },
    data: { password: hashedPassword },
  })

  return success(res, null, '密码修改成功')
}))

/**
 * PUT /api/admin/students/:id
 */
router.put('/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const id = parseInt(req.params.id as string)
  const { seatNo, name } = req.body

  const student = await prisma.student.findUnique({
    where: { id },
  })

  if (!student) {
    return res.status(404).json({ success: false, message: '学生不存在' })
  }

  const updateData: any = {}
  if (seatNo !== undefined) {
    updateData.seatNo = seatNo ? parseInt(seatNo) : null
  }
  if (name !== undefined && name.trim()) {
    updateData.name = name.trim()
  }

  await prisma.student.update({
    where: { id },
    data: updateData,
  })

  return success(res, null, '更新成功')
}))

/**
 * POST /api/admin/students/batch
 */
router.post('/batch', asyncHandler(async (req: TeacherRequest, res) => {
  const { students, classId } = req.body as {
    students: Array<{ studentNo: string; name: string; password: string; seatNo?: number }>
    classId: number
  }

  if (!students || !Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ success: false, message: '请提供学生数据' })
  }

  if (!classId) {
    return res.status(400).json({ success: false, message: '请指定班级' })
  }

  const targetClass = await prisma.class.findUnique({ where: { id: classId } })
  if (!targetClass) {
    return res.status(404).json({ success: false, message: '班级不存在' })
  }

  const validStudents = students.filter(s => s.studentNo && s.name && s.password)
  if (validStudents.length === 0) {
    return res.status(400).json({ success: false, message: '没有有效的学生数据' })
  }

  const studentNos = validStudents.map(s => s.studentNo)
  const existingStudents = await prisma.student.findMany({
    where: { studentNo: { in: studentNos } },
    select: { studentNo: true },
  })
  const existingStudentNos = new Set(existingStudents.map(s => s.studentNo))

  const newStudents = validStudents.filter(s => !existingStudentNos.has(s.studentNo))
  const duplicateStudents = validStudents.filter(s => existingStudentNos.has(s.studentNo))

  let createdCount = 0
  if (newStudents.length > 0) {
    const hashedStudents = await Promise.all(
      newStudents.map(async (s) => ({
        studentNo: s.studentNo,
        name: s.name,
        password: await bcrypt.hash(s.password, 10),
        classId,
        seatNo: s.seatNo || null,
      }))
    )

    const result = await prisma.student.createMany({
      data: hashedStudents,
      skipDuplicates: true,
    })
    createdCount = result.count
  }

  return success(res, {
    total: validStudents.length,
    created: createdCount,
    duplicates: duplicateStudents.map(s => s.studentNo),
    skipped: students.length - validStudents.length,
  }, `成功导入 ${createdCount} 名学生`)
}))

export default router

