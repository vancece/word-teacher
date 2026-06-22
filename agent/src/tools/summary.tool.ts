import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

export const studentSummaryTool: McpTool = {
  name: 'getStudentSummary',
  description: '生成某个学生的 AI 学习总结报告，包括学习优势、需改进之处、个性化建议。注意：此操作会消耗额外的 AI token，请仅在老师明确要求总结时使用。',
  inputSchema: {
    type: 'object',
    properties: {
      studentId: { type: 'number', description: '学生ID' },
    },
    required: ['studentId'],
  },

  async execute(args, context) {
    const res = await fetch(`${context.backendUrl}/internal/progress/student/${args.studentId}/summary`, {
      headers: context.headers,
    })

    if (!res.ok) {
      if (res.status === 404) return toolError('学生不存在')
      return toolError('生成学习总结失败')
    }

    const data = await res.json() as { data: unknown }
    return toolOk(JSON.stringify(data.data, null, 2))
  },
}
