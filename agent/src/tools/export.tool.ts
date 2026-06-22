import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

/**
 * 通用 Excel 导出工具
 * 支持两种模式：
 * 1. 数据模式：AI 直接传 sheets 数据（适合小数据量、自由组合）
 * 2. 查询模式：AI 传 source + 参数，Backend 内部查询生成（适合大数据量，省 token）
 */
export const exportToExcelTool: McpTool = {
  name: 'exportToExcel',
  description: `导出数据为 Excel 文件，返回下载链接（30分钟有效）。支持两种模式：
1. 查询模式（推荐，省token）：指定 source 和筛选参数，后端直接查询生成 Excel。
   可用 source: "studentScores"（学生成绩）
2. 数据模式：直接传 sheets 数组（适合小数据量或自定义内容）。
优先使用查询模式。`,
  inputSchema: {
    type: 'object',
    properties: {
      // 查询模式参数
      source: {
        type: 'string',
        enum: ['studentScores'],
        description: '查询模式：数据源类型。传此参数时使用查询模式，后端直接查数据生成 Excel',
      },
      params: {
        type: 'object',
        description: '查询模式的筛选参数。studentScores 支持: classId(number), type(all/dialogue/readAloud/game), startDate(YYYY-MM-DD), endDate(YYYY-MM-DD)。classId 不填时管理员导出全部，普通教师导出所属班级。',
      },
      // 数据模式参数
      title: {
        type: 'string',
        description: '数据模式：Excel 文件标题（用于文件名）',
      },
      sheets: {
        type: 'array',
        description: '数据模式：Sheet 数组，每项包含 name(sheet名), headers(表头数组), rows(二维数组)',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Sheet 名称' },
            headers: { type: 'array', items: { type: 'string' }, description: '表头列名数组' },
            rows: { type: 'array', items: { type: 'array' }, description: '数据行（二维数组）' },
          },
          required: ['name', 'headers', 'rows'],
        },
      },
    },
  },

  async execute(args, context) {
    const res = await fetch(`${context.backendUrl}/internal/export/excel`, {
      method: 'POST',
      headers: { ...context.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string }
      return toolError(err.message || '导出失败')
    }

    const data = await res.json() as { data: { downloadUrl: string; filename: string; message: string } }
    const { downloadUrl, filename, message } = data.data

    const baseUrl = context.backendUrl.replace('/api', '')
    const fullUrl = `${baseUrl}${downloadUrl}`

    return toolOk(JSON.stringify({ message, downloadUrl: fullUrl, filename }, null, 2))
  },
}
