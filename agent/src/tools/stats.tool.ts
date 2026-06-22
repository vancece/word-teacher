import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

export const statsTool: McpTool = {
  name: 'getOverviewStats',
  description: '获取平台整体数据概览：学生总数、教师总数、班级数、今日各类型练习次数。',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_args, context) {
    const res = await fetch(`${context.backendUrl}/internal/stats`, {
      headers: context.headers,
    })

    if (!res.ok) return toolError('获取统计数据失败')

    const data = await res.json() as { data: unknown }
    return toolOk(JSON.stringify(data.data, null, 2))
  },
}
