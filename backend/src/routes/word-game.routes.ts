/**
 * 单词游戏结果上报路由
 * 统一接收各游戏的文本摘要，保存并发送钉钉通知
 */
import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authenticateStudent } from '../middleware/auth.js'
import { success, error } from '../utils/response.js'
import { notifyWordGameComplete } from '../services/dingtalk.service.js'
import type { StudentRequest } from '../types/index.js'
import { prisma } from '../config/database.js'

const router = Router()

/**
 * POST /api/word-game/result
 * 上报游戏结果
 */
router.post('/result', authenticateStudent, asyncHandler(async (req: StudentRequest, res) => {
  const student = req.student!
  const {
    gameType,     // 'shooter' | 'match' | 'spell' | 'miner'
    packName,     // 词包名称
    score,        // 分数
    summary,      // 文本摘要（每个游戏自己生成的结构化文本）
  } = req.body

  if (!gameType || !packName || score === undefined || !summary) {
    return error(res, '缺少必要参数: gameType, packName, score, summary')
  }

  // 写入数据库
  await prisma.wordGameRecord.create({
    data: {
      studentId: student.studentId,
      gameType,
      packName,
      score,
      summary,
    },
  })

  // 查找学生所在班级名
  const studentInfo = await prisma.student.findUnique({
    where: { id: student.studentId },
    include: { class: true },
  })

  const className = studentInfo?.class?.name || '未知班级'
  const studentName = student.name

  // 发送钉钉通知（异步，不阻塞响应）
  notifyWordGameComplete({
    studentName,
    className,
    gameType,
    packName,
    score,
    summary,
  }).catch(err => {
    console.error('[WordGame] DingTalk notification failed:', err)
  })

  return success(res, { reported: true })
}))

export default router
