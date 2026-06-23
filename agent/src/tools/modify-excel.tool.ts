import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

/**
 * Excel 修改工具
 * 读取已导出的 Excel 文件，执行修改操作，返回新的下载链接
 */
export const modifyExcelTool: McpTool = {
  name: 'modifyExcel',
  description: `修改已导出的 Excel 文件，返回修改后的新下载链接。
支持操作：改列名、删列、重排列、排序、筛选、新增列、批量替换、删除Sheet、重命名Sheet、合并Sheet、加汇总行。
使用场景：用户拿到导出链接后想调整格式，如"把列名改成英文"、"删掉某列"、"按分数排序"、"加一列评级"等。
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
        description: '要修改的 Sheet 名称。不填则修改所有 Sheet（deleteSheet/renameSheet/mergeSheets 除外，它们需要指定目标）',
      },
      operations: {
        type: 'array',
        description: '要执行的操作列表，按顺序执行',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['renameColumns', 'deleteColumns', 'reorderColumns', 'sortRows', 'filterRows', 'addColumn', 'replaceValues', 'deleteSheet', 'renameSheet', 'mergeSheets', 'addSummaryRow'],
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
              description: 'filterRows/addColumn/replaceValues: 列名',
            },
            operator: {
              type: 'string',
              enum: ['equals', 'contains', 'gt', 'lt', 'gte', 'lte'],
              description: 'filterRows: 比较方式',
            },
            value: {
              type: ['string', 'number'],
              description: 'filterRows: 比较值；addColumn: 固定值填充',
            },
            headerName: {
              type: 'string',
              description: 'addColumn: 新列的表头名称',
            },
            formula: {
              type: 'object',
              description: 'addColumn: 条件公式，根据其他列的值生成内容。格式: {"sourceColumn":"总分", "rules":[{"gte":90,"label":"优秀"},{"gte":80,"label":"良好"},{"gte":60,"label":"及格"}], "default":"不及格"}',
              properties: {
                sourceColumn: { type: 'string', description: '参考的源列名' },
                rules: {
                  type: 'array',
                  description: '规则数组，按顺序匹配第一个满足的',
                  items: {
                    type: 'object',
                    properties: {
                      gte: { type: 'number' },
                      gt: { type: 'number' },
                      lte: { type: 'number' },
                      lt: { type: 'number' },
                      equals: { type: ['string', 'number'] },
                      contains: { type: 'string' },
                      label: { type: 'string', description: '匹配时填入的值' },
                    },
                  },
                },
                default: { type: 'string', description: '无规则匹配时的默认值' },
              },
            },
            searchValue: {
              type: 'string',
              description: 'replaceValues: 要查找的值',
            },
            replaceWith: {
              type: 'string',
              description: 'replaceValues: 替换为的值',
            },
            targetSheet: {
              type: 'string',
              description: 'deleteSheet: 要删除的 Sheet 名；renameSheet: 要重命名的 Sheet 名',
            },
            newName: {
              type: 'string',
              description: 'renameSheet: 新的 Sheet 名称',
            },
            sourceSheets: {
              type: 'array',
              items: { type: 'string' },
              description: 'mergeSheets: 要合并的 Sheet 名称列表，按顺序合并到第一个 Sheet',
            },
            summaryType: {
              type: 'string',
              enum: ['avg', 'sum', 'count', 'max', 'min'],
              description: 'addSummaryRow: 汇总方式，默认 avg',
            },
            summaryColumns: {
              type: 'array',
              items: { type: 'string' },
              description: 'addSummaryRow: 要汇总的列名。不填则汇总所有数字列',
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
