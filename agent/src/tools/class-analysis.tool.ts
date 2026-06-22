import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

export const classAnalysisTool: McpTool = {
  name: 'classAnalysis',
  description: '班级数据分析工具，支持多种分析模式：成绩排名(ranking)、班级报告(report)、进步趋势(progress)、成绩统计(stats，含平均分/中位数/标准差)。',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['ranking', 'report', 'progress', 'stats'],
        description: '分析模式：ranking=成绩排名, report=班级综合报告, progress=进步趋势, stats=成绩统计(平均分/中位数/标准差)',
      },
      classId: { type: 'number', description: '班级ID（report/stats模式必填，其他可选）' },
      studentId: { type: 'number', description: '学生ID（progress模式下查看单个学生）' },
      type: {
        type: 'string',
        enum: ['dialogue', 'readAloud', 'game'],
        description: '练习类型：dialogue=对话, readAloud=跟读, game=游戏。默认 dialogue',
      },
      order: {
        type: 'string',
        enum: ['top', 'bottom'],
        description: '排名方向（ranking模式）：top=从高到低, bottom=从低到高。默认 top',
      },
      limit: { type: 'number', description: '返回条数（ranking模式），默认10' },
      startDate: { type: 'string', description: '起始日期 YYYY-MM-DD' },
      endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
      days: { type: 'number', description: '统计最近N天（与startDate/endDate二选一），默认7' },
    },
    required: ['mode'],
  },

  async execute(args, context) {
    const mode = args.mode as string

    if (mode === 'ranking') {
      const params = new URLSearchParams()
      if (args.classId) params.set('classId', String(args.classId))
      if (args.type) params.set('type', args.type)
      if (args.order) params.set('order', args.order)
      if (args.limit) params.set('limit', String(args.limit))
      if (args.startDate) params.set('startDate', args.startDate)
      if (args.endDate) params.set('endDate', args.endDate)

      const res = await fetch(`${context.backendUrl}/internal/class-ranking?${params}`, {
        headers: context.headers,
      })
      if (!res.ok) return toolError('查询排名失败')
      const data = await res.json() as { data: unknown }
      return toolOk(JSON.stringify(data.data, null, 2))
    }

    if (mode === 'report') {
      if (!args.classId) return toolError('report 模式需要提供 classId')
      const params = new URLSearchParams()
      params.set('classId', String(args.classId))
      if (args.startDate) params.set('startDate', args.startDate)
      if (args.endDate) params.set('endDate', args.endDate)
      if (args.days) params.set('days', String(args.days))

      const res = await fetch(`${context.backendUrl}/internal/class-report?${params}`, {
        headers: context.headers,
      })
      if (!res.ok) return toolError('获取班级报告失败')
      const data = await res.json() as { data: unknown }
      return toolOk(JSON.stringify(data.data, null, 2))
    }

    if (mode === 'progress') {
      if (args.studentId) {
        const params = new URLSearchParams()
        if (args.days) params.set('days', String(args.days))
        const res = await fetch(
          `${context.backendUrl}/internal/progress/student/${args.studentId}?${params}`,
          { headers: context.headers },
        )
        if (!res.ok) return toolError('查询学生进步失败')
        const data = await res.json() as { data: unknown }
        return toolOk(JSON.stringify(data.data, null, 2))
      }

      const params = new URLSearchParams()
      if (args.classId) params.set('classId', String(args.classId))
      if (args.days) params.set('days', String(args.days))
      const res = await fetch(`${context.backendUrl}/internal/progress/overview?${params}`, {
        headers: context.headers,
      })
      if (!res.ok) return toolError('查询进步概览失败')
      const data = await res.json() as { data: unknown }
      return toolOk(JSON.stringify(data.data, null, 2))
    }

    if (mode === 'stats') {
      if (!args.classId) return toolError('stats 模式需要提供 classId')
      const params = new URLSearchParams()
      params.set('classId', String(args.classId))
      if (args.type) params.set('type', args.type)
      if (args.startDate) params.set('startDate', args.startDate)
      if (args.endDate) params.set('endDate', args.endDate)
      if (args.days) params.set('days', String(args.days))

      const res = await fetch(`${context.backendUrl}/internal/score-stats?${params}`, {
        headers: context.headers,
      })
      if (!res.ok) return toolError('获取成绩统计失败')
      const data = await res.json() as { data: unknown }
      return toolOk(JSON.stringify(data.data, null, 2))
    }

    return toolError(`不支持的分析模式: ${mode}，可选: ranking/report/progress/stats`)
  },
}
