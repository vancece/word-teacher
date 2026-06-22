/**
 * exportToExcel 工具测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ToolContext } from '../../src/tools/types.js'

const mockFetch = vi.fn()
global.fetch = mockFetch

const baseContext: ToolContext = {
  backendUrl: 'http://localhost:3001/api',
  headers: {
    'x-agent-api-key': 'test-key',
    'Content-Type': 'application/json',
    'x-teacher-id': '1',
  },
  teacherId: 1,
}

describe('Tool - exportToExcel', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('查询模式应正确发送 source 和 params', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          downloadUrl: '/api/internal/export/download/test.xlsx',
          filename: 'test.xlsx',
          message: '已生成成绩报表',
        },
      }),
    })

    const { exportToExcelTool } = await import('../../src/tools/export.tool.js')
    const result = await exportToExcelTool.execute(
      { source: 'studentScores', params: { classId: 1, type: 'dialogue' } },
      baseContext
    )

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(callBody.source).toBe('studentScores')
    expect(callBody.params.classId).toBe(1)
    expect(callBody.params.type).toBe('dialogue')
    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toContain('test.xlsx')
  })

  it('数据模式应正确发送 title 和 sheets', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          downloadUrl: '/api/internal/export/download/custom.xlsx',
          filename: 'custom.xlsx',
          message: '已生成自定义报表',
        },
      }),
    })

    const { exportToExcelTool } = await import('../../src/tools/export.tool.js')
    const result = await exportToExcelTool.execute(
      {
        title: '月度汇总',
        sheets: [
          { name: '汇总', headers: ['姓名', '得分'], rows: [['张三', 90], ['李四', 85]] },
        ],
      },
      baseContext
    )

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(callBody.title).toBe('月度汇总')
    expect(callBody.sheets).toHaveLength(1)
    expect(callBody.sheets[0].headers).toEqual(['姓名', '得分'])
    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toContain('custom.xlsx')
  })

  it('返回的下载链接应拼接完整 baseUrl', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          downloadUrl: '/api/internal/export/download/report.xlsx',
          filename: 'report.xlsx',
          message: '导出成功',
        },
      }),
    })

    const { exportToExcelTool } = await import('../../src/tools/export.tool.js')
    const result = await exportToExcelTool.execute(
      { source: 'studentScores', params: {} },
      baseContext
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.downloadUrl).toBe('http://localhost:3001/api/internal/export/download/report.xlsx')
  })

  it('导出失败应返回错误信息', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ message: '请指定 source（查询模式）或 sheets（数据模式）' }),
    })

    const { exportToExcelTool } = await import('../../src/tools/export.tool.js')
    const result = await exportToExcelTool.execute(
      {},
      baseContext
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('source')
  })

  it('请求目标 URL 应为 /internal/export/excel', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { downloadUrl: '/x', filename: 'x.xlsx', message: 'ok' },
      }),
    })

    const { exportToExcelTool } = await import('../../src/tools/export.tool.js')
    await exportToExcelTool.execute(
      { source: 'studentScores', params: {} },
      baseContext
    )

    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3001/api/internal/export/excel')
  })
})
