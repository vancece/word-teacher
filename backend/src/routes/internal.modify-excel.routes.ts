/**
 * Excel 修改路由
 * 读取已导出的 Excel 文件，执行修改操作（改列名、删列、排序、筛选），返回新的下载链接
 */
import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { logger } from '../utils/logger.js'
import ExcelJS from 'exceljs'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import type { Request, Response } from 'express'

const router = Router()

const EXPORT_DIR = path.resolve(process.cwd(), 'tmp/exports')

interface ModifyOperation {
  type: 'renameColumns' | 'deleteColumns' | 'reorderColumns' | 'sortRows' | 'filterRows'
  renameMap?: Record<string, string>
  columns?: string[]
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  column?: string
  operator?: 'equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte'
  value?: string | number
}

/**
 * POST /api/internal/export/modify-excel - 修改已导出的 Excel
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { downloadUrl, sheetName, operations } = req.body

  if (!downloadUrl || !operations || !Array.isArray(operations)) {
    return res.status(400).json({ success: false, message: '请提供 downloadUrl 和 operations' })
  }

  // 从 URL 提取文件名
  const filename = extractFilename(downloadUrl)
  if (!filename) {
    return res.status(400).json({ success: false, message: '无效的下载链接' })
  }

  const filepath = path.join(EXPORT_DIR, filename)
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ success: false, message: '文件不存在或已过期，请重新导出后再修改' })
  }

  // 读取 Excel
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filepath)

  // 确定要修改的 Sheet
  const sheetsToModify: ExcelJS.Worksheet[] = []
  if (sheetName) {
    const ws = workbook.getWorksheet(sheetName)
    if (!ws) {
      const available = workbook.worksheets.map(s => s.name).join(', ')
      return res.status(400).json({ success: false, message: `Sheet "${sheetName}" 不存在。可用的 Sheet: ${available}` })
    }
    sheetsToModify.push(ws)
  } else {
    workbook.worksheets.forEach(ws => sheetsToModify.push(ws))
  }

  // 对每个 Sheet 执行操作
  for (const ws of sheetsToModify) {
    for (const op of operations as ModifyOperation[]) {
      applyOperation(ws, op)
    }
  }

  // 保存为新文件
  const newFilename = `modified_${crypto.randomBytes(4).toString('hex')}.xlsx`
  const newFilepath = path.join(EXPORT_DIR, newFilename)
  await workbook.xlsx.writeFile(newFilepath)

  logger.info({ originalFile: filename, newFile: newFilename, operations: operations.map((o: ModifyOperation) => o.type) }, '[Export] Excel modified')

  const newDownloadUrl = `/api/internal/export/download/${encodeURIComponent(newFilename)}`
  res.json({
    success: true,
    data: {
      downloadUrl: newDownloadUrl,
      filename: newFilename,
      message: '已修改 Excel 文件，链接 30 分钟内有效',
    },
  })
}))

function extractFilename(url: string): string | null {
  // 支持多种 URL 格式：
  // /api/internal/export/download/xxx.xlsx
  // /api/admin/export/download/xxx.xlsx
  // https://xxx/api/internal/export/download/xxx.xlsx
  const match = url.match(/\/download\/([^/?#]+)/)
  if (!match) return null
  const filename = decodeURIComponent(match[1])
  // 安全检查
  if (filename.includes('..') || filename.includes('/')) return null
  return filename
}

function applyOperation(ws: ExcelJS.Worksheet, op: ModifyOperation) {
  switch (op.type) {
    case 'renameColumns':
      applyRenameColumns(ws, op.renameMap || {})
      break
    case 'deleteColumns':
      applyDeleteColumns(ws, op.columns || [])
      break
    case 'reorderColumns':
      applyReorderColumns(ws, op.columns || [])
      break
    case 'sortRows':
      applySortRows(ws, op.sortBy || '', op.sortOrder || 'desc')
      break
    case 'filterRows':
      applyFilterRows(ws, op.column || '', op.operator || 'equals', op.value)
      break
  }
}

function applyRenameColumns(ws: ExcelJS.Worksheet, renameMap: Record<string, string>) {
  const headerRow = ws.getRow(1)
  for (let col = 1; col <= ws.columnCount; col++) {
    const cell = headerRow.getCell(col)
    const currentName = String(cell.value || '')
    if (renameMap[currentName]) {
      cell.value = renameMap[currentName]
    }
  }
}

function applyDeleteColumns(ws: ExcelJS.Worksheet, columnsToDelete: string[]) {
  // 找到要删除的列索引（从大到小删，避免索引偏移）
  const headerRow = ws.getRow(1)
  const colIndices: number[] = []
  for (let col = 1; col <= ws.columnCount; col++) {
    const name = String(headerRow.getCell(col).value || '')
    if (columnsToDelete.includes(name)) {
      colIndices.push(col)
    }
  }
  // 从后往前删
  colIndices.sort((a, b) => b - a)
  for (const colIdx of colIndices) {
    ws.spliceColumns(colIdx, 1)
  }
}

function applyReorderColumns(ws: ExcelJS.Worksheet, newOrder: string[]) {
  const headerRow = ws.getRow(1)
  const totalRows = ws.rowCount
  const totalCols = ws.columnCount

  // 构建当前列名到索引的映射
  const colMap: Record<string, number> = {}
  for (let col = 1; col <= totalCols; col++) {
    const name = String(headerRow.getCell(col).value || '')
    colMap[name] = col
  }

  // 读取所有数据
  const allData: any[][] = []
  for (let row = 1; row <= totalRows; row++) {
    const rowData: any[] = []
    for (let col = 1; col <= totalCols; col++) {
      rowData.push(ws.getRow(row).getCell(col).value)
    }
    allData.push(rowData)
  }

  // 计算新列顺序的索引（未在 newOrder 中的列追加到末尾）
  const orderedIndices: number[] = []
  for (const name of newOrder) {
    if (colMap[name] !== undefined) {
      orderedIndices.push(colMap[name] - 1) // 转为 0-based
    }
  }
  // 追加未指定的列
  for (let col = 0; col < totalCols; col++) {
    if (!orderedIndices.includes(col)) {
      orderedIndices.push(col)
    }
  }

  // 重写数据
  for (let row = 1; row <= totalRows; row++) {
    const srcRow = allData[row - 1]
    for (let newCol = 0; newCol < orderedIndices.length; newCol++) {
      ws.getRow(row).getCell(newCol + 1).value = srcRow[orderedIndices[newCol]]
    }
  }
}

function applySortRows(ws: ExcelJS.Worksheet, sortBy: string, sortOrder: 'asc' | 'desc') {
  const headerRow = ws.getRow(1)
  const totalCols = ws.columnCount
  const totalRows = ws.rowCount

  // 找到排序列
  let sortColIdx = -1
  for (let col = 1; col <= totalCols; col++) {
    if (String(headerRow.getCell(col).value || '') === sortBy) {
      sortColIdx = col
      break
    }
  }
  if (sortColIdx === -1) return

  // 读取数据行（跳过表头）
  const rows: { data: any[]; sortValue: any }[] = []
  for (let row = 2; row <= totalRows; row++) {
    const data: any[] = []
    for (let col = 1; col <= totalCols; col++) {
      data.push(ws.getRow(row).getCell(col).value)
    }
    // 跳过空行和汇总行
    const firstCell = String(data[0] || '')
    if (!firstCell || firstCell === '汇总') continue
    rows.push({ data, sortValue: data[sortColIdx - 1] })
  }

  // 排序
  rows.sort((a, b) => {
    const aVal = typeof a.sortValue === 'number' ? a.sortValue : parseFloat(a.sortValue) || 0
    const bVal = typeof b.sortValue === 'number' ? b.sortValue : parseFloat(b.sortValue) || 0
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
  })

  // 写回（保留表头）
  for (let i = 0; i < rows.length; i++) {
    const rowIdx = i + 2
    for (let col = 1; col <= totalCols; col++) {
      ws.getRow(rowIdx).getCell(col).value = rows[i].data[col - 1]
    }
  }
  // 清除多余的行（如果有汇总行被跳过）
  for (let row = rows.length + 2; row <= totalRows; row++) {
    for (let col = 1; col <= totalCols; col++) {
      ws.getRow(row).getCell(col).value = null
    }
  }
}

function applyFilterRows(ws: ExcelJS.Worksheet, column: string, operator: string, value: any) {
  const headerRow = ws.getRow(1)
  const totalCols = ws.columnCount
  const totalRows = ws.rowCount

  // 找到筛选列
  let filterColIdx = -1
  for (let col = 1; col <= totalCols; col++) {
    if (String(headerRow.getCell(col).value || '') === column) {
      filterColIdx = col
      break
    }
  }
  if (filterColIdx === -1) return

  // 筛选数据行
  const keepRows: any[][] = []
  for (let row = 2; row <= totalRows; row++) {
    const data: any[] = []
    for (let col = 1; col <= totalCols; col++) {
      data.push(ws.getRow(row).getCell(col).value)
    }
    const cellValue = data[filterColIdx - 1]
    if (matchFilter(cellValue, operator, value)) {
      keepRows.push(data)
    }
  }

  // 重写
  for (let i = 0; i < keepRows.length; i++) {
    const rowIdx = i + 2
    for (let col = 1; col <= totalCols; col++) {
      ws.getRow(rowIdx).getCell(col).value = keepRows[i][col - 1]
    }
  }
  // 清除剩余行
  for (let row = keepRows.length + 2; row <= totalRows; row++) {
    for (let col = 1; col <= totalCols; col++) {
      ws.getRow(row).getCell(col).value = null
    }
  }
}

function matchFilter(cellValue: any, operator: string, value: any): boolean {
  const strVal = String(cellValue || '')
  const numVal = typeof cellValue === 'number' ? cellValue : parseFloat(strVal) || 0
  const targetNum = typeof value === 'number' ? value : parseFloat(String(value)) || 0

  switch (operator) {
    case 'equals':
      return strVal === String(value)
    case 'contains':
      return strVal.includes(String(value))
    case 'gt':
      return numVal > targetNum
    case 'lt':
      return numVal < targetNum
    case 'gte':
      return numVal >= targetNum
    case 'lte':
      return numVal <= targetNum
    default:
      return true
  }
}

export default router
