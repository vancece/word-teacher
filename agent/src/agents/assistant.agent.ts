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
  | { type: 'tool_start'; toolName: string; toolCallId: string; args: string }
  | { type: 'tool_end'; toolCallId: string; toolName: string; result: string }

const SYSTEM_PROMPT = `你是"Echo Kid"英语口语训练平台的智能助手。你的职责是帮助老师管理平台、查看数据、解答问题。

平台简介：
- 面向小学生(6-12岁)的AI英语口语训练平台
- 核心功能：AI对话练习、跟读练习、单词游戏（保卫城堡、魔法配对、美食餐车、黄金矿工）
- 管理后台功能：班级管理、学生管理、场景管理、词包管理、学习记录、数据统计

使用原则：
1. 用简洁友好的中文回答
2. 操作类问题先搜索知识库；数据类问题用查询工具
3. 执行修改操作（如重置密码）前，先告知用户即将执行什么操作
4. 如果信息不足，诚实告知
5. 回答简短精炼，数据用表格或列表展示
6. 简单打招呼不需要调工具
7. 导出 Excel：用 queryDatabase 并设 exportExcel=true。工具会返回包含下载链接的 Markdown 文本，你必须原样输出该链接，禁止修改、省略或自己编造链接
8. 数据可视化：当数据适合用图表展示时（如趋势、分布、对比），在回答末尾附加一个 JSON 代码块来描述图表，格式为：
\`\`\`chart
{"type":"bar|line|pie","title":"图表标题","xAxis":["标签1","标签2"],"series":[{"name":"系列名","data":[数值1,数值2]}]}
\`\`\`
支持的图表类型：bar（柱状图）、line（折线图）、pie（饼图）。只在数据量≥3个点时使用图表，少量数据用表格即可`

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

    // 循环处理 tool calls（最多 3 轮）
    for (let round = 0; round < 3; round++) {
      const response = await this.client.chat.completions.create({
        model: env.models.plus,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: 0.3,
      })

      const assistantMsg = response.choices[0].message

      // 无 tool call，直接返回文本
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        return assistantMsg.content || ''
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

    // 处理 tool calls（最多 3 轮），每轮下发 tool_start / tool_end 事件
    for (let round = 0; round < 3; round++) {
      const response = await this.client.chat.completions.create({
        model: env.models.plus,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: 0.3,
      })

      const assistantMsg = response.choices[0].message

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        // 工具调用后 AI 直接返回了文本，一次性输出即可（不再做多余的流式调用）
        if (round > 0 && assistantMsg.content) {
          log.info({ round, content: assistantMsg.content.slice(0, 500) }, 'tool round returned text directly')
          yield { type: 'text', content: assistantMsg.content }
          return
        }
        break
      }

      messages.push(assistantMsg as unknown as ChatCompletionMessageParam)

      for (const toolCall of assistantMsg.tool_calls) {
        const tc = toolCall as { id: string; function: { name: string; arguments: string } }

        log.info({ round, tool: tc.function.name, args: tc.function.arguments }, 'tool call start')

        // 通知前端工具开始调用
        yield { type: 'tool_start', toolName: tc.function.name, toolCallId: tc.id, args: tc.function.arguments }

        const result = await toolRegistry.execute(tc.function.name, tc.function.arguments, request.teacherId)

        // 通知前端工具调用完成（发送完整 result 给前端，截断到 800 字符以容纳导出链接 JSON）
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
      { role: 'system', content: SYSTEM_PROMPT },
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
