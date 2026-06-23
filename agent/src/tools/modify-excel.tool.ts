import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

/**
 * Excel 修改工具
 * 读取已导出的 Excel 文件，执行修改操作，返回新的下载链接
 */
export const modifyExcelTool: McpTool = {
  name: 'modifyExcel',
  description: `修改已导出的 Excel 文件（改列名、删列、排序、筛选等），返回修改后的新下载链接。
使用场景：用户拿到导出链接后想调整格式，如"把列名改成英文"、"删掉某列"、"按分数排序"等。
必须传入之前导出的 downloadUrl。`,
  inputSchema: {
    type: 'object',
    properties: {
      downloadUrl: {
        type: 'string',
        description: '之前导出 Excel 的下载链接路径（如 /api/internal/export/download/xxx.xlsx）',
      },
      sheetName: {
        type: 'string',
        description: '要修改的 Sheet 名称。不填则修改所有 Sheet',
      },
      operations: {
        type: 'array',
        description: '要执行的操作列表，按顺序执行',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['renameColumns', 'deleteColumns', 'reorderColumns', 'sortRows', 'filterRows'],
              description: '操作类型',
            },
            renameMap: {
              type: 'object',
              description: 'renameColumns: 列名映射，如 {"姓名":"Name", "总分":"Score"}',
            },
            columns: {
              type: 'array',
              items: { type: 'string' },
              description: 'deleteColumns: 要删除的列名数组；reorderColumns: 按此顺序重排列',
            },
            sortBy: {
              type: 'string',
              description: 'sortRows: 按哪列排序',
            },
            sortOrder: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'sortRows: 排序方向，默认 desc',
            },
            column: {
              type: 'string',
              description: 'filterRows: 按哪列筛选',
            },
            operator: {
              type: 'string',
              enum: ['equals', 'contains', 'gt', 'lt', 'gte', 'lte'],
              description: 'filterRows: 比较方式',
            },
            value: {
              type: ['string', 'number'],
              description: 'filterRows: 比较值',
            },
          },
          required: ['type'],
        },
      },
    },
    required: ['downloadUrl', 'operations'],
  },

  async execute(args, context) {
    const res = await fetch(`${context.backendUrl}/internal/export/modify-excel`, {
      method: 'POST',
      headers: { ...context.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string }
      return toolError(err.message || '修改 Excel 失败')
    }

    const data = await res.json() as { data: { downloadUrl: string; filename: string; message: string } }
    const { downloadUrl, filename, message } = data.data

    const baseUrl = context.backendUrl.replace('/api', '')
    const fullUrl = `${baseUrl}${downloadUrl}`

    return toolOk(JSON.stringify({ message, downloadUrl: fullUrl, filename }, null, 2))
  },
}
