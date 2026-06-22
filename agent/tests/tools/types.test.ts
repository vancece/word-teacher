/**
 * Tool Types 单元测试
 * 验证 toolOk / toolError 便捷函数
 */
import { describe, it, expect } from 'vitest'
import { toolOk, toolError } from '../../src/tools/types.js'

describe('toolOk', () => {
  it('应返回正确的成功结构', () => {
    const result = toolOk('hello')
    expect(result).toEqual({
      content: [{ type: 'text', text: 'hello' }],
    })
  })

  it('不应带 isError 字段', () => {
    const result = toolOk('success')
    expect(result.isError).toBeUndefined()
  })
})

describe('toolError', () => {
  it('应返回正确的错误结构', () => {
    const result = toolError('出错了')
    expect(result).toEqual({
      content: [{ type: 'text', text: '出错了' }],
      isError: true,
    })
  })

  it('isError 应为 true', () => {
    const result = toolError('fail')
    expect(result.isError).toBe(true)
  })
})
