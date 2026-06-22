/**
 * ToolRegistry 单元测试
 * 验证工具注册、执行、结果格式化、截断等核心逻辑
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { McpTool } from '../../src/tools/types.js'
import { toolOk, toolError } from '../../src/tools/types.js'

// 直接实例化 ToolRegistry（不导入全局单例，避免触发工具注册的副作用）
class ToolRegistry {
  private tools = new Map<string, McpTool>()

  register(tool: McpTool) {
    this.tools.set(tool.name, tool)
  }

  registerAll(tools: McpTool[]) {
    for (const tool of tools) {
      this.register(tool)
    }
  }

  getOpenAITools() {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))
  }

  async execute(name: string, argsStr: string, teacherId?: number): Promise<string> {
    const tool = this.tools.get(name)
    if (!tool) return `未知工具: ${name}`

    const args = JSON.parse(argsStr || '{}')
    const context = {
      backendUrl: 'http://localhost:3001/api',
      headers: { 'x-agent-api-key': 'test', 'Content-Type': 'application/json' },
      teacherId,
    }

    try {
      const result = await tool.execute(args, context)
      return this.formatResult(result)
    } catch (err) {
      const errorResult = toolError(`工具执行失败: ${(err as Error).message}`)
      return this.formatResult(errorResult)
    }
  }

  listToolNames(): string[] {
    return Array.from(this.tools.keys())
  }

  get size(): number {
    return this.tools.size
  }

  private formatResult(result: { content: { text: string }[] }): string {
    const text = result.content.map(c => c.text).join('\n')
    if (text.length > 3000) {
      return text.slice(0, 3000) + '\n... (数据过长已截断)'
    }
    return text
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry

  const mockTool: McpTool = {
    name: 'testTool',
    description: '一个测试工具',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '名称' },
      },
    },
    execute: async (args) => toolOk(`hello ${args.name}`),
  }

  const errorTool: McpTool = {
    name: 'errorTool',
    description: '会报错的工具',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => { throw new Error('boom') },
  }

  beforeEach(() => {
    registry = new ToolRegistry()
  })

  it('应正确注册工具', () => {
    registry.register(mockTool)
    expect(registry.size).toBe(1)
    expect(registry.listToolNames()).toEqual(['testTool'])
  })

  it('应支持批量注册', () => {
    registry.registerAll([mockTool, errorTool])
    expect(registry.size).toBe(2)
    expect(registry.listToolNames()).toContain('testTool')
    expect(registry.listToolNames()).toContain('errorTool')
  })

  it('应生成正确的 OpenAI tools 格式', () => {
    registry.register(mockTool)
    const tools = registry.getOpenAITools()

    expect(tools).toHaveLength(1)
    expect(tools[0].type).toBe('function')
    expect(tools[0].function.name).toBe('testTool')
    expect(tools[0].function.description).toBe('一个测试工具')
    expect(tools[0].function.parameters).toEqual(mockTool.inputSchema)
  })

  it('应正确执行工具并返回结果', async () => {
    registry.register(mockTool)
    const result = await registry.execute('testTool', '{"name":"世界"}')
    expect(result).toBe('hello 世界')
  })

  it('未知工具应返回错误信息', async () => {
    const result = await registry.execute('nonExist', '{}')
    expect(result).toBe('未知工具: nonExist')
  })

  it('工具抛异常应返回错误信息', async () => {
    registry.register(errorTool)
    const result = await registry.execute('errorTool', '{}')
    expect(result).toContain('工具执行失败')
    expect(result).toContain('boom')
  })

  it('应截断超长结果', async () => {
    const longTool: McpTool = {
      name: 'longTool',
      description: '返回超长内容',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => toolOk('x'.repeat(5000)),
    }
    registry.register(longTool)
    const result = await registry.execute('longTool', '{}')
    expect(result.length).toBeLessThan(3100)
    expect(result).toContain('数据过长已截断')
  })

  it('应透传 teacherId 到 context', async () => {
    let capturedTeacherId: number | undefined
    const captureTool: McpTool = {
      name: 'captureTool',
      description: '捕获 context',
      inputSchema: { type: 'object', properties: {} },
      execute: async (_args, context) => {
        capturedTeacherId = context.teacherId
        return toolOk('ok')
      },
    }
    registry.register(captureTool)
    await registry.execute('captureTool', '{}', 42)
    expect(capturedTeacherId).toBe(42)
  })
})
