/**
 * 钉钉 AI 客服机器人服务
 * 独立于原有通知机器人，专门处理老师提问
 */
import crypto from 'crypto'
import { prisma } from '../config/database.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

// 钉钉机器人配置
const BOT_APP_KEY = process.env.DINGTALK_BOT_APP_KEY || ''
const BOT_APP_SECRET = process.env.DINGTALK_BOT_APP_SECRET || ''
const BOT_TOKEN = process.env.DINGTALK_BOT_TOKEN || ''

// 缓存 access_token
let cachedAccessToken = ''
let tokenExpireAt = 0

/**
 * 验证钉钉回调签名
 */
export function verifyDingTalkSign(timestamp: string, sign: string): boolean {
  if (!BOT_APP_SECRET) return false
  const stringToSign = `${timestamp}\n${BOT_APP_SECRET}`
  const hmac = crypto.createHmac('sha256', BOT_APP_SECRET)
  hmac.update(stringToSign)
  const computedSign = hmac.digest('base64')
  return computedSign === sign
}

/**
 * 获取钉钉 access_token（备用，部分 API 需要）
 */
async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpireAt) {
    return cachedAccessToken
  }

  const tokenRes = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appKey: BOT_APP_KEY,
      appSecret: BOT_APP_SECRET,
    }),
  })

  if (!tokenRes.ok) {
    throw new Error(`Failed to get DingTalk access token: ${tokenRes.status}`)
  }

  const data = await tokenRes.json() as { accessToken: string; expireIn: number }
  cachedAccessToken = data.accessToken
  tokenExpireAt = Date.now() + (data.expireIn - 300) * 1000 // 提前 5 分钟刷新
  return cachedAccessToken
}

/**
 * 通过钉钉 API 回复消息
 */
async function replyMessage(
  sessionWebhook: string,
  content: string,
  isMarkdown = true
): Promise<void> {
  const body = isMarkdown
    ? {
        msgtype: 'markdown',
        markdown: {
          title: 'AI 助手',
          text: content,
        },
      }
    : {
        msgtype: 'text',
        text: { content },
      }

  const res = await fetch(sessionWebhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    logger.error({ status: res.status, body: errText }, '[DingTalkBot] Reply failed')
  }
}

/**
 * 获取机器人关联的教师 ID
 * 优先用 env 配置的 ASSISTANT_BOT_USERNAME，找不到则用第一个管理员
 */
let cachedBotTeacherId: number | undefined

async function getBotTeacherId(): Promise<number | undefined> {
  if (cachedBotTeacherId) return cachedBotTeacherId

  const username = env.assistantBot.username
  if (username) {
    const teacher = await prisma.teacher.findFirst({ where: { username }, select: { id: true } })
    if (teacher) {
      cachedBotTeacherId = teacher.id
      logger.info({ teacherId: teacher.id, username }, '[DingTalkBot] Using configured bot teacher')
      return cachedBotTeacherId
    }
    logger.warn({ username }, '[DingTalkBot] Configured ASSISTANT_BOT_USERNAME not found, falling back to admin')
  }

  // 兜底：第一个管理员
  const admin = await prisma.teacher.findFirst({ where: { isAdmin: true }, select: { id: true } })
  if (admin) {
    cachedBotTeacherId = admin.id
    logger.info({ teacherId: admin.id }, '[DingTalkBot] Using first admin as bot teacher')
  }
  return cachedBotTeacherId
}

/**
 * 调用 Agent 获取 AI 回答（非流式，钉钉不支持流式）
 */
async function getAIAnswer(question: string, history: { role: string; content: string }[]): Promise<string> {
  const teacherId = await getBotTeacherId()

  const agentUrl = env.agent.url.replace('/api/agent', '')
  const agentRes = await fetch(`${agentUrl}/api/agent/assistant/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-api-key': env.agent.apiKey,
    },
    body: JSON.stringify({
      question,
      history: history.slice(-6),
      channel: 'dingtalk',
      teacherId,
    }),
  })

  if (!agentRes.ok) {
    logger.error({ status: agentRes.status }, '[DingTalkBot] Agent request failed')
    return '抱歉，AI 服务暂时不可用，请稍后再试或联系技术支持。'
  }

  const data = await agentRes.json() as { answer: string }
  return data.answer
}



/**
 * 处理钉钉机器人消息（主入口）
 */
export async function handleDingTalkBotMessage(body: any): Promise<void> {
  try {
    const {
      text,
      senderStaffId,
      senderNick,
      sessionWebhook,
      conversationType,
      conversationId,
    } = body

    // 提取消息内容（去掉 @机器人 的部分）
    let question = text?.content?.trim() || ''
    // 群聊中 @机器人 的消息格式可能包含前缀空格
    question = question.replace(/^\s+/, '')

    if (!question) {
      await replyMessage(sessionWebhook, '你好！我是 AI 助手 🤖\n\n有什么关于后台操作的问题都可以问我，比如：\n- 怎么筛选学生？\n- 怎么创建对话场景？\n- 数据面板怎么看？')
      return
    }

    logger.info({
      senderStaffId,
      senderNick,
      question,
      conversationType, // 1=单聊 2=群聊
    }, '[DingTalkBot] Received message')

    // 获取对话历史
    const existingConversation = await prisma.assistantConversation.findFirst({
      where: {
        channel: 'dingtalk',
        externalId: senderStaffId || conversationId,
      },
      orderBy: { updatedAt: 'desc' },
    })

    const history = existingConversation
      ? (existingConversation.messages as any[]).slice(-6)
      : []

    // 调用 AI 回答
    const answer = await getAIAnswer(question, history)

    // 回复钉钉
    await replyMessage(sessionWebhook, answer)

    // 保存对话记录
    const newMessages = [
      { role: 'user', content: question, timestamp: new Date().toISOString() },
      { role: 'assistant', content: answer, timestamp: new Date().toISOString() },
    ]

    if (existingConversation) {
      const messages = [...(existingConversation.messages as any[]), ...newMessages]
      await prisma.assistantConversation.update({
        where: { id: existingConversation.id },
        data: { messages },
      })
    } else {
      await prisma.assistantConversation.create({
        data: {
          channel: 'dingtalk',
          externalId: senderStaffId || conversationId,
          title: question.slice(0, 50),
          messages: newMessages,
        },
      })
    }

    logger.info({ senderNick, questionLen: question.length, answerLen: answer.length }, '[DingTalkBot] Replied')
  } catch (err) {
    logger.error({ error: err }, '[DingTalkBot] Handle message error')
  }
}

export function isDingTalkBotConfigured(): boolean {
  return !!(BOT_APP_KEY && BOT_APP_SECRET)
}
