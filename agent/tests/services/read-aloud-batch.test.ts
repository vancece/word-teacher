/**
 * ReadAloudAgent.evaluateBatch 单元测试
 * Mock 讯飞 ISE 服务，验证批量评测的编排逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReadAloudAgent } from '../../src/agents/read-aloud.agent.js'

// Mock xfyun-ise service
vi.mock('../../src/services/xfyun-ise.service.js', () => ({
  xfyunIseService: {
    isConfigured: vi.fn(() => true),
    evaluateChapter: vi.fn(),
    evaluate: vi.fn(),
  },
}))

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  readAloudLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { xfyunIseService } from '../../src/services/xfyun-ise.service.js'

// 生成一段有声音频的 WAV base64（带 44 字节头）
function makeWavBase64(durationSec: number, silent = false): string {
  const samples = Math.floor(16000 * durationSec)
  const dataSize = samples * 2
  const header = Buffer.alloc(44)

  // RIFF header
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // subchunk1 size
  header.writeUInt16LE(1, 20)  // PCM
  header.writeUInt16LE(1, 22)  // mono
  header.writeUInt32LE(16000, 24) // sample rate
  header.writeUInt32LE(32000, 28) // byte rate
  header.writeUInt16LE(2, 32)  // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  const data = Buffer.alloc(dataSize)
  if (!silent) {
    for (let i = 0; i < samples; i++) {
      data.writeInt16LE(Math.floor(Math.sin(i * 0.1) * 5000), i * 2)
    }
  }

  const wav = Buffer.concat([header, data])
  return wav.toString('base64')
}

describe('ReadAloudAgent.evaluateBatch', () => {
  let agent: ReadAloudAgent

  beforeEach(() => {
    agent = new ReadAloudAgent()
    vi.clearAllMocks()
  })

  it('ISE 未配置时返回错误结果', async () => {
    vi.mocked(xfyunIseService.isConfigured).mockReturnValue(false)

    const results = await agent.evaluateBatch([
      { text: 'Hello world', audioBase64: makeWavBase64(1) },
    ])

    expect(results).toHaveLength(1)
    expect(results[0].accuracy).toBe(0)
    expect(results[0].feedback).toContain('未配置')
  })

  it('静音音频被标记为未作答', async () => {
    vi.mocked(xfyunIseService.isConfigured).mockReturnValue(true)
    vi.mocked(xfyunIseService.evaluateChapter).mockResolvedValue([])

    const results = await agent.evaluateBatch([
      { text: 'Hello', audioBase64: makeWavBase64(1, true) }, // 静音
      { text: 'World', audioBase64: makeWavBase64(1) },        // 有声
    ])

    // 第一句静音
    expect(results[0].accuracy).toBe(0)
    expect(results[0].feedback).toContain('没有检测到语音')
    // 第二句应该被正常评测（即使 mock 返回空数组会触发 fallback）
  })

  it('所有音频静音时直接返回', async () => {
    vi.mocked(xfyunIseService.isConfigured).mockReturnValue(true)

    const results = await agent.evaluateBatch([
      { text: 'Hello', audioBase64: makeWavBase64(1, true) },
      { text: 'World', audioBase64: makeWavBase64(1, true) },
    ])

    expect(results).toHaveLength(2)
    expect(results[0].accuracy).toBe(0)
    expect(results[1].accuracy).toBe(0)
    // evaluateChapter 不应被调用
    expect(xfyunIseService.evaluateChapter).not.toHaveBeenCalled()
  })

  it('正常场景：chapter 评测成功，返回每句结果', async () => {
    vi.mocked(xfyunIseService.isConfigured).mockReturnValue(true)
    vi.mocked(xfyunIseService.evaluateChapter).mockResolvedValue([
      {
        success: true,
        data: {
          accuracy: 85,
          fluency: 80,
          completeness: 100,
          suggestedScore: 82,
          words: [
            { word: 'Hello', accuracy: 90, fluency: 0, realWord: 'Hello', matchTag: 'correct' },
            { word: 'world', accuracy: 80, fluency: 0, realWord: 'world', matchTag: 'correct' },
          ],
        },
      },
      {
        success: true,
        data: {
          accuracy: 75,
          fluency: 70,
          completeness: 90,
          suggestedScore: 72,
          words: [
            { word: 'Good', accuracy: 80, fluency: 0, realWord: 'Good', matchTag: 'correct' },
            { word: 'morning', accuracy: 70, fluency: 0, realWord: 'morning', matchTag: 'correct' },
          ],
        },
      },
    ])

    const results = await agent.evaluateBatch([
      { text: 'Hello world', audioBase64: makeWavBase64(2) },
      { text: 'Good morning', audioBase64: makeWavBase64(2) },
    ])

    expect(results).toHaveLength(2)
    // formatISEResult 用 suggestedScore 作 rawScore，>=80 直接取值
    expect(results[0].accuracy).toBe(82) // suggestedScore=82, >=80 → 82
    expect(results[0].evaluationMethod).toBe('ise')
    // suggestedScore=72, 60~80 区间 → 72 + (80-72)*0.1 = 72.8 → Math.round = 73
    expect(results[1].accuracy).toBe(73)
    expect(xfyunIseService.evaluateChapter).toHaveBeenCalledTimes(1)
  })

  it('chapter 评测整体失败时降级为逐句评测', async () => {
    vi.mocked(xfyunIseService.isConfigured).mockReturnValue(true)
    vi.mocked(xfyunIseService.evaluateChapter).mockRejectedValue(new Error('WebSocket timeout'))
    vi.mocked(xfyunIseService.evaluate).mockResolvedValue({
      success: true,
      data: {
        accuracy: 70,
        fluency: 65,
        completeness: 80,
        suggestedScore: 68,
        words: [{ word: 'Hello', accuracy: 70, fluency: 0, realWord: 'Hello', matchTag: 'correct' }],
      },
    })

    const results = await agent.evaluateBatch([
      { text: 'Hello', audioBase64: makeWavBase64(1) },
    ])

    expect(results).toHaveLength(1)
    // 降级调用了 evaluate（单句）
    expect(xfyunIseService.evaluate).toHaveBeenCalled()
  })

  it('部分句子 chapter 失败时单句降级', async () => {
    vi.mocked(xfyunIseService.isConfigured).mockReturnValue(true)
    vi.mocked(xfyunIseService.evaluateChapter).mockResolvedValue([
      {
        success: true,
        data: {
          accuracy: 90,
          fluency: 85,
          completeness: 100,
          suggestedScore: 88,
          words: [{ word: 'Hello', accuracy: 90, fluency: 0, realWord: 'Hello', matchTag: 'correct' }],
        },
      },
      {
        success: false,
        error: 'Sentence not found in chapter result',
      },
    ])
    vi.mocked(xfyunIseService.evaluate).mockResolvedValue({
      success: true,
      data: {
        accuracy: 60,
        fluency: 55,
        completeness: 70,
        suggestedScore: 58,
        words: [{ word: 'World', accuracy: 60, fluency: 0, realWord: 'World', matchTag: 'correct' }],
      },
    })

    const results = await agent.evaluateBatch([
      { text: 'Hello', audioBase64: makeWavBase64(1) },
      { text: 'World', audioBase64: makeWavBase64(1) },
    ])

    expect(results).toHaveLength(2)
    // formatISEResult: suggestedScore=88, >=80 → accuracy=88
    expect(results[0].accuracy).toBe(88) // chapter 成功
    // 第二句降级到单句评测
    expect(xfyunIseService.evaluate).toHaveBeenCalledTimes(1)
  })
})
