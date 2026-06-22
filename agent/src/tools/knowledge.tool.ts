import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

export const knowledgeTool: McpTool = {
  name: 'searchKnowledge',
  description: '搜索平台知识库，获取操作指引、功能说明、常见问题解答。当老师问如何操作、功能怎么用、遇到问题时调用。',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词，如"添加学生"、"重置密码"、"创建跟读场景"' },
    },
    required: ['query'],
  },

  async execute(args, context) {
    const params = new URLSearchParams({ query: args.query })

    const res = await fetch(`${context.backendUrl}/internal/knowledge/search?${params}`, {
      headers: context.headers,
    })

    if (!res.ok) return toolError('知识库服务不可用')

    const data = await res.json() as { success: boolean; data: any[] }
    if (!data.success || data.data.length === 0) {
      return toolOk('知识库中没有找到相关内容')
    }

    const text = data.data
      .map((r: any) => `【${r.category}】${r.title}\n${r.content}`)
      .join('\n\n---\n\n')

    return toolOk(text)
  },
}
