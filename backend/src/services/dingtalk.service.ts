/**
 * 钉钉机器人服务
 * 用于在学生完成练习后发送通知
 */
import crypto from 'crypto'

// 钉钉机器人配置（从环境变量读取）
const DINGTALK_WEBHOOK = 'https://oapi.dingtalk.com/robot/send'
const ACCESS_TOKEN = process.env.DINGTALK_ACCESS_TOKEN || ''
const SECRET = process.env.DINGTALK_SECRET || ''

/**
 * 生成钉钉签名
 */
function generateSign(): { timestamp: string; sign: string } {
  const timestamp = Date.now().toString()
  const stringToSign = `${timestamp}\n${SECRET}`
  const hmac = crypto.createHmac('sha256', SECRET)
  hmac.update(stringToSign)
  const sign = encodeURIComponent(hmac.digest('base64'))
  return { timestamp, sign }
}

/**
 * 发送钉钉消息
 */
async function sendMessage(content: object): Promise<boolean> {
  // 如果没配置钉钉，跳过通知
  if (!ACCESS_TOKEN || !SECRET) {
    console.log('[DingTalk] Skipped: DINGTALK_ACCESS_TOKEN or DINGTALK_SECRET not configured')
    return true
  }

  try {
    const { timestamp, sign } = generateSign()
    const url = `${DINGTALK_WEBHOOK}?access_token=${ACCESS_TOKEN}&timestamp=${timestamp}&sign=${sign}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(content),
    })

    const result = await response.json() as { errcode: number; errmsg: string }

    if (result.errcode !== 0) {
      console.error('[DingTalk] Send failed:', result.errmsg)
      return false
    }

    console.log('[DingTalk] Message sent successfully')
    return true
  } catch (error) {
    console.error('[DingTalk] Error:', error)
    return false
  }
}

// 100分制转换为星级（用于对话练习）
function scoreToStars(score: number): string {
  // 100分制转5星：0-39=1星, 40-59=2星, 60-74=3星, 75-89=4星, 90-100=5星
  let stars: number
  if (score >= 90) stars = 5
  else if (score >= 75) stars = 4
  else if (score >= 60) stars = 3
  else if (score >= 40) stars = 2
  else stars = 1
  return '⭐'.repeat(stars)
}

// 分数等级描述（100分制）
function getScoreLevel(score: number): string {
  if (score >= 90) return '优秀'
  if (score >= 75) return '良好'
  if (score >= 60) return '及格'
  return '需努力'
}

// 星级转换为星星字符（0-5星制）
function starsToEmoji(stars: number): string {
  const validStars = Math.max(0, Math.min(5, stars || 0))
  return validStars > 0 ? '⭐'.repeat(validStars) : '☆'
}

// 星级等级描述（0-5星制）
function getStarLevel(stars: number): string {
  if (stars >= 5) return '优秀'
  if (stars >= 4) return '良好'
  if (stars >= 3) return '及格'
  if (stars >= 1) return '需努力'
  return '未完成'
}

export interface DialoguePracticeNotification {
  studentName: string
  className: string
  sceneName: string
  totalScore: number
  vocabularyScore?: number
  grammarScore?: number
  communicationScore?: number
  effortScore?: number
  feedback?: string
  strengths?: string[]
  improvements?: string[]
}

export interface ReadAloudPracticeNotification {
  studentName: string
  className: string
  sceneName: string
  totalScore: number            // 总分 0-100
  intonationScore?: number      // 语音语调 0-100
  fluencyScore?: number         // 流利连贯 0-100
  accuracyScore?: number        // 准确完整 0-100
  expressionScore?: number      // 情感表现力 0-100
  feedback?: string
  strengths?: string[]
  improvements?: string[]
}

/**
 * 发送对话练习完成通知
 */
export async function notifyDialoguePracticeComplete(data: DialoguePracticeNotification): Promise<boolean> {
  const { studentName, className, sceneName, totalScore, feedback, strengths, improvements } = data

  const strengthsList = strengths?.length ? strengths.map(s => `✓ ${s}`).join('\n\n') : '暂无'
  const improvementsList = improvements?.length ? improvements.map(s => `→ ${s}`).join('\n\n') : '暂无'

  const markdown = {
    msgtype: 'markdown',
    markdown: {
      title: `🗣 ${studentName} 完成对话练习`,
      text: `${className} · ${studentName}

场景: ${sceneName}

&nbsp;

📊 **评分** ${totalScore}分 (${getScoreLevel(totalScore)})

词汇 ${data.vocabularyScore || 0}分 · 语法 ${data.grammarScore || 0}分 · 交流 ${data.communicationScore || 0}分 · 努力 ${data.effortScore || 0}分

&nbsp;

💬 **评语**

${feedback || '练习完成，继续加油！'}

&nbsp;

🌟 **亮点**

${strengthsList}

&nbsp;

📈 **建议**

${improvementsList}

&nbsp;

---

⏰ ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
    },
  }

  return sendMessage(markdown)
}

/**
 * 发送跟读练习完成通知（显示100分制真实分数）
 */
export async function notifyReadAloudPracticeComplete(data: ReadAloudPracticeNotification): Promise<boolean> {
  const { studentName, className, sceneName, totalScore, feedback, strengths, improvements } = data

  const strengthsList = strengths?.length ? strengths.map(s => `✓ ${s}`).join('\n\n') : '暂无'
  const improvementsList = improvements?.length ? improvements.map(s => `→ ${s}`).join('\n\n') : '暂无'

  const markdown = {
    msgtype: 'markdown',
    markdown: {
      title: `📖 ${studentName} 完成跟读练习 ${totalScore}分`,
      text: `${className} · ${studentName}

场景: ${sceneName}

&nbsp;

📊 **总评** ${totalScore}分 (${getScoreLevel(totalScore)})

&nbsp;

**分项评分**

语音语调: ${data.intonationScore || 0}分

流利连贯: ${data.fluencyScore || 0}分

准确完整: ${data.accuracyScore || 0}分

情感表现力: ${data.expressionScore || 0}分

&nbsp;

💬 **评语**

${feedback || '练习完成，继续加油！'}

&nbsp;

🌟 **亮点**

${strengthsList}

&nbsp;

📈 **建议**

${improvementsList}

&nbsp;

---

⏰ ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
    },
  }

  return sendMessage(markdown)
}

export default {
  notifyDialoguePracticeComplete,
  notifyReadAloudPracticeComplete,
}

