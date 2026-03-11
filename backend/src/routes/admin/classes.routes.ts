/**
 * 班级管理路由
 */
import { Router } from 'express'
import { prisma } from '../../config/database.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { adminOnly } from '../../middleware/auth.js'
import { success } from '../../utils/response.js'
import type { TeacherRequest } from '../../types/index.js'

const router = Router()

/**
 * GET /api/admin/classes
 * 获取班级列表（非管理员只能看到自己负责的班级）
 */
router.get('/', asyncHandler(async (req: TeacherRequest, res) => {
  const { teacherId, isAdmin } = req.teacher!

  const where = isAdmin ? {} : {
    teachers: { some: { teacherId } }
  }

  const classes = await prisma.class.findMany({
    where,
    select: {
      id: true,
      name: true,
      grade: true,
      description: true,
      createdAt: true,
      _count: { select: { students: true } },
      teachers: {
        select: {
          teacher: { select: { id: true, name: true } }
        }
      }
    },
    orderBy: { name: 'asc' },
  })

  const result = classes.map(c => ({
    id: c.id,
    name: c.name,
    grade: c.grade,
    description: c.description,
    studentCount: c._count.students,
    teachers: c.teachers.map(t => t.teacher),
    createdAt: c.createdAt,
  }))

  return success(res, { classes: result })
}))

/**
 * POST /api/admin/classes
 * 创建班级（所有教师都可以创建，创建者自动成为负责人）
 */
router.post('/', asyncHandler(async (req: TeacherRequest, res) => {
  const { name, grade, description, teacherIds } = req.body
  const { teacherId, isAdmin } = req.teacher!

  if (!name || !grade) {
    return res.status(400).json({ success: false, message: '班级名称和年级不能为空' })
  }

  // 确定要关联的教师列表
  // 管理员可以指定任意教师，普通教师自动关联自己
  let finalTeacherIds: number[] = []
  if (isAdmin && teacherIds?.length > 0) {
    finalTeacherIds = teacherIds
  } else {
    // 非管理员：自动将创建者加入负责人
    finalTeacherIds = [teacherId]
  }

  const cls = await prisma.class.create({
    data: {
      name,
      grade,
      description,
      teachers: {
        create: finalTeacherIds.map((tid: number) => ({ teacherId: tid }))
      }
    },
    include: {
      teachers: {
        select: { teacher: { select: { id: true, name: true } } }
      }
    }
  })

  return success(res, {
    ...cls,
    teachers: cls.teachers.map(t => t.teacher),
  })
}))

/**
 * PUT /api/admin/classes/:id
 * 更新班级
 */
router.put('/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const id = parseInt(req.params.id as string)
  const { name, grade, description, teacherIds } = req.body
  const { teacherId, isAdmin } = req.teacher!

  if (!isAdmin) {
    const hasAccess = await prisma.classTeacher.findFirst({
      where: { classId: id, teacherId }
    })
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: '无权操作此班级' })
    }
  }

  await prisma.class.update({
    where: { id },
    data: { name, grade, description },
  })

  if (isAdmin && teacherIds !== undefined) {
    await prisma.classTeacher.deleteMany({ where: { classId: id } })
    if (teacherIds.length > 0) {
      await prisma.classTeacher.createMany({
        data: teacherIds.map((tid: number) => ({ classId: id, teacherId: tid }))
      })
    }
  }

  const cls = await prisma.class.findUnique({
    where: { id },
    include: {
      teachers: {
        select: { teacher: { select: { id: true, name: true } } }
      }
    }
  })

  return success(res, {
    ...cls,
    teachers: cls?.teachers.map(t => t.teacher) || [],
  })
}))

/**
 * DELETE /api/admin/classes/:id
 * 删除班级（管理员可删除任意班级，普通教师只能删除自己负责的班级）
 */
router.delete('/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const id = parseInt(req.params.id as string)
  const { teacherId, isAdmin } = req.teacher!

  // 非管理员需要检查是否是该班级的负责人
  if (!isAdmin) {
    const isTeacher = await prisma.classTeacher.findFirst({
      where: { classId: id, teacherId }
    })
    if (!isTeacher) {
      return res.status(403).json({ success: false, message: '只能删除自己负责的班级' })
    }
  }

  await prisma.class.delete({ where: { id } })
  res.status(204).send()
}))

export default router

