import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

export const recordsTool: McpTool = {
  name: 'queryLearningRecords',
  description: '查询学习记录：支持列表查询（按类型/班级/姓名/日期筛选）和详情查询（提供 recordId 查看完整对话历史和评分）。注意："学习记录"不包含游戏，游戏记录请用 type=game。',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['dialogue', 'readAloud', 'game'],
        description: '记录类型：dialogue=对话练习, readAloud=跟读练习, game=单词游戏。老师说"学习记录"时查 dialogue+readAloud，说"游戏记录"时查 game',
      },
      classId: { type: 'number', description: '按班级ID筛选（如果知道ID）' },
      className: { type: 'string', description: '按班级名称筛选（如"3年级1班"），会自动匹配对应的班级ID。优先用这个，不需要用户提供classId' },
      search: { type: 'string', description: '按学生姓名搜索' },
      startDate: { type: 'string', description: '起始日期 YYYY-MM-DD' },
      endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
      limit: { type: 'number', description: '返回条数，默认10，最大50' },
      recordId: { type: 'number', description: '记录ID，提供此参数时查看该条记录的详细信息' },
      studentId: { type: 'number', description: '学生ID（查看详情时需配合 recordId 和 type 使用）' },
    },
  },

  async execute(args, context) {
    // 查看单条详情模式
    if (args.recordId && args.studentId && args.type) {
      const { type, studentId, recordId } = args
      const endpoint = type === 'dialogue'
        ? `/internal/students/${studentId}/practice-records/${recordId}`
        : `/internal/students/${studentId}/read-aloud-records/${recordId}`

      const res = await fetch(`${context.backendUrl}${endpoint}`, {
        headers: context.headers,
      })
      if (!res.ok) {
        if (res.status === 404) return toolError('记录不存在')
        return toolError('查询记录详情失败')
      }
      const data = await res.json() as { data: unknown }
      return toolOk(JSON.stringify(data.data, null, 2))
    }

    // 列表查询模式：如果传了 className 但没传 classId，先查 classId
    let classId = args.classId
    if (!classId && args.className) {
      const classRes = await fetch(`${context.backendUrl}/internal/query-db`, {
        method: 'POST',
        headers: { ...context.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: `SELECT id FROM classes WHERE name LIKE '%${args.className}%' LIMIT 1` }),
      })
      if (classRes.ok) {
        const classData = await classRes.json() as { data: { rows: { id: number }[] } }
        if (classData.data?.rows?.length > 0) {
          classId = classData.data.rows[0].id
        } else {
          return toolOk(`没有找到名称包含"${args.className}"的班级`)
        }
      }
    }

    const params = new URLSearchParams()
    if (args.type) params.set('type', args.type)
    if (classId) params.set('classId', String(classId))
    if (args.search) params.set('search', args.search)
    if (args.startDate) params.set('startDate', args.startDate)
    if (args.endDate) params.set('endDate', args.endDate)
    params.set('limit', String(args.limit || 10))

    const res = await fetch(`${context.backendUrl}/internal/learning-records?${params}`, {
      headers: context.headers,
    })
    if (!res.ok) return toolError('查询学习记录失败')
    const data = await res.json() as { data: unknown }
    return toolOk(JSON.stringify(data.data, null, 2))
  },
}
