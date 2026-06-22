/**
 * queryDatabase 工具测试
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

describe('Tool - queryDatabase', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('应正确发送 SQL 查询请求', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { rows: [{ name: '张三', score: 90 }], rowCount: 1, truncated: false },
      }),
    })

    const { queryDatabaseTool } = await import('../../src/tools/query-db.tool.js')
    const result = await queryDatabaseTool.execute(
      { sql: 'SELECT name, score FROM students', explanation: '测试查询' },
      baseContext
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/internal/query-db',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sql: 'SELECT name, score FROM students', explanation: '测试查询', exportExcel: undefined, exportTitle: undefined }),
      })
    )
    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toContain('张三')
    expect(result.content[0].text).toContain('90')
  })

  it('查询失败应返回错误信息', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ message: '只允许 SELECT 查询' }),
    })

    const { queryDatabaseTool } = await import('../../src/tools/query-db.tool.js')
    const result = await queryDatabaseTool.execute(
      { sql: 'DELETE FROM students' },
      baseContext
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('只允许 SELECT')
  })

  it('结果截断时应显示提示', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { rows: Array(100).fill({ id: 1 }), rowCount: 100, truncated: true },
      }),
    })

    const { queryDatabaseTool } = await import('../../src/tools/query-db.tool.js')
    const result = await queryDatabaseTool.execute(
      { sql: 'SELECT * FROM students' },
      baseContext
    )

    expect(result.content[0].text).toContain('已截断')
  })

  it('exportExcel=true 应返回下载链接', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          downloadUrl: '/api/internal/export/download/test.xlsx',
          filename: 'test.xlsx',
          message: '已导出 5 行数据',
        },
      }),
    })

    const { queryDatabaseTool } = await import('../../src/tools/query-db.tool.js')
    const result = await queryDatabaseTool.execute(
      { sql: 'SELECT * FROM students', exportExcel: true, exportTitle: '测试导出' },
      baseContext
    )

    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toContain('已导出 5 行数据')
    expect(result.content[0].text).toContain('[📥 点击下载 test.xlsx](http://localhost:3001/api/admin/export/download/test.xlsx)')
  })

  it('exportExcel 请求应包含 exportExcel 和 exportTitle 参数', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { downloadUrl: '/x', filename: 'x', message: 'ok' } }),
    })

    const { queryDatabaseTool } = await import('../../src/tools/query-db.tool.js')
    await queryDatabaseTool.execute(
      { sql: 'SELECT 1', exportExcel: true, exportTitle: '我的报表' },
      baseContext
    )

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(callBody.exportExcel).toBe(true)
    expect(callBody.exportTitle).toBe('我的报表')
  })
})
