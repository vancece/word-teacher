import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

export const wordPackTool: McpTool = {
  name: 'queryWordPacks',
  description: '查询单词包列表或详情。可按游戏类型筛选（shooter=保卫城堡, match=魔法配对, spell=美食餐车, miner=黄金矿工）。指定 packId 可查看包含的具体单词。',
  inputSchema: {
    type: 'object',
    properties: {
      gameType: {
        type: 'string',
        enum: ['shooter', 'match', 'spell', 'miner'],
        description: '按游戏类型筛选',
      },
      packId: { type: 'number', description: '查看指定单词包的详情（含所有单词）' },
    },
  },

  async execute(args, context) {
    if (args.packId) {
      const res = await fetch(`${context.backendUrl}/internal/word-packs/${args.packId}`, {
        headers: context.headers,
      })
      if (!res.ok) return toolError('查询单词包详情失败')
      const data = await res.json() as { data: unknown }
      return toolOk(JSON.stringify(data.data, null, 2))
    }

    const params = new URLSearchParams()
    if (args.gameType) params.set('gameType', args.gameType)

    const res = await fetch(`${context.backendUrl}/internal/word-packs?${params}`, {
      headers: context.headers,
    })
    if (!res.ok) return toolError('查询单词包列表失败')
    const data = await res.json() as { data: unknown }
    return toolOk(JSON.stringify(data.data, null, 2))
  },
}
