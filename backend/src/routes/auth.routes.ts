/**
 * 学生端认证兼容路由
 * /api/auth/* - 兼容旧的 API 调用
 *
 * 注：主要认证逻辑在 student/auth.routes.ts
 * 这里主要是 profile、learning-history、my-summary 等接口
 */
import { Router } from 'express'
import { prisma } from '../config/database.js'
import { success, error } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { env } from '../config/env.js'
import type { AuthRequest } from '../types/index.js'

const router = Router()

/**
 * GET /api/auth/profile
 * 获取学生个人资料和学习统计
 */
router.get('/profile', authenticate, authorize('student'), asyncHandler(async (req: AuthRequest, res) => {
  const studentId = req.student!.studentId

  // 获取学生信息（使用新的 Student 表）
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      class: { select: { id: true, name: true, grade: true } },
    },
  })

  if (!student) {
    return error(res, '学生不存在', 404)
  }

  // 获取学习统计
  const [practiceStats, readAloudStats] = await Promise.all([
    // 对话练习统计
    prisma.practiceRecord.aggregate({
      where: { studentId },
      _count: { _all: true },
      _avg: { totalScore: true },
      _max: { totalScore: true },
    }),
    // 跟读练习统计
    prisma.readAloudRecord.aggregate({
      where: { studentId },
      _count: { _all: true },
      _avg: { totalScore: true },
      _max: { totalScore: true },
    }),
  ])

  // 获取完成数量
  const [practiceCompleted, readAloudCompleted] = await Promise.all([
    prisma.practiceRecord.count({ where: { studentId, status: 'COMPLETED' } }),
    prisma.readAloudRecord.count({ where: { studentId, status: 'COMPLETED' } }),
  ])

  return success(res, {
    user: {
      id: student.id,
      studentNo: student.studentNo,
      name: student.name,
      classId: student.classId,
      className: student.class?.name || null,
      class: student.class,
      createdAt: student.createdAt,
    },
    stats: {
      practiceCount: practiceStats._count._all,
      readAloudCount: readAloudStats._count._all,
      totalCount: practiceStats._count._all + readAloudStats._count._all,
      practiceCompleted,
      readAloudCompleted,
      practiceAvgScore: practiceStats._avg.totalScore ? Math.round(practiceStats._avg.totalScore) : null,
      practiceMaxScore: practiceStats._max.totalScore || null,
      readAloudAvgScore: readAloudStats._avg.totalScore ? Math.round(readAloudStats._avg.totalScore) : null,
      readAloudMaxScore: readAloudStats._max.totalScore || null,
    },
  })
}))

/**
 * GET /api/auth/learning-history
 * 获取学习历史记录
 */
router.get('/learning-history', authenticate, authorize('student'), asyncHandler(async (req: AuthRequest, res) => {
  const studentId = req.student!.studentId
  const type = req.query.type as 'dialogue' | 'readAloud' | undefined
  const page = parseInt(req.query.page as string) || 1
  const pageSize = parseInt(req.query.pageSize as string) || 20

  // 构建查询条件
  const where = { studentId }

  let items: any[] = []
  let total = 0

  if (type === 'dialogue' || !type) {
    // 对话练习记录
    const [dialogueRecords, dialogueTotal] = await Promise.all([
      prisma.practiceRecord.findMany({
        where,
        include: { scene: { select: { id: true, name: true, icon: true, grade: true } } },
        orderBy: { createdAt: 'desc' },
        skip: type === 'dialogue' ? (page - 1) * pageSize : 0,
        take: type === 'dialogue' ? pageSize : 50,
      }),
      prisma.practiceRecord.count({ where }),
    ])
    
    items.push(...dialogueRecords.map(r => ({
      id: r.id,
      type: 'dialogue' as const,
      sceneId: r.sceneId,
      sceneName: r.scene.name,
      sceneIcon: r.scene.icon,
      sceneGrade: r.scene.grade,
      totalScore: r.totalScore,
      status: r.status,
      roundsCompleted: r.roundsCompleted,
      createdAt: r.createdAt,
    })))
    
    if (type === 'dialogue') total = dialogueTotal
  }

  if (type === 'readAloud' || !type) {
    // 跟读练习记录
    const [readAloudRecords, readAloudTotal] = await Promise.all([
      prisma.readAloudRecord.findMany({
        where,
        include: { scene: { select: { id: true, name: true, grade: true } } },
        orderBy: { createdAt: 'desc' },
        skip: type === 'readAloud' ? (page - 1) * pageSize : 0,
        take: type === 'readAloud' ? pageSize : 50,
      }),
      prisma.readAloudRecord.count({ where }),
    ])

    items.push(...readAloudRecords.map(r => ({
      id: r.id,
      type: 'readAloud' as const,
      sceneId: r.sceneId,
      sceneName: r.scene.name,
      sceneIcon: null,
      sceneGrade: r.scene.grade,
      totalScore: r.totalScore,
      status: r.status,
      completedCount: r.completedCount,
      totalCount: r.totalCount,
      intonationScore: r.intonationScore,
      fluencyScore: r.fluencyScore,
      accuracyScore: r.accuracyScore,
      expressionScore: r.expressionScore,
      createdAt: r.createdAt,
    })))

    if (type === 'readAloud') total = readAloudTotal
  }

  // 如果是全部，按时间排序
  if (!type) {
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    total = items.length
    items = items.slice((page - 1) * pageSize, page * pageSize)
  }

  return success(res, {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
}))

/**
 * GET /api/auth/my-summary
 * 获取 AI 学习总结
 */
router.get('/my-summary', authenticate, authorize('student'), asyncHandler(async (req: AuthRequest, res) => {
  const studentId = req.student!.studentId

  // 获取学生最近的学习记录用于分析
  const [practiceRecords, readAloudRecords] = await Promise.all([
    prisma.practiceRecord.findMany({
      where: { studentId, status: 'COMPLETED' },
      include: { scene: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.readAloudRecord.findMany({
      where: { studentId, status: 'COMPLETED' },
      include: { scene: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  // 如果没有学习记录
  if (practiceRecords.length === 0 && readAloudRecords.length === 0) {
    return success(res, {
      strengths: [],
      weaknesses: [],
      overallComment: '你还没有完成任何练习哦！开始学习，让 AI 老师帮你分析进步空间吧！',
      suggestions: ['多多参与对话练习', '尝试跟读练习提高发音'],
    })
  }

  // 调用 Agent 服务获取 AI 总结
  try {
    const agentUrl = env.agent.url.replace('/api/agent', '')
    const response = await fetch(`${agentUrl}/api/agent/student/summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Api-Key': env.agent.apiKey,
      },
      body: JSON.stringify({
        practiceRecords: practiceRecords.map(r => ({
          sceneName: r.scene.name,
          totalScore: r.totalScore,
          pronunciationScore: r.pronunciationScore,
          grammarScore: r.grammarScore,
          fluencyScore: r.fluencyScore,
        })),
        readAloudRecords: readAloudRecords.map(r => ({
          sceneName: r.scene.name,
          totalScore: r.totalScore,
          intonationScore: r.intonationScore,
          fluencyScore: r.fluencyScore,
          accuracyScore: r.accuracyScore,
          expressionScore: r.expressionScore,
        })),
      }),
    })

    if (!response.ok) {
      throw new Error('Agent service error')
    }

    const data = await response.json()
    return success(res, data)
  } catch (err) {
    // 如果 Agent 失败，返回基本分析
    const avgPracticeScore = practiceRecords.length > 0
      ? practiceRecords.reduce((sum, r) => sum + (r.totalScore || 0), 0) / practiceRecords.length
      : 0
    const avgReadAloudScore = readAloudRecords.length > 0
      ? readAloudRecords.reduce((sum, r) => sum + (r.totalScore || 0), 0) / readAloudRecords.length
      : 0

    return success(res, {
      strengths: avgPracticeScore >= 70 ? ['对话练习表现不错'] : [],
      weaknesses: avgPracticeScore < 60 ? ['对话练习还需加强'] : [],
      overallComment: `你已完成 ${practiceRecords.length} 次对话练习和 ${readAloudRecords.length} 次跟读练习，继续加油！`,
      suggestions: ['保持每天练习的好习惯', '尝试更多不同场景的练习'],
    })
  }
}))

export default router

