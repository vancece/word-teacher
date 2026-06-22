/**
 * 钉钉 AI 客服机器人 Webhook 路由
 * 接收钉钉消息回调，不需要认证（钉钉直接 POST）
 */
import { Router } from 'express'
import { handleDingTalkBotMessage, verifyDingTalkSign, isDingTalkBotConfigured } from '../services/dingtalk-bot.service.js'
import { logger } from '../utils/logger.js'

const router = Router()

// POST /api/dingtalk-bot/webhook - 钉钉消息回调
router.post('/webhook', async (req, res) => {
  // 钉钉要求 3 秒内响应，先返回 200 再异步处理
  res.json({ success: true })

  if (!isDingTalkBotConfigured()) {
    logger.warn('[DingTalkBot] Bot not configured, skipping message')
    return
  }

  // 验证签名（可选，开发阶段可跳过）
  const timestamp = req.headers['timestamp'] as string
  const sign = req.headers['sign'] as string

  if (timestamp && sign) {
    if (!verifyDingTalkSign(timestamp, sign)) {
      logger.warn('[DingTalkBot] Invalid signature, ignoring message')
      return
    }
  }

  // 异步处理消息
  handleDingTalkBotMessage(req.body).catch(err => {
    logger.error({ error: err }, '[DingTalkBot] Unhandled error in message handler')
  })
})

export default router
