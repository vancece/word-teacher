/**
 * 统计数据路由
 */
import { Router } from 'express'
import { prisma } from '../../config/database.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { success } from '../../utils/response.js'
import type { TeacherRequest } from '../../types/index.js'

const router = Router()

/**
 * GET /api/admin/stats
 * 获取统计数据
 */
router.get('/', asyncHandler(async (_req: TeacherRequest, res) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    totalStudents,
    totalTeachers,
    totalPractices,
    totalReadAlouds,
    todayPractices,
    todayReadAlouds,
    completedReadAlouds,
  ] = await Promise.all([
    prisma.student.count(),
    prisma.teacher.count(),
    prisma.practiceRecord.count(),
    prisma.readAloudRecord.count(),
    prisma.practiceRecord.count({ where: { createdAt: { gte: today } } }),
    prisma.readAloudRecord.count({ where: { createdAt: { gte: today } } }),
    prisma.readAloudRecord.count({ where: { status: 'COMPLETED' } }),
  ])

  // 计算平均分
  const avgScoreResult = await prisma.readAloudRecord.aggregate({
    _avg: { totalScore: true },
    where: { status: 'COMPLETED', totalScore: { not: null } },
  })

  // 获取班级数量
  const totalClasses = await prisma.class.count()

  return success(res, {
    totalStudents,
    totalTeachers,
    totalClasses,
    totalPractices,
    totalReadAlouds,
    todayPractices,
    todayReadAlouds,
    completedReadAlouds,
    avgScore: Math.round(avgScoreResult._avg.totalScore || 0),
  })
}))

export default router

