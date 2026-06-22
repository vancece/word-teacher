/**
 * MCP Tool 类型定义
 * 每个工具文件导出一个符合此接口的对象即可自动注册
 */

export interface McpTool {
  /** 工具唯一标识，如 "queryStudents" */
  name: string
  /** 工具描述，LLM 根据此决定何时调用 */
  description: string
  /** JSON Schema 格式的输入参数定义 */
  inputSchema: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
  /** 执行工具逻辑 */
  execute: (args: Record<string, any>, context: ToolContext) => Promise<ToolResult>
}

export interface ToolContext {
  /** Backend 内部 API 基础 URL，如 http://localhost:3001/api */
  backendUrl: string
  /** 请求 Backend 时携带的认证 headers（含 teacherId） */
  headers: Record<string, string>
  /** 当前操作的教师 ID（用于权限过滤） */
  teacherId?: number
}

export interface ToolResult {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

/** 便捷函数：构造成功结果 */
export function toolOk(text: string): ToolResult {
  return { content: [{ type: 'text', text }] }
}

/** 便捷函数：构造错误结果 */
export function toolError(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true }
}
