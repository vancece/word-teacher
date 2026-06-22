/**
 * MCP 工具注册中心
 * 自动发现并注册 tools 目录下的所有 *.tool.ts 文件
 */
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import type { McpTool, ToolContext, ToolResult } from './types.js'
import { toolError } from './types.js'
import { env } from '../config.js'

class ToolRegistry {
  private tools = new Map<string, McpTool>()

  /** 注册一个工具 */
  register(tool: McpTool) {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Tool "${tool.name}" already registered, overwriting`)
    }
    this.tools.set(tool.name, tool)
  }

  /** 批量注册 */
  registerAll(tools: McpTool[]) {
    for (const tool of tools) {
      this.register(tool)
    }
  }

  /** 获取所有工具（OpenAI tools 格式，直接传给 LLM） */
  getOpenAITools(): ChatCompletionTool[] {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))
  }

  /** 执行工具 */
  async execute(name: string, argsStr: string, teacherId?: number): Promise<string> {
    const tool = this.tools.get(name)
    if (!tool) {
      return `未知工具: ${name}`
    }

    const args = JSON.parse(argsStr || '{}')
    const context = this.buildContext(teacherId)

    try {
      const result = await tool.execute(args, context)
      return this.formatResult(result)
    } catch (err) {
      console.error(`[ToolRegistry] Tool "${name}" execution failed:`, err)
      const errorResult = toolError(`工具执行失败: ${(err as Error).message}`)
      return this.formatResult(errorResult)
    }
  }

  /** 列出所有已注册工具的名称 */
  listToolNames(): string[] {
    return Array.from(this.tools.keys())
  }

  get size(): number {
    return this.tools.size
  }

  private buildContext(teacherId?: number): ToolContext {
    const headers: Record<string, string> = {
      'x-agent-api-key': env.auth.apiKey,
      'Content-Type': 'application/json',
    }
    if (teacherId) {
      headers['x-teacher-id'] = String(teacherId)
    }
    return {
      backendUrl: env.backend.apiUrl,
      headers,
      teacherId,
    }
  }

  private formatResult(result: ToolResult): string {
    const text = result.content.map(c => c.text).join('\n')
    // 截断过长内容，节省 token
    if (text.length > 3000) {
      return text.slice(0, 3000) + '\n... (数据过长已截断)'
    }
    return text
  }
}

/** 全局单例 */
export const toolRegistry = new ToolRegistry()
