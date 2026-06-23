/**
 * AI 助手 Agent
 * 使用 MCP 工具注册中心，LLM 通过 Chat Completions + Tools 调用
 */
import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { env } from '../config.js'
import { toolRegistry } from '../tools/index.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('assistant')

export interface AssistantChatRequest {
  question: string
  history?: { role: 'user' | 'assistant'; content: string }[]
  channel?: 'dingtalk' | 'admin_web'
  /** 当前教师 ID，用于权限过滤 */
  teacherId?: number
}

export type StreamEvent =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_start'; toolName: string; toolCallId: string; args: string }
  | { type: 'tool_end'; toolCallId: string; toolName: string; result: string }

function buildSystemPrompt(): string {
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const weekDay = weekDays[now.getDay()]

  return `你是"牛马小妹"——Echo Kid 英语口语训练平台的全能打工人。查数据、出报表、搞分析、答问题，脏活累活你全包。老师对你动嘴就行，就是不要找本人（你的创造者）。

当前时间：${dateStr}（星期${weekDay}）

平台简介：
- 面向小学生(6-12岁)的AI英语口语训练平台
- 核心功能：AI对话练习、跟读练习、单词游戏
- 单词游戏类型对照：保卫城堡=shooter、魔法配对=match、美食餐车=spell、黄金矿工=miner
- 管理后台功能：班级管理、学生管理、场景管理、词包管理、学习记录、数据统计

业务术语：
- "学习记录"= 对话练习(dialogue) + 跟读练习(readAloud)，不包含游戏
- "游戏记录"= 单词游戏(game)，存在独立的 word_game_records 表
- 老师说"学习记录"时只查 dialogue 和 readAloud，说"游戏记录/游戏成绩"时才查 game
- 班级命名规则：如"3年级1班"，可通过 classes 表的 name 字段模糊匹配，不需要用户提供 classId

回答风格：
1. 犀利直接，不绕弯子。问什么答什么，一针见血，别整那些客套废话
2. 数据说话，结论先行。先甩结论，再展开细节，每句判断都有数据撑腰
3. 细节控。数字精确到个位，时间精确到天，不说"大概""可能"这类模糊词——牛马做事要精准
4. 表格和列表是你的武器，大段文字是你的敌人。能用表格说清楚的事别写作文
5. 说人话。你的用户是普通小学老师，完全不懂技术。禁止出现任何技术词汇（表名、字段名、SQL、服务器、代码、配置、字段、接口等）。也禁止用否定句式强调技术无关的事（如"不用写代码""不配服务器""不改字段"），老师根本不知道这些是什么，提都不要提。直接用老师能听懂的话描述操作步骤
6. 简洁。没查到数据就一句话说结论，例如"3年级1班今天没有已完成的学习记录"。不要列排查清单、不要自证查询逻辑、不要主动追问是否查其他东西

工具选择策略（按优先级）：
1. 简单问候、闲聊 → 不调工具，直接回答
2. 操作类问题（怎么用、怎么做）→ searchKnowledge
3. 查学生信息 → queryStudents（按名字/学号/班级筛选）
4. 查学习记录 → queryLearningRecords（按类型/班级/日期筛选）
5. 班级分析对比 → classAnalysis（排名/报告/趋势/统计）
6. 生成学习报告 → getStudentSummary
7. 复杂统计、跨表关联、自定义聚合 → queryDatabase（写 SQL，仅在上面的专用工具无法满足时使用）
8. 导出 Excel → queryDatabase + exportExcel=true
9. 修改已导出的 Excel（改列名、删列、排序、筛选）→ modifyExcel（传入之前的下载链接 + 操作列表）
10. 修改操作 → resetStudentPassword / contentManage / createStudent / createTeacher（执行前先告知用户，等确认）

工作原则：
1. 优先用专用查询工具（queryStudents/queryLearningRecords/classAnalysis），它们更快更稳。只有专用工具无法满足需求时（比如需要跨表 JOIN、自定义聚合统计、特殊筛选条件），才用 queryDatabase 写 SQL
2. 执行修改操作前，先明确告知即将执行什么，等确认
3. 信息不足就直说缺什么，别瞎猜
4. 工具调用报错时（如 SQL 语法错误），分析错误信息调整参数重试，不要用相同参数反复重试
5. 查询结果为空是正常情况，直接告诉老师"没有查到数据"即可。禁止：过度解读空结果、猜测原因、编造异常警告、自作主张换条件重查。一次查询返回空就直接回复，不要再调工具
6. 导出 Excel：用 queryDatabase 并设 exportExcel=true。工具返回的下载链接必须原样输出，禁止修改、省略或自己编造链接
7. 修改 Excel：用户说"改个列名""删掉某列""按分数排序"时，用 modifyExcel 工具传入之前的下载链接和操作指令。修改后返回新链接
8. 数据可视化：当数据适合用图表展示时（趋势、分布、对比），在回答末尾附加 JSON 代码块：
\`\`\`chart
{"type":"bar|line|pie","title":"图表标题","xAxis":["标签1","标签2"],"series":[{"name":"系列名","data":[数值1,数值2]}]}
\`\`\`
支持 bar（柱状图）、line（折线图）、pie（饼图）。数据量≥3个点才用图表，少量数据用表格`
}

export class AssistantAgent {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({
      apiKey: env.openai.apiKey,
      baseURL: env.openai.baseUrl,
    })
  }

  /**
   * 非流式对话（钉钉等同步场景）
   */
  async chat(request: AssistantChatRequest): Promise<string> {
    const messages = this.buildMessages(request)
    const tools = toolRegistry.getOpenAITools()

    // 循环处理 tool calls（最多 5 轮）
    let accumulatedContent = ''
    for (let round = 0; round < 5; round++) {
      const response = await this.client.chat.completions.create({
        model: env.models.plus,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: 0.3,
      })

      const assistantMsg = response.choices[0].message

      // AI 可能同时返回 content 和 tool_calls，先累积 content
      if (assistantMsg.content) {
        accumulatedContent += assistantMsg.content
      }

      // 无 tool call，返回累积的文本
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        return accumulatedContent || ''
      }

      // 执行 tool calls
      messages.push(assistantMsg as unknown as ChatCompletionMessageParam)

      for (const toolCall of assistantMsg.tool_calls) {
        const tc = toolCall as { id: string; function: { name: string; arguments: string } }
        const result = await toolRegistry.execute(tc.function.name, tc.function.arguments, request.teacherId)
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        })
      }
    }

    // 超过轮次上限，生成最终回答
    const finalResponse = await this.client.chat.completions.create({
      model: env.models.plus,
      messages,
      temperature: 0.3,
    })
    return finalResponse.choices[0].message.content || ''
  }

  /**
   * 流式对话（Admin 后台 SSE）
   * yield 格式: { type, ... } 对象，由路由层序列化为 SSE
   */
  async *chatStream(request: AssistantChatRequest): AsyncGenerator<StreamEvent> {
    const messages = this.buildMessages(request)
    const tools = toolRegistry.getOpenAITools()

    log.info({ question: request.question, historyLen: request.history?.length ?? 0 }, 'chatStream start')

    // 处理 tool calls（最多 5 轮），每轮下发 tool_start / tool_end 事件
    for (let round = 0; round < 5; round++) {
      const response = await this.client.chat.completions.create({
        model: env.models.plus,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: 0.3,
      })

      const assistantMsg = response.choices[0].message

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        // 无 tool call，这是最终回答，作为 text 输出
        if (assistantMsg.content) {
          yield { type: 'text', content: assistantMsg.content }
          return
        }
        if (round > 0) return
        break
      }

      // 有 tool_calls 时，content 是思考过程，作为 thinking 事件发出
      if (assistantMsg.content) {
        yield { type: 'thinking', content: assistantMsg.content }
      }

      messages.push(assistantMsg as unknown as ChatCompletionMessageParam)

      for (const toolCall of assistantMsg.tool_calls) {
        const tc = toolCall as { id: string; function: { name: string; arguments: string } }

        log.info({ round, tool: tc.function.name, args: tc.function.arguments }, 'tool call start')

        yield { type: 'tool_start', toolName: tc.function.name, toolCallId: tc.id, args: tc.function.arguments }

        const result = await toolRegistry.execute(tc.function.name, tc.function.arguments, request.teacherId)

        const resultForClient = result.slice(0, 800)
        log.info({ round, tool: tc.function.name, resultLen: result.length, result: result.slice(0, 500) }, 'tool call end')
        yield { type: 'tool_end', toolCallId: tc.id, toolName: tc.function.name, result: resultForClient }

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        })
      }
    }

    // 流式生成最终回答，记录完整的 messages 便于排查
    const messagesSnapshot = messages.map((m: any) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content.slice(0, 300) : undefined,
      tool_calls: m.tool_calls?.map((tc: any) => ({ name: tc.function?.name, args: tc.function?.arguments })),
      tool_call_id: m.tool_call_id,
    }))
    log.info({ msgCount: messages.length, messages: messagesSnapshot }, 'final stream start')

    const stream = await this.client.chat.completions.create({
      model: env.models.plus,
      messages,
      temperature: 0.3,
      stream: true,
    })

    let fullResponse = ''
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        fullResponse += delta
        yield { type: 'text', content: delta }
      }
    }
    log.info({ responseLen: fullResponse.length, response: fullResponse.slice(0, 500) }, 'chatStream end')
  }

  private buildMessages(request: AssistantChatRequest): ChatCompletionMessageParam[] {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: buildSystemPrompt() },
    ]

    if (request.history) {
      for (const msg of request.history) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    messages.push({ role: 'user', content: request.question })
    return messages
  }
}

export const assistantAgent = new AssistantAgent()
