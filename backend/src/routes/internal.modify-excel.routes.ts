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
  type: 'renameColumns' | 'deleteColumns' | 'reorderColumns' | 'sortRows' | 'filterRows' | 'addColumn' | 'replaceValues' | 'deleteSheet' | 'renameSheet' | 'mergeSheets' | 'addSummaryRow'
  renameMap?: Record<string, string>
  columns?: string[]
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  column?: string
  operator?: 'equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte'
  value?: string | number
  headerName?: string
  formula?: { sourceColumn: string; rules: Array<{ gte?: number; gt?: number; lte?: number; lt?: number; equals?: string | number; contains?: string; label: string }>; default?: string }
  searchValue?: string
  replaceWith?: string
  targetSheet?: string
  newName?: string
  sourceSheets?: string[]
  summaryType?: 'avg' | 'sum' | 'count' | 'max' | 'min'
  summaryColumns?: string[]
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
  for (const op of operations as ModifyOperation[]) {
    // workbook 级别的操作
    if (op.type === 'deleteSheet' || op.type === 'renameSheet' || op.type === 'mergeSheets') {
      applyWorkbookOperation(workbook, op)
    } else {
      for (const ws of sheetsToModify) {
        applyOperation(ws, op)
      }
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

function applyWorkbookOperation(workbook: ExcelJS.Workbook, op: ModifyOperation) {
  switch (op.type) {
    case 'deleteSheet':
      applyDeleteSheet(workbook, op.targetSheet || '')
      break
    case 'renameSheet':
      applyRenameSheet(workbook, op.targetSheet || '', op.newName || '')
      break
    case 'mergeSheets':
      applyMergeSheets(workbook, op.sourceSheets || [])
      break
  }
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
    case 'addColumn':
      applyAddColumn(ws, op.headerName || op.column || '新列', op.value, op.formula)
      break
    case 'replaceValues':
      applyReplaceValues(ws, op.column, op.searchValue || '', op.replaceWith || '')
      break
    case 'addSummaryRow':
      applyAddSummaryRow(ws, op.summaryType || 'avg', op.summaryColumns)
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

function applyAddColumn(ws: ExcelJS.Worksheet, headerName: string, fixedValue: any, formula?: ModifyOperation['formula']) {
  const totalRows = ws.rowCount
  const newColIdx = ws.columnCount + 1

  // 设置表头
  ws.getRow(1).getCell(newColIdx).value = headerName

  if (formula && formula.sourceColumn && formula.rules) {
    // 条件公式模式：根据源列值匹配规则
    const headerRow = ws.getRow(1)
    let sourceColIdx = -1
    for (let col = 1; col < newColIdx; col++) {
      if (String(headerRow.getCell(col).value || '') === formula.sourceColumn) {
        sourceColIdx = col
        break
      }
    }

    for (let row = 2; row <= totalRows; row++) {
      const sourceValue = sourceColIdx > 0 ? ws.getRow(row).getCell(sourceColIdx).value : null
      const numSource = typeof sourceValue === 'number' ? sourceValue : parseFloat(String(sourceValue)) || 0
      const strSource = String(sourceValue || '')

      let matched = false
      for (const rule of formula.rules) {
        if (rule.gte !== undefined && numSource >= rule.gte) { ws.getRow(row).getCell(newColIdx).value = rule.label; matched = true; break }
        if (rule.gt !== undefined && numSource > rule.gt) { ws.getRow(row).getCell(newColIdx).value = rule.label; matched = true; break }
        if (rule.lte !== undefined && numSource <= rule.lte) { ws.getRow(row).getCell(newColIdx).value = rule.label; matched = true; break }
        if (rule.lt !== undefined && numSource < rule.lt) { ws.getRow(row).getCell(newColIdx).value = rule.label; matched = true; break }
        if (rule.equals !== undefined && strSource === String(rule.equals)) { ws.getRow(row).getCell(newColIdx).value = rule.label; matched = true; break }
        if (rule.contains !== undefined && strSource.includes(rule.contains)) { ws.getRow(row).getCell(newColIdx).value = rule.label; matched = true; break }
      }
      if (!matched) {
        ws.getRow(row).getCell(newColIdx).value = formula.default || ''
      }
    }
  } else {
    // 固定值模式
    for (let row = 2; row <= totalRows; row++) {
      ws.getRow(row).getCell(newColIdx).value = fixedValue ?? ''
    }
  }
}

function applyReplaceValues(ws: ExcelJS.Worksheet, column: string | undefined, searchValue: string, replaceWith: string) {
  const totalRows = ws.rowCount
  const totalCols = ws.columnCount

  if (column) {
    // 指定列替换
    const headerRow = ws.getRow(1)
    let colIdx = -1
    for (let col = 1; col <= totalCols; col++) {
      if (String(headerRow.getCell(col).value || '') === column) {
        colIdx = col
        break
      }
    }
    if (colIdx === -1) return

    for (let row = 2; row <= totalRows; row++) {
      const cell = ws.getRow(row).getCell(colIdx)
      const val = String(cell.value || '')
      if (val.includes(searchValue)) {
        cell.value = val.replaceAll(searchValue, replaceWith)
      }
    }
  } else {
    // 全表替换
    for (let row = 2; row <= totalRows; row++) {
      for (let col = 1; col <= totalCols; col++) {
        const cell = ws.getRow(row).getCell(col)
        const val = String(cell.value || '')
        if (val.includes(searchValue)) {
          cell.value = val.replaceAll(searchValue, replaceWith)
        }
      }
    }
  }
}

function applyDeleteSheet(workbook: ExcelJS.Workbook, sheetName: string) {
  if (!sheetName) return
  const ws = workbook.getWorksheet(sheetName)
  if (ws) {
    workbook.removeWorksheet(ws.id)
  }
}

function applyRenameSheet(workbook: ExcelJS.Workbook, oldName: string, newName: string) {
  if (!oldName || !newName) return
  const ws = workbook.getWorksheet(oldName)
  if (ws) {
    ws.name = newName
  }
}

function applyMergeSheets(workbook: ExcelJS.Workbook, sheetNames: string[]) {
  if (sheetNames.length < 2) return

  // 第一个 Sheet 作为目标
  const targetWs = workbook.getWorksheet(sheetNames[0])
  if (!targetWs) return

  for (let i = 1; i < sheetNames.length; i++) {
    const sourceWs = workbook.getWorksheet(sheetNames[i])
    if (!sourceWs) continue

    const targetCols = targetWs.columnCount
    const sourceCols = sourceWs.columnCount

    // 检查表头是否一致
    const targetHeaders: string[] = []
    const sourceHeaders: string[] = []
    for (let col = 1; col <= targetCols; col++) {
      targetHeaders.push(String(targetWs.getRow(1).getCell(col).value || ''))
    }
    for (let col = 1; col <= sourceCols; col++) {
      sourceHeaders.push(String(sourceWs.getRow(1).getCell(col).value || ''))
    }

    // 建立列映射（源列 → 目标列）
    const colMapping: number[] = [] // colMapping[sourceColIdx] = targetColIdx
    for (let sCol = 0; sCol < sourceHeaders.length; sCol++) {
      const tCol = targetHeaders.indexOf(sourceHeaders[sCol])
      colMapping.push(tCol >= 0 ? tCol + 1 : -1)
    }

    // 追加数据行（跳过源 Sheet 的表头）
    const sourceRows = sourceWs.rowCount
    for (let row = 2; row <= sourceRows; row++) {
      const newRowIdx = targetWs.rowCount + 1
      for (let sCol = 0; sCol < sourceCols; sCol++) {
        const tColIdx = colMapping[sCol]
        if (tColIdx > 0) {
          targetWs.getRow(newRowIdx).getCell(tColIdx).value = sourceWs.getRow(row).getCell(sCol + 1).value
        }
      }
    }

    // 删除源 Sheet
    workbook.removeWorksheet(sourceWs.id)
  }
}

function applyAddSummaryRow(ws: ExcelJS.Worksheet, summaryType: string, summaryColumns?: string[]) {
  const headerRow = ws.getRow(1)
  const totalCols = ws.columnCount
  const totalRows = ws.rowCount

  // 确定需要汇总的列
  const colsToSummarize: { idx: number; name: string }[] = []
  for (let col = 1; col <= totalCols; col++) {
    const name = String(headerRow.getCell(col).value || '')
    if (summaryColumns && summaryColumns.length > 0) {
      if (summaryColumns.includes(name)) colsToSummarize.push({ idx: col, name })
    } else {
      // 自动检测数字列（检查前几行）
      let isNumeric = false
      for (let row = 2; row <= Math.min(totalRows, 5); row++) {
        const val = ws.getRow(row).getCell(col).value
        if (typeof val === 'number') { isNumeric = true; break }
      }
      if (isNumeric) colsToSummarize.push({ idx: col, name })
    }
  }

  if (colsToSummarize.length === 0) return

  // 收集各列的数值
  const colValues: Map<number, number[]> = new Map()
  for (const col of colsToSummarize) {
    colValues.set(col.idx, [])
  }

  for (let row = 2; row <= totalRows; row++) {
    for (const col of colsToSummarize) {
      const val = ws.getRow(row).getCell(col.idx).value
      if (typeof val === 'number') {
        colValues.get(col.idx)!.push(val)
      } else {
        const num = parseFloat(String(val))
        if (!isNaN(num)) colValues.get(col.idx)!.push(num)
      }
    }
  }

  // 添加空行 + 汇总行
  const summaryRowIdx = totalRows + 2
  ws.getRow(summaryRowIdx).getCell(1).value = '汇总'
  ws.getRow(summaryRowIdx).font = { bold: true }

  for (const col of colsToSummarize) {
    const values = colValues.get(col.idx) || []
    if (values.length === 0) continue

    let result: number
    switch (summaryType) {
      case 'sum':
        result = values.reduce((a, b) => a + b, 0)
        break
      case 'count':
        result = values.length
        break
      case 'max':
        result = Math.max(...values)
        break
      case 'min':
        result = Math.min(...values)
        break
      case 'avg':
      default:
        result = Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10
        break
    }
    ws.getRow(summaryRowIdx).getCell(col.idx).value = result
  }
}

export default router
