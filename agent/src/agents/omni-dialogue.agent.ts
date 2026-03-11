/**
 * Qwen-Omni 多模态对话 Agent
 * 支持音频输入和音频输出
 *
 * 两个阶段：
 * 1. 对话阶段 (Round 1-5): modalities: ['text', 'audio'] - 正常对话
 * 2. 评分阶段 (Round 6):   modalities: ['text'] - 只输出评分 JSON
 *
 * 语音识别优先使用阿里云 STT（成本更低），fallback 到 Qwen-Omni
 */
import { env } from '../config.js'

// 使用配置中的多模态对话模型
const MODEL_OMNI = env.models.omni
import { aliyunSttService } from '../services/aliyun-stt.service.js'

// Qwen-Omni 消息内容类型
// 支持格式: wav, mp3, amr, 3gp, 3gpp, aac, webm (实测 webm 可能不稳定)
type OmniContentItem =
  | { type: 'text'; text: string }
  | { type: 'input_audio'; input_audio: { data: string; format: string } }

interface OmniMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | OmniContentItem[]
}

export interface OmniChatRequest {
  sceneId: string
  sceneName: string
  sceneDescription?: string
  scenePrompt?: string           // 场景自定义 AI 提示词
  vocabulary?: string[]
  currentRound: number
  totalRounds: number
  history: Array<{ role: 'ai' | 'student'; content: string }>
  studentAudioBase64?: string    // 学生音频 Base64
  studentMessage?: string        // 或者文本消息
}

export interface OmniChatResponse {
  text: string           // AI 回复的文本
  audioBase64?: string   // AI 回复的音频 Base64
  isComplete: boolean
}

// 评分结果接口
export interface OmniEvaluationResult {
  totalScore: number
  vocabularyScore: number
  grammarScore: number
  communicationScore: number
  effortScore: number
  feedback: string
  strengths: string[]
  improvements: string[]
  studentUtterances: string[]  // 学生每轮说的内容（语音识别结果）
}

const SYSTEM_PROMPT = `You are Lily, a friendly English conversation partner.
Topic: "{sceneName}" - {sceneDescription}

**🚨 MOST IMPORTANT RULE - KEEP IT SHORT! 🚨**
⚠️ Your response MUST be 1-2 short sentences ONLY!
⚠️ Maximum 20 words total!
⚠️ DO NOT give long explanations or multiple suggestions!

**NEVER DO THESE:**
❌ NEVER introduce yourself after round 1
❌ NEVER say "Can you say...?" or "Repeat after me"
❌ NEVER give long teaching explanations
❌ NEVER list multiple tips or suggestions

**RULES:**
1. English ONLY!
2. 1-2 SHORT sentences only (max 20 words)
3. React naturally to what the student said
4. Round {currentRound} of {totalRounds}

{roundInstruction}
{scenePrompt}
Keep it simple and friendly!`

const ROUND_INSTRUCTIONS: Record<number, string> = {
  1: 'FIRST round: Say hi, introduce yourself as Lily, and ask ONE question (e.g., "Hi! I\'m Lily. What\'s your name?")',
  2: '⚠️ DO NOT say "I\'m Lily" again! Just respond to what they said and ask a follow-up question.',
  3: '⚠️ DO NOT introduce yourself! Share something brief about the topic, then ask what they think.',
  4: '⚠️ DO NOT say your name! This is the SECOND TO LAST round. Ask about their preferences or experiences.',
  5: `🛑🛑🛑 THIS IS THE FINAL CONVERSATION ROUND - YOU MUST SAY GOODBYE! 🛑🛑🛑

MANDATORY ACTIONS:
1. Briefly respond to what the student just said (1 sentence)
2. Say goodbye warmly, for example: "It was so nice chatting with you! You did great today! Bye bye! 👋"

❌ DO NOT ask any questions!
❌ DO NOT continue the conversation!
❌ DO NOT introduce yourself!

This conversation is ENDING. Say goodbye NOW!`,
}

// 评分阶段的 System Prompt - 严格评分标准
const EVALUATION_SYSTEM_PROMPT = `你是一位经验丰富的英语老师，正在评估小学生的英语对话练习。

## ⚠️ 重要：只评估学生说的内容！

你将看到一段对话历史，格式如下：
- **assistant**：是 AI 老师（Lily）说的内容 —— 不要评价这些！
- **user**：是学生说的内容 —— 只评价这些！

**你只能基于 user（学生）实际说的内容进行评分！**

## 背景信息
- 场景：{sceneName} - {sceneDescription}
- 目标词汇：{vocabulary}
- 学生年龄：小学生（6-12岁）

## 🚨 语言判断规则（最重要！最先执行！）

**第一步：判断学生说的是什么语言**
1. **英文**（包含英文单词/句子）→ 有效回复，进入正常评分
2. **中文**（只有中文字符，没有英文）→ 无效回复！所有项目最多30分！
3. **沉默/噪音**（如 "(silence)"、"(无法识别)"、"[学生未发言]"、"(语音输入)"、"🎤"）→ 无效！所有项目最多20分！

## 评分标准（每项0-100分）

### 语言无效时的处理
- **学生全程说中文**：所有项目最多30分，feedback必须提示"要用英语回答哦"
- **学生沉默或未发言**：所有项目最多20分，feedback鼓励开口

### 学生说英文时的评分（小学生标准，鼓励为主）

**1. 词汇运用** (0-100分) ⭐ 重点维度
- 50-64分：只用最基础词汇（hello, yes, no）
- 65-79分：使用了1-2个目标词汇
- 80-94分：使用了3个以上目标词汇
- 95-100分：自然使用所有目标词汇

**2. 语法准确** (0-100分) 💡 宽松评分，小学生语法错误很正常
- 60-74分：能表达意思，语法错误不影响理解
- 75-84分：大部分句子能理解，有一些小错误
- 85-94分：语法基本正确
- 95-100分：语法完美

**3. 交流能力** (0-100分) ⭐ 重点维度
- 50-64分：能用单词回应
- 65-79分：能用短句回答问题
- 80-94分：回答较好，有互动
- 95-100分：主动发起话题

**4. 努力程度** (0-100分)
- 50-64分：有尝试说英语
- 65-79分：积极回应每个问题
- 80-94分：一直使用英语交流
- 95-100分：回答详细有创意

## 你的任务

1. **先判断语言**：学生说的是英文、中文还是沉默
2. **studentUtterances**: 列出学生每轮实际说的内容
3. **各项评分**: 根据语言判断结果评分
4. **feedback**: 中文评语，诚实但鼓励
5. **strengths**: 2个做得好的地方
6. **improvements**: 2个需要改进的地方

## 输出格式

只返回JSON对象，不要markdown代码块：

{
  "studentUtterances": ["学生第1次说的", "学生第2次说的", ...],
  "totalScore": <0-100整数>,
  "vocabularyScore": <0-100整数>,
  "grammarScore": <0-100整数>,
  "communicationScore": <0-100整数>,
  "effortScore": <0-100整数>,
  "feedback": "<中文评语>",
  "strengths": ["亮点1", "亮点2"],
  "improvements": ["建议1", "建议2"]
}

## 反馈模板
- 学生说了英文且表现好："你的英语表达很棒！..."
- 学生说了英文但较少："你开始尝试用英语了，继续加油！..."
- 学生说中文："这次要记得用英语回答哦！我们是在练习英语口语，勇敢地说出来！"
- 学生沉默："这次你好像有点害羞没怎么开口说话哦，下次勇敢地尝试用英语回答吧！"

记住：先判断语言是否有效，然后再评分！`

export class OmniDialogueAgent {
  // 改为动态获取，避免模块加载时 env 还未初始化
  private get apiKey(): string {
    return env.openai.apiKey
  }

  private get baseUrl(): string {
    return env.openai.baseUrl
  }

  constructor() {
    // 不再在构造函数中缓存，改用 getter 动态获取
  }

  private buildSystemPrompt(request: OmniChatRequest): string {
    const roundInstruction = ROUND_INSTRUCTIONS[request.currentRound] || ''
    // 如果有自定义 prompt，格式化为额外指令
    const scenePromptSection = request.scenePrompt
      ? `\n**SCENE GUIDANCE:**\n${request.scenePrompt}\n`
      : ''

    return SYSTEM_PROMPT
      .replace('{sceneName}', request.sceneName)
      .replace('{sceneDescription}', request.sceneDescription || request.sceneName)
      .replace('{vocabulary}', request.vocabulary?.join(', ') || 'general vocabulary')
      .replace('{currentRound}', String(request.currentRound))
      .replace('{totalRounds}', String(request.totalRounds))
      .replace('{roundInstruction}', roundInstruction)
      .replace('{scenePrompt}', scenePromptSection)
  }

  private buildMessages(request: OmniChatRequest): OmniMessage[] {
    const messages: OmniMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(request) }
    ]

    // 添加历史消息
    console.log(`[OmniDialogue] History count: ${request.history.length}`)
    for (const msg of request.history) {
      console.log(`[OmniDialogue] History - ${msg.role}: ${msg.content.substring(0, 50)}...`)
      messages.push({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content,
      })
    }

    // 添加当前学生消息
    if (request.studentAudioBase64) {
      // 音频输入 - 前端已转换为 WAV 格式 (16kHz, 16-bit, mono)
      const audioData = request.studentAudioBase64.startsWith('data:')
        ? request.studentAudioBase64
        : `data:;base64,${request.studentAudioBase64}`

      console.log(`[OmniDialogue] Audio input length: ${request.studentAudioBase64.length} chars`)

      messages.push({
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: {
              data: audioData,
              format: 'wav',
            },
          },
        ],
      })
    } else if (request.studentMessage) {
      console.log(`[OmniDialogue] Text input: ${request.studentMessage}`)
      messages.push({ role: 'user', content: request.studentMessage })
    } else {
      console.log(`[OmniDialogue] Starting conversation (no input)`)
      messages.push({ role: 'user', content: '(Start the lesson)' })
    }

    return messages
  }

  /**
   * 识别学生的语音内容 - 用于评分时准确知道学生说了什么
   * 优先使用阿里云 STT（成本更低），如果失败则 fallback 到 Qwen-Omni
   */
  async transcribeStudentAudio(audioBase64: string): Promise<string> {
    console.log(`[OmniDialogue] Transcribing student audio, length: ${audioBase64.length}`)

    // 优先使用阿里云 STT（成本更低）
    if (aliyunSttService.isConfigured()) {
      console.log('[OmniDialogue] Using Aliyun STT for transcription')
      const result = await aliyunSttService.transcribe(audioBase64)
      if (result.success && result.text) {
        console.log(`[OmniDialogue] Aliyun STT transcribed: "${result.text}"`)
        return result.text
      }
      console.warn(`[OmniDialogue] Aliyun STT failed: ${result.error}, falling back to Qwen-Omni`)
    } else {
      console.log('[OmniDialogue] Aliyun STT not configured, using Qwen-Omni')
    }

    // Fallback 到 Qwen-Omni
    return this.transcribeWithQwenOmni(audioBase64)
  }

  /**
   * 使用 Qwen-Omni 进行语音识别（fallback 方案）
   */
  private async transcribeWithQwenOmni(audioBase64: string): Promise<string> {
    const audioData = audioBase64.startsWith('data:')
      ? audioBase64
      : `data:;base64,${audioBase64}`

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_OMNI,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'input_audio', input_audio: { data: audioData, format: 'wav' } },
              { type: 'text', text: 'Please transcribe exactly what the student said in English. If they spoke Chinese, transcribe it as Chinese. If you hear silence or just noise, respond with "(silence)". Output ONLY the transcription, nothing else.' },
            ],
          },
        ],
        modalities: ['text'],
        stream: true,
        temperature: 0.1,
      }),
    })

    if (!response.ok) {
      console.error('Qwen-Omni transcription failed:', response.status)
      return '(无法识别)'
    }

    let text = ''
    const reader = response.body?.getReader()
    if (!reader) return '(无法识别)'

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
          try {
            const chunk = JSON.parse(line.slice(6))
            const content = chunk.choices?.[0]?.delta?.content
            if (content) text += content
          } catch { /* ignore */ }
        }
      }
    }

    const result = text.trim() || '(silence)'
    console.log(`[OmniDialogue] Qwen-Omni transcribed: "${result}"`)
    return result
  }

  // 流式聊天：通过回调返回文字块和最终音频
  async chatStream(
    request: OmniChatRequest,
    onTextChunk: (text: string) => void,
    onAudioComplete: (audioBase64: string) => void
  ): Promise<{ text: string; isComplete: boolean; studentTranscription?: string }> {
    const messages = this.buildMessages(request)
    const isComplete = request.currentRound >= request.totalRounds

    // 如果有学生音频，先识别出来（用于后续评分）
    let studentTranscription: string | undefined
    if (request.studentAudioBase64) {
      studentTranscription = await this.transcribeStudentAudio(request.studentAudioBase64)
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_OMNI,
        messages,
        modalities: ['text', 'audio'],
        audio: { voice: 'Cherry', format: 'wav' },
        stream: true,
        stream_options: { include_usage: true },
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Qwen-Omni API error:', errorText)
      throw new Error(`Qwen-Omni API failed: ${response.status}`)
    }

    let text = ''
    let audioBase64 = ''

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const chunk = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string; audio?: { data?: string } } }>
            }

            const delta = chunk.choices?.[0]?.delta
            if (delta) {
              if (delta.content) {
                text += delta.content
                onTextChunk(delta.content)  // 实时回调文字
              }
              if (delta.audio?.data) {
                audioBase64 += delta.audio.data
              }
            }
          } catch { /* ignore */ }
        }
      }
    }

    // 文字流结束后，返回完整音频
    if (audioBase64) {
      onAudioComplete(audioBase64)
    }

    console.log(`[OmniDialogue] Stream complete - text: ${text.length}, audio: ${audioBase64.length}, transcription: ${studentTranscription || 'none'}`)
    return { text, isComplete, studentTranscription }
  }

  async chat(request: OmniChatRequest): Promise<OmniChatResponse> {
    const messages = this.buildMessages(request)
    const isComplete = request.currentRound >= request.totalRounds

    // 调试：打印发送的消息（隐藏音频数据）
    const debugMessages = messages.map(m => {
      if (typeof m.content === 'string') {
        return { role: m.role, content: m.content.substring(0, 200) + (m.content.length > 200 ? '...' : '') }
      }
      return { role: m.role, content: '[audio content]' }
    })
    console.log('[OmniDialogue] Sending messages:', JSON.stringify(debugMessages, null, 2))

    // Qwen-Omni 必须使用流式输出
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_OMNI,
        messages,
        modalities: ['text', 'audio'],
        audio: {
          voice: 'Cherry',  // 女性温柔声音，适合老师角色
          format: 'wav',
        },
        stream: true,  // 必须为 true
        stream_options: { include_usage: true },
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Qwen-Omni API error:', errorText)
      throw new Error(`Qwen-Omni API failed: ${response.status}`)
    }

    // 处理 SSE 流式响应
    let text = ''
    let audioBase64 = ''

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // 处理 SSE 格式的数据
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''  // 保留未完成的行

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const chunk = JSON.parse(data) as {
              choices?: Array<{
                delta?: {
                  content?: string
                  audio?: { data?: string }
                }
              }>
            }

            const delta = chunk.choices?.[0]?.delta
            if (delta) {
              // 收集文本
              if (delta.content) {
                text += delta.content
              }
              // 收集音频（分块拼接）
              if (delta.audio?.data) {
                audioBase64 += delta.audio.data
              }
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    console.log(`[OmniDialogue] Response - text length: ${text.length}, audio length: ${audioBase64.length}`)

    return {
      text,
      audioBase64: audioBase64 || undefined,
      isComplete
    }
  }

  /**
   * 评分阶段：只输出文本，不输出音频
   * 使用 Qwen-Omni 基于整个对话历史进行评分
   */
  async evaluateConversation(request: OmniChatRequest): Promise<OmniEvaluationResult> {
    console.log(`[OmniDialogue] Starting evaluation phase...`)

    // 构建评分的 system prompt
    const systemPrompt = EVALUATION_SYSTEM_PROMPT
      .replace('{sceneName}', request.sceneName)
      .replace('{sceneDescription}', request.sceneDescription || request.sceneName)
      .replace('{vocabulary}', request.vocabulary?.join(', ') || 'general vocabulary')

    // 构建消息：system + 完整对话历史 + 评分请求
    const messages: OmniMessage[] = [
      { role: 'system', content: systemPrompt }
    ]

    // 添加完整对话历史（包含音频）
    for (const msg of request.history) {
      messages.push({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content,
      })
    }

    // 添加评分请求
    messages.push({
      role: 'user',
      content: 'The conversation has ended. Please evaluate the student based on everything you heard them say. Provide your evaluation in the JSON format specified.'
    })

    // 调用 API - 只要文本，不要音频
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_OMNI,
        messages,
        modalities: ['text'],  // 只要文本，不生成音频！
        stream: true,
        stream_options: { include_usage: true },
        temperature: 0.3,  // 评分需要更稳定的输出
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Qwen-Omni evaluation API error:', errorText)
      throw new Error(`Qwen-Omni evaluation failed: ${response.status}`)
    }

    // 收集完整的文本响应
    let text = ''
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const chunk = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>
            }
            const content = chunk.choices?.[0]?.delta?.content
            if (content) text += content
          } catch { /* ignore */ }
        }
      }
    }

    console.log(`[OmniDialogue] Evaluation raw response: ${text.substring(0, 500)}...`)

    // 解析 JSON 响应
    try {
      // 清理可能的 markdown 代码块
      const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim()
      const result = JSON.parse(cleanedText)

      return {
        totalScore: result.totalScore ?? 60,
        vocabularyScore: result.vocabularyScore ?? 60,
        grammarScore: result.grammarScore ?? 60,
        communicationScore: result.communicationScore ?? 60,
        effortScore: result.effortScore ?? 60,
        feedback: result.feedback ?? '你做得很好！继续努力！',
        strengths: result.strengths ?? ['积极参与对话', '勇敢开口说英语'],
        improvements: result.improvements ?? ['继续扩展词汇量', '多使用完整句子'],
        studentUtterances: result.studentUtterances ?? [],
      }
    } catch (error) {
      console.error('Failed to parse evaluation response:', text)
      // 返回默认评分
      return {
        totalScore: 60,
        vocabularyScore: 60,
        grammarScore: 60,
        communicationScore: 60,
        effortScore: 60,
        feedback: '你完成了对话练习，继续加油！',
        strengths: ['完成了对话练习', '勇敢地用英语交流'],
        improvements: ['可以多使用目标词汇', '尝试说更完整的句子'],
        studentUtterances: [],
      }
    }
  }
}

export const omniDialogueAgent = new OmniDialogueAgent()

