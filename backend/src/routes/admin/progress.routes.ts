/**
 * 进度追踪路由
 */
import { Router } from 'express'
import { prisma } from '../../config/database.js'
import { env } from '../../config/env.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { success } from '../../utils/response.js'
import { logger } from '../../utils/logger.js'
import type { TeacherRequest } from '../../types/index.js'

const router = Router()

// 辅助函数：按周聚合数据
function aggregateByWeek(records: any[], scoreField: string): any[] {
  const weekMap = new Map<string, { total: number; count: number }>()

  records.forEach(r => {
    const date = new Date(r.createdAt)
    const weekStart = new Date(date)
    weekStart.setDate(date.getDate() - date.getDay())
    const weekKey = weekStart.toISOString().split('T')[0]

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, { total: 0, count: 0 })
    }
    const week = weekMap.get(weekKey)!
    week.total += r[scoreField] || 0
    week.count++
  })

  return Array.from(weekMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, data]) => ({
      week,
      avgScore: Math.round((data.total / data.count) * 10) / 10,
      count: data.count,
    }))
}

// 辅助函数：计算进步幅度
function calculateImprovement(scores: number[]): number {
  if (scores.length < 2) return 0
  const recentCount = Math.min(5, Math.floor(scores.length / 2))
  const earlyScores = scores.slice(0, recentCount)
  const recentScores = scores.slice(-recentCount)
  const earlyAvg = earlyScores.reduce((a, b) => a + b, 0) / earlyScores.length
  const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length
  return Math.round((recentAvg - earlyAvg) * 10) / 10
}

/**
 * GET /api/admin/progress/overview
 */
router.get('/overview', asyncHandler(async (req: TeacherRequest, res) => {
  const { teacherId, isAdmin } = req.teacher!
  const { classId, days = '30', practiceType, sceneId } = req.query
  const daysNum = parseInt(days as string) || 30
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysNum)

  let allowedClassIds: number[] | undefined
  if (!isAdmin) {
    const teacherClasses = await prisma.classTeacher.findMany({
      where: { teacherId },
      select: { classId: true },
    })
    allowedClassIds = teacherClasses.map(tc => tc.classId)
  }

  const classWhere = allowedClassIds ? { id: { in: allowedClassIds } } : {}
  const classes = await prisma.class.findMany({
    where: classWhere,
    select: { id: true, name: true, grade: true },
    orderBy: { name: 'asc' },
  })

  const [dialogueScenes, readAloudScenes] = await Promise.all([
    prisma.scene.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.readAloudScene.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  const studentWhere: any = {}
  if (classId) {
    const parsedClassId = parseInt(classId as string)
    if (allowedClassIds && !allowedClassIds.includes(parsedClassId)) {
      return success(res, {
        classes: [], dialogueScenes: [], readAloudScenes: [],
        classStats: { studentCount: 0, activeCount: 0, participationRate: 0, totalPracticeCount: 0, totalReadAloudCount: 0, avgScore: 0, scoreTrend: 0 },
        progressData: [], students: [], needAttention: [], topPerformers: [],
      })
    }
    studentWhere.classId = parsedClassId
  } else if (allowedClassIds) {
    studentWhere.classId = { in: allowedClassIds }
  }

  const students = await prisma.student.findMany({
    where: studentWhere,
    select: { id: true, name: true, classId: true, class: { select: { name: true } } },
  })
  const studentIds = students.map(s => s.id)

  const practiceWhere: any = {
    studentId: { in: studentIds },
    status: 'COMPLETED',
    totalScore: { not: null },
    createdAt: { gte: startDate },
  }
  const readAloudWhere: any = { ...practiceWhere }

  if (sceneId) {
    practiceWhere.sceneId = sceneId as string
    readAloudWhere.sceneId = sceneId as string
  }

  const shouldFetchDialogue = !practiceType || practiceType === 'dialogue'
  const shouldFetchReadAloud = !practiceType || practiceType === 'readAloud'

  const [practiceRecords, readAloudRecords] = await Promise.all([
    shouldFetchDialogue ? prisma.practiceRecord.findMany({
      where: practiceWhere,
      select: { studentId: true, totalScore: true, createdAt: true, sceneId: true },
    }) : Promise.resolve([]),
    shouldFetchReadAloud ? prisma.readAloudRecord.findMany({
      where: readAloudWhere,
      select: { studentId: true, totalScore: true, createdAt: true, sceneId: true },
    }) : Promise.resolve([]),
  ])

  const totalPracticeCount = practiceRecords.length
  const totalReadAloudCount = readAloudRecords.length
  const allScores = [...practiceRecords, ...readAloudRecords].map(r => r.totalScore!).filter(Boolean)
  const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0

  const activeStudentIds = new Set([
    ...practiceRecords.map(r => r.studentId),
    ...readAloudRecords.map(r => r.studentId),
  ])
  const participationRate = students.length > 0 ? Math.round((activeStudentIds.size / students.length) * 100) : 0

  const progressData = aggregateByWeek([...practiceRecords, ...readAloudRecords], 'totalScore')

  let scoreTrend = 0
  if (progressData.length >= 2) {
    const lastWeek = progressData[progressData.length - 1]?.avgScore || 0
    const prevWeek = progressData[progressData.length - 2]?.avgScore || 0
    scoreTrend = Math.round((lastWeek - prevWeek) * 10) / 10
  }

  // 计算每个学生的统计数据
  const studentStats = students.map(student => {
    const sPractice = practiceRecords.filter(r => r.studentId === student.id)
    const sReadAloud = readAloudRecords.filter(r => r.studentId === student.id)
    const sAllScores = [...sPractice, ...sReadAloud].map(r => r.totalScore!).filter(Boolean)
    const sAvgScore = sAllScores.length > 0 ? Math.round(sAllScores.reduce((a, b) => a + b, 0) / sAllScores.length) : null

    const sortedScores = sAllScores.sort((a, b) => a - b)
    let improvement = 0
    if (sortedScores.length >= 4) {
      const half = Math.floor(sortedScores.length / 2)
      const earlyAvg = sortedScores.slice(0, half).reduce((a, b) => a + b, 0) / half
      const recentAvg = sortedScores.slice(-half).reduce((a, b) => a + b, 0) / half
      improvement = Math.round((recentAvg - earlyAvg) * 10) / 10
    }

    const allRecords = [...sPractice, ...sReadAloud]
    const lastPracticeDate = allRecords.length > 0
      ? new Date(Math.max(...allRecords.map(r => new Date(r.createdAt).getTime())))
      : null

    return {
      id: student.id,
      name: student.name,
      className: student.class?.name || '未分配',
      practiceCount: sPractice.length,
      readAloudCount: sReadAloud.length,
      totalCount: sPractice.length + sReadAloud.length,
      avgScore: sAvgScore,
      improvement,
      lastPracticeDate,
    }
  })

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const needAttention = studentStats.filter(s => {
    const noRecentPractice = !s.lastPracticeDate || new Date(s.lastPracticeDate) < sevenDaysAgo
    const declining = s.improvement < -5
    return noRecentPractice || declining
  }).slice(0, 5).map(s => ({
    ...s,
    reason: !s.lastPracticeDate || new Date(s.lastPracticeDate) < sevenDaysAgo ? '长时间未练习' : '成绩下滑'
  }))

  const topPerformers = studentStats
    .filter(s => s.avgScore !== null && s.totalCount >= 3)
    .sort((a, b) => {
      if (b.improvement !== a.improvement) return b.improvement - a.improvement
      return (b.avgScore || 0) - (a.avgScore || 0)
    })
    .slice(0, 5)
    .map(s => ({ ...s, highlight: s.improvement >= 5 ? '进步明显' : '成绩优秀' }))

  const sortedStudents = studentStats.sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))

  return success(res, {
    classes,
    dialogueScenes,
    readAloudScenes,
    classStats: { studentCount: students.length, activeCount: activeStudentIds.size, participationRate, totalPracticeCount, totalReadAloudCount, avgScore, scoreTrend },
    progressData,
    students: sortedStudents,
    needAttention,
    topPerformers,
  })
}))

/**
 * GET /api/admin/progress/student/:id
 */
router.get('/student/:id', asyncHandler(async (req: TeacherRequest, res) => {
  const studentId = parseInt(req.params.id as string)

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true, name: true, studentNo: true, classId: true,
      class: { select: { name: true } },
      createdAt: true
    },
  })

  if (!student) {
    return res.status(404).json({ success: false, message: '学生不存在' })
  }

  const [practiceRecords, readAloudRecords] = await Promise.all([
    prisma.practiceRecord.findMany({
      where: { studentId, status: 'COMPLETED', totalScore: { not: null } },
      include: { scene: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.readAloudRecord.findMany({
      where: { studentId, status: 'COMPLETED', totalScore: { not: null } },
      include: { scene: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const practiceProgress = practiceRecords.map(r => ({
    date: r.createdAt, score: r.totalScore, sceneName: r.scene.name,
    pronunciationScore: r.pronunciationScore, fluencyScore: r.fluencyScore, grammarScore: r.grammarScore,
  }))

  const readAloudProgress = readAloudRecords.map(r => ({
    date: r.createdAt, score: r.totalScore, sceneName: r.scene.name,
    intonationScore: r.intonationScore, fluencyScore: r.fluencyScore, accuracyScore: r.accuracyScore, expressionScore: r.expressionScore,
  }))

  const practiceAvg = practiceRecords.length > 0
    ? practiceRecords.reduce((sum, r) => sum + (r.totalScore || 0), 0) / practiceRecords.length : 0
  const readAloudAvg = readAloudRecords.length > 0
    ? readAloudRecords.reduce((sum, r) => sum + (r.totalScore || 0), 0) / readAloudRecords.length : 0

  const practiceImprovement = calculateImprovement(practiceRecords.map(r => r.totalScore || 0))
  const readAloudImprovement = calculateImprovement(readAloudRecords.map(r => r.totalScore || 0))

  return success(res, {
    student: { ...student, className: student.class?.name || null },
    stats: {
      practiceCount: practiceRecords.length,
      readAloudCount: readAloudRecords.length,
      practiceAvg: Math.round(practiceAvg * 10) / 10,
      readAloudAvg: Math.round(readAloudAvg * 10) / 10,
      practiceImprovement, readAloudImprovement,
    },
    practiceProgress, readAloudProgress,
  })
}))

/**
 * GET /api/admin/progress/student/:id/summary
 * AI 生成学习总结
 */
router.get('/student/:id/summary', asyncHandler(async (req: TeacherRequest, res) => {
  const studentId = parseInt(req.params.id as string)

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, studentNo: true, class: { select: { name: true } } },
  })

  if (!student) {
    return res.status(404).json({ success: false, message: '学生不存在' })
  }

  const className = student.class?.name || null

  const [practiceRecords, readAloudRecords] = await Promise.all([
    prisma.practiceRecord.findMany({
      where: { studentId, status: 'COMPLETED' },
      include: { scene: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.readAloudRecord.findMany({
      where: { studentId, status: 'COMPLETED' },
      include: { scene: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ])

  const practiceScores = practiceRecords.map(r => r.totalScore || 0).filter(s => s > 0)
  const readAloudScores = readAloudRecords.map(r => r.totalScore || 0).filter(s => s > 0)

  const practiceAvg = practiceScores.length > 0 ? practiceScores.reduce((sum, s) => sum + s, 0) / practiceScores.length : 0
  const readAloudAvg = readAloudScores.length > 0 ? readAloudScores.reduce((sum, s) => sum + s, 0) / readAloudScores.length : 0

  const calcTrend = (scores: number[]) => {
    if (scores.length < 4) return { trend: 'insufficient', change: 0 }
    const half = Math.floor(scores.length / 2)
    const firstHalf = scores.slice(0, half)
    const secondHalf = scores.slice(-half)
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
    const change = Math.round((secondAvg - firstAvg) * 10) / 10
    return { trend: change > 3 ? 'improving' : change < -3 ? 'declining' : 'stable', change, firstAvg: Math.round(firstAvg * 10) / 10, secondAvg: Math.round(secondAvg * 10) / 10 }
  }

  const practiceTrend = calcTrend(practiceScores)
  const readAloudTrend = calcTrend(readAloudScores)

  const practiceMax = practiceScores.length > 0 ? Math.max(...practiceScores) : 0
  const practiceMin = practiceScores.length > 0 ? Math.min(...practiceScores) : 0
  const readAloudMax = readAloudScores.length > 0 ? Math.max(...readAloudScores) : 0
  const readAloudMin = readAloudScores.length > 0 ? Math.min(...readAloudScores) : 0

  const pronunciationScores = practiceRecords.map(r => r.pronunciationScore).filter((s): s is number => s !== null)
  const fluencyScores = practiceRecords.map(r => r.fluencyScore).filter((s): s is number => s !== null)
  const grammarScores = practiceRecords.map(r => r.grammarScore).filter((s): s is number => s !== null)
  const pronunciationAvg = pronunciationScores.length > 0 ? Math.round(pronunciationScores.reduce((a, b) => a + b, 0) / pronunciationScores.length) : 0
  const fluencyAvgScore = fluencyScores.length > 0 ? Math.round(fluencyScores.reduce((a, b) => a + b, 0) / fluencyScores.length) : 0
  const grammarAvgScore = grammarScores.length > 0 ? Math.round(grammarScores.reduce((a, b) => a + b, 0) / grammarScores.length) : 0

  const feedbackHistory: string[] = []
  practiceRecords.forEach(r => {
    const date = new Date(r.createdAt).toLocaleDateString('zh-CN')
    const feedback = r.feedbackText || ''
    if (feedback) {
      feedbackHistory.push(`[${date}] 对话练习「${r.scene.name}」- 总分${r.totalScore}分：${feedback}`)
    } else if (r.totalScore) {
      feedbackHistory.push(`[${date}] 对话练习「${r.scene.name}」- 总分${r.totalScore}分，发音${r.pronunciationScore}分，流利度${r.fluencyScore}分，语法${r.grammarScore}分`)
    }
  })

  readAloudRecords.forEach(r => {
    const date = new Date(r.createdAt).toLocaleDateString('zh-CN')
    const strengths = Array.isArray(r.strengths) ? (r.strengths as string[]).join('、') : ''
    const improvements = Array.isArray(r.improvements) ? (r.improvements as string[]).join('、') : ''
    const feedback = r.feedback || ''
    let text = `[${date}] 跟读练习「${r.scene.name}」- 总分${r.totalScore}分`
    if (feedback) text += `，评语：${feedback}`
    if (strengths) text += `，亮点：${strengths}`
    if (improvements) text += `，建议：${improvements}`
    feedbackHistory.push(text)
  })

  try {
    const response = await fetch(`${env.agent.url}/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Api-Key': env.agent.apiKey },
      body: JSON.stringify({
        studentName: student.name, className,
        practiceCount: practiceRecords.length, readAloudCount: readAloudRecords.length, totalCount: practiceRecords.length + readAloudRecords.length,
        practiceAvg: Math.round(practiceAvg * 10) / 10, readAloudAvg: Math.round(readAloudAvg * 10) / 10,
        practiceMax, practiceMin, readAloudMax, readAloudMin,
        practiceTrend, readAloudTrend,
        pronunciationAvg, fluencyAvg: fluencyAvgScore, grammarAvg: grammarAvgScore,
        feedbackHistory: feedbackHistory.slice(0, 25).join('\n') || '暂无评价记录',
      }),
    })

    if (!response.ok) throw new Error(`Agent service error: ${response.status}`)
    const result = await response.json() as { success: boolean; data: any }
    return success(res, result.data)
  } catch (error: any) {
    logger.error({ err: error }, '[Admin] Summary generation failed')
    return success(res, {
      strengths: ['积极参与英语学习'],
      weaknesses: ['需要更多练习机会'],
      overallComment: '该学生参与了英语练习，建议继续保持学习热情。',
      suggestions: ['坚持每天练习', '多进行口语训练'],
    })
  }
}))

export default router

