/**
 * 工具执行测试（Mock fetch，验证各工具的参数拼装和错误处理）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ToolContext } from '../../src/tools/types.js'

// Mock global fetch
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

describe('Tool Execution - classTool', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('应正确调用 /internal/classes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 1, name: '三年级1班', grade: '三年级', studentCount: 30 }],
      }),
    })

    const { classTool } = await import('../../src/tools/class.tool.js')
    const result = await classTool.execute({}, baseContext)

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/internal/classes',
      { headers: baseContext.headers }
    )
    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toContain('三年级1班')
  })

  it('请求失败应返回错误', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })

    const { classTool } = await import('../../src/tools/class.tool.js')
    const result = await classTool.execute({}, baseContext)

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('失败')
  })
})

describe('Tool Execution - classAnalysisTool', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('应正确拼装 ranking mode 查询参数', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ranking: [], type: 'dialogue', order: 'top' } }),
    })

    const { classAnalysisTool } = await import('../../src/tools/class-analysis.tool.js')
    await classAnalysisTool.execute({
      mode: 'ranking',
      classId: 1,
      type: 'readAloud',
      order: 'bottom',
      limit: 5,
      startDate: '2025-01-01',
      endDate: '2025-06-30',
    }, baseContext)

    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('classId=1')
    expect(calledUrl).toContain('type=readAloud')
    expect(calledUrl).toContain('order=bottom')
    expect(calledUrl).toContain('limit=5')
    expect(calledUrl).toContain('startDate=2025-01-01')
    expect(calledUrl).toContain('endDate=2025-06-30')
  })
})



describe('Tool Execution - contentManageTool', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('应发 PUT 请求修改场景可见性', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { sceneId: 'sc-1', name: '买水果', visible: false } }),
    })

    const { contentManageTool } = await import('../../src/tools/content-manage.tool.js')
    const result = await contentManageTool.execute(
      { target: 'dialogueScene', id: 'sc-1', visible: false },
      baseContext,
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/internal/scenes/sc-1/visibility',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ type: 'dialogue', visible: false }),
      }),
    )
    expect(result.content[0].text).toContain('买水果')
  })
})

describe('Tool Execution - recordsTool (date params)', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('应支持日期范围参数', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { records: [], total: 0 } }),
    })

    const { recordsTool } = await import('../../src/tools/records.tool.js')
    await recordsTool.execute({
      type: 'dialogue',
      startDate: '2025-03-01',
      endDate: '2025-03-31',
    }, baseContext)

    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('startDate=2025-03-01')
    expect(calledUrl).toContain('endDate=2025-03-31')
    expect(calledUrl).toContain('type=dialogue')
  })
})

describe('Tool Execution - createStudentTool', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('学号格式不合法时应直接返回错误（不调 API）', async () => {
    const { createStudentTool } = await import('../../src/tools/create-user.tool.js')
    const result = await createStudentTool.execute(
      { studentNo: 'abc123', name: '测试', classId: 1 },
      baseContext,
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('学号格式错误')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('合法学号应正确调用创建 API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: '学生 张三（2026050101）创建成功，默认密码: 050101',
        data: { id: 1, studentNo: '2026050101', name: '张三' },
      }),
    })

    const { createStudentTool } = await import('../../src/tools/create-user.tool.js')
    const result = await createStudentTool.execute(
      { studentNo: '2026050101', name: '张三', classId: 1 },
      baseContext,
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/internal/students/create',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toContain('创建成功')
  })
})

describe('Tool Execution - createTeacherTool', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('账号格式不合法时应直接返回错误', async () => {
    const { createTeacherTool } = await import('../../src/tools/create-user.tool.js')
    const result = await createTeacherTool.execute(
      { username: 'ABC', name: '测试' },
      baseContext,
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('账号格式错误')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('合法账号应正确调用创建 API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: '教师 张老师（zhang_san）创建成功，默认密码: 123456',
        data: { id: 4, username: 'zhang_san', name: '张老师' },
      }),
    })

    const { createTeacherTool } = await import('../../src/tools/create-user.tool.js')
    const result = await createTeacherTool.execute(
      { username: 'zhang_san', name: '张老师' },
      baseContext,
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/internal/teachers/create',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toContain('创建成功')
  })
})
