import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

export const queryStudentsTool: McpTool = {
  name: 'queryStudents',
  description: '查询学生信息：按姓名/学号搜索、按班级筛选、查看单个学生详情（含最近练习记录）。',
  inputSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: '按姓名或学号搜索' },
      classId: { type: 'number', description: '按班级ID筛选' },
      studentId: { type: 'number', description: '查看指定学生的详细信息（含最近练习记录）' },
      limit: { type: 'number', description: '返回条数，默认10' },
    },
  },

  async execute(args, context) {
    // 查单个学生详情
    if (args.studentId) {
      const res = await fetch(`${context.backendUrl}/internal/students/${args.studentId}`, {
        headers: context.headers,
      })
      if (!res.ok) return toolError('查询失败')
      const data = await res.json() as { data: unknown }
      return toolOk(JSON.stringify(data.data, null, 2))
    }

    // 列表查询
    const params = new URLSearchParams()
    if (args.search) params.set('search', args.search)
    if (args.classId) params.set('classId', String(args.classId))
    params.set('limit', String(args.limit || 10))

    const res = await fetch(`${context.backendUrl}/internal/students?${params}`, {
      headers: context.headers,
    })
    if (!res.ok) return toolError('查询失败')
    const data = await res.json() as { data: unknown }
    return toolOk(JSON.stringify(data.data, null, 2))
  },
}

export const resetPasswordTool: McpTool = {
  name: 'resetStudentPassword',
  description: '重置学生密码为默认密码（学号后6位）。此操作会修改数据，请确认后执行。',
  inputSchema: {
    type: 'object',
    properties: {
      studentId: { type: 'number', description: '学生ID' },
      newPassword: { type: 'string', description: '新密码，不传则重置为学号后6位' },
    },
    required: ['studentId'],
  },

  async execute(args, context) {
    const res = await fetch(`${context.backendUrl}/internal/students/${args.studentId}/password`, {
      method: 'PUT',
      headers: context.headers,
      body: JSON.stringify({ password: args.newPassword }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return toolError((err as any).message || '重置密码失败')
    }

    const data = await res.json() as { data: unknown }
    return toolOk(JSON.stringify(data.data, null, 2))
  },
}
