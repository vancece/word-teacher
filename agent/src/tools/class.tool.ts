import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

export const classTool: McpTool = {
  name: 'queryClasses',
  description: '查询班级列表和统计信息（班级名称、年级、学生数量、负责教师）。',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_args, context) {
    const res = await fetch(`${context.backendUrl}/internal/classes`, {
      headers: context.headers,
    })

    if (!res.ok) return toolError('查询班级失败')

    const data = await res.json() as { data: unknown }
    return toolOk(JSON.stringify(data.data, null, 2))
  },
}
