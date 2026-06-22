import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

export const contentManageTool: McpTool = {
  name: 'contentManage',
  description: '管理教学内容的上架/下架：修改对话场景、跟读场景、单词包的可见性。',
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        enum: ['dialogueScene', 'readAloudScene', 'wordPack'],
        description: '操作目标：dialogueScene=对话场景, readAloudScene=跟读场景, wordPack=单词包',
      },
      id: { type: 'string', description: '目标ID（场景为字符串ID，单词包为数字ID）' },
      visible: { type: 'boolean', description: '是否对学生可见（true=上架, false=下架）' },
    },
    required: ['target', 'id', 'visible'],
  },

  async execute(args, context) {
    const { target, id, visible } = args

    if (target === 'wordPack') {
      const res = await fetch(`${context.backendUrl}/internal/word-packs/${id}/visibility`, {
        method: 'PUT',
        headers: { ...context.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string }
        return toolError(err.message || '修改单词包可见性失败')
      }
      const data = await res.json() as { data: unknown }
      return toolOk(JSON.stringify(data.data, null, 2))
    }

    // 对话场景 or 跟读场景
    const type = target === 'dialogueScene' ? 'dialogue' : 'readAloud'
    const res = await fetch(`${context.backendUrl}/internal/scenes/${id}/visibility`, {
      method: 'PUT',
      headers: { ...context.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, visible }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string }
      return toolError(err.message || '修改场景可见性失败')
    }
    const data = await res.json() as { data: unknown }
    return toolOk(JSON.stringify(data.data, null, 2))
  },
}
