import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

/**
 * 学号格式：8-12 位纯数字
 * 推荐格式: 入学年份(4) + 班级序号(2) + 学生序号(2~4)
 * 例: 2026050101 = 2026年 05班 01号
 */
const STUDENT_NO_REGEX = /^\d{8,12}$/
const STUDENT_NO_FORMAT_DESC = '8-12 位纯数字，推荐格式: 入学年份(4)+班级号(2)+学生序号(2~4)，例如 2026050101'

/**
 * 教师账号格式：小写字母开头，3-20 位，仅允许小写字母、数字和下划线
 * 例: wang_li, teacher01, xiaomei
 */
const TEACHER_USERNAME_REGEX = /^[a-z][a-z0-9_]{2,19}$/
const TEACHER_USERNAME_FORMAT_DESC = '小写字母开头，3-20 位，仅允许小写字母/数字/下划线，例如 wang_li、teacher01'

export const createStudentTool: McpTool = {
  name: 'createStudent',
  description: `创建新学生。学号格式要求：${STUDENT_NO_FORMAT_DESC}。不传密码则默认为学号后6位。必须指定班级ID。`,
  inputSchema: {
    type: 'object',
    properties: {
      studentNo: {
        type: 'string',
        description: `学号（${STUDENT_NO_FORMAT_DESC}）`,
        pattern: STUDENT_NO_REGEX.source,
      },
      name: { type: 'string', description: '学生姓名（1-20字符）' },
      classId: { type: 'number', description: '所属班级的 ID（必填）' },
      password: { type: 'string', description: '初始密码（可选，默认为学号后6位）' },
      seatNo: { type: 'number', description: '座位号（可选）' },
    },
    required: ['studentNo', 'name', 'classId'],
  },

  async execute(args, context) {
    const { studentNo, name, classId, password, seatNo } = args

    // 前置校验（在工具层拦截，避免无效请求）
    if (!STUDENT_NO_REGEX.test(studentNo)) {
      return toolError(`学号格式错误！要求：${STUDENT_NO_FORMAT_DESC}，收到: "${studentNo}"`)
    }
    if (!name || name.trim().length === 0 || name.trim().length > 20) {
      return toolError('姓名不合法：需要 1-20 个字符')
    }
    if (!classId || isNaN(Number(classId))) {
      return toolError('班级 ID 必须是数字')
    }

    const res = await fetch(`${context.backendUrl}/internal/students/create`, {
      method: 'POST',
      headers: { ...context.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentNo, name, classId, password, seatNo }),
    })

    const data = await res.json() as { success: boolean; message?: string; data?: unknown }

    if (!res.ok || !data.success) {
      return toolError(data.message || '创建学生失败')
    }

    return toolOk(data.message || JSON.stringify(data.data, null, 2))
  },
}

export const createTeacherTool: McpTool = {
  name: 'createTeacher',
  description: `创建新教师。账号格式要求：${TEACHER_USERNAME_FORMAT_DESC}。不传密码则默认为 123456。`,
  inputSchema: {
    type: 'object',
    properties: {
      username: {
        type: 'string',
        description: `教师账号（${TEACHER_USERNAME_FORMAT_DESC}）`,
        pattern: TEACHER_USERNAME_REGEX.source,
      },
      name: { type: 'string', description: '教师姓名（1-20字符）' },
      password: { type: 'string', description: '初始密码（可选，默认 123456）' },
      isAdmin: { type: 'boolean', description: '是否管理员（默认 false）' },
    },
    required: ['username', 'name'],
  },

  async execute(args, context) {
    const { username, name, password, isAdmin } = args

    // 前置校验
    if (!TEACHER_USERNAME_REGEX.test(username)) {
      return toolError(`教师账号格式错误！要求：${TEACHER_USERNAME_FORMAT_DESC}，收到: "${username}"`)
    }
    if (!name || name.trim().length === 0 || name.trim().length > 20) {
      return toolError('姓名不合法：需要 1-20 个字符')
    }

    const res = await fetch(`${context.backendUrl}/internal/teachers/create`, {
      method: 'POST',
      headers: { ...context.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, name, password, isAdmin }),
    })

    const data = await res.json() as { success: boolean; message?: string; data?: unknown }

    if (!res.ok || !data.success) {
      return toolError(data.message || '创建教师失败')
    }

    return toolOk(data.message || JSON.stringify(data.data, null, 2))
  },
}
