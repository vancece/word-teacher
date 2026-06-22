import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

export const scenesTool: McpTool = {
  name: 'queryScenes',
  description: '查询对话场景和跟读场景列表。可以看到所有已创建的练习场景（名称、描述、年级、创建者）。',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['dialogue', 'readAloud'],
        description: '场景类型：dialogue=对话场景, readAloud=跟读场景。不传返回两种。',
      },
    },
  },

  async execute(args, context) {
    const results: any = {}

    if (!args.type || args.type === 'dialogue') {
      const res = await fetch(`${context.backendUrl}/internal/scenes?type=dialogue`, {
        headers: context.headers,
      })
      if (res.ok) {
        const data = await res.json() as { data: unknown }
        results.dialogueScenes = data.data
      }
    }

    if (!args.type || args.type === 'readAloud') {
      const res = await fetch(`${context.backendUrl}/internal/scenes?type=readAloud`, {
        headers: context.headers,
      })
      if (res.ok) {
        const data = await res.json() as { data: unknown }
        results.readAloudScenes = data.data
      }
    }

    if (Object.keys(results).length === 0) return toolError('查询场景失败')
    return toolOk(JSON.stringify(results, null, 2))
  },
}
