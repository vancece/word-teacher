import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

export const teacherTool: McpTool = {
  name: 'queryTeachers',
  description: '查询教师列表（含姓名、角色、负责的班级）。仅管理员账号调用时有数据，普通教师调用会返回空。',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_args, context) {
    const res = await fetch(`${context.backendUrl}/internal/teachers`, {
      headers: context.headers,
    })

    if (!res.ok) {
      if (res.status === 403) return toolOk('当前账号无权查看教师列表（仅管理员可查看）')
      return toolError('查询教师列表失败')
    }

    const data = await res.json() as { data: unknown }
    return toolOk(JSON.stringify(data.data, null, 2))
  },
}
