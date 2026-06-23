/**
 * audio-concat.service 单元测试
 */
import { describe, it, expect } from 'vitest'
import { concatPcmAudio, getPcmDurationSec, splitIntoBatches } from '../../src/services/audio-concat.service.js'

// 辅助：生成指定时长的 PCM buffer（16kHz / 16bit / mono）
function makePcm(durationSec: number): Buffer {
  const samples = Math.floor(16000 * durationSec)
  const buf = Buffer.alloc(samples * 2)
  // 填充简单正弦波模拟有声音频
  for (let i = 0; i < samples; i++) {
    const value = Math.floor(Math.sin(i * 0.1) * 3000)
    buf.writeInt16LE(value, i * 2)
  }
  return buf
}

describe('getPcmDurationSec', () => {
  it('计算 1 秒 PCM 的时长', () => {
    const pcm = makePcm(1)
    const duration = getPcmDurationSec(pcm)
    expect(duration).toBeCloseTo(1, 2)
  })

  it('空 buffer 时长为 0', () => {
    expect(getPcmDurationSec(Buffer.alloc(0))).toBe(0)
  })

  it('计算 5.5 秒 PCM', () => {
    const pcm = makePcm(5.5)
    const duration = getPcmDurationSec(pcm)
    expect(duration).toBeCloseTo(5.5, 1)
  })
})

describe('concatPcmAudio', () => {
  it('空数组返回空 buffer', () => {
    const result = concatPcmAudio([])
    expect(result.length).toBe(0)
  })

  it('单段音频直接返回原始 buffer', () => {
    const pcm = makePcm(2)
    const result = concatPcmAudio([pcm])
    expect(result).toBe(pcm)
  })

  it('两段音频拼接后包含静音间隔', () => {
    const pcm1 = makePcm(1)
    const pcm2 = makePcm(1)
    const result = concatPcmAudio([pcm1, pcm2], 800)

    // 预期长度 = pcm1 + 800ms 静音 + pcm2
    const silenceBytes = Math.floor(16000 * 2 * 800 / 1000) // 25600 bytes
    expect(result.length).toBe(pcm1.length + silenceBytes + pcm2.length)
  })

  it('拼接后总时长等于各段时长之和加静音', () => {
    const pcm1 = makePcm(2)
    const pcm2 = makePcm(3)
    const silenceMs = 800
    const result = concatPcmAudio([pcm1, pcm2], silenceMs)

    const expectedDuration = 2 + 3 + silenceMs / 1000
    expect(getPcmDurationSec(result)).toBeCloseTo(expectedDuration, 1)
  })

  it('三段音频有两段静音间隔', () => {
    const pcm1 = makePcm(1)
    const pcm2 = makePcm(1)
    const pcm3 = makePcm(1)
    const result = concatPcmAudio([pcm1, pcm2, pcm3], 500)

    const silenceBytes = Math.floor(16000 * 2 * 500 / 1000)
    const expected = pcm1.length + silenceBytes + pcm2.length + silenceBytes + pcm3.length
    expect(result.length).toBe(expected)
  })

  it('自定义静音时长 = 0ms 时无间隔', () => {
    const pcm1 = makePcm(1)
    const pcm2 = makePcm(1)
    const result = concatPcmAudio([pcm1, pcm2], 0)
    expect(result.length).toBe(pcm1.length + pcm2.length)
  })
})

describe('splitIntoBatches', () => {
  it('单句短于限制时返回一批', () => {
    const batches = splitIntoBatches([makePcm(3)], 45)
    expect(batches).toEqual([[0, 0]])
  })

  it('多句总时长不超限时返回一批', () => {
    const pcms = [makePcm(5), makePcm(5), makePcm(5)]
    const batches = splitIntoBatches(pcms, 45, 800)
    // 总时长 ≈ 5 + 0.8 + 5 + 0.8 + 5 = 16.6s < 45s
    expect(batches).toEqual([[0, 2]])
  })

  it('超时长时自动分批', () => {
    // 每句 10s, 静音 0.8s → 每批最多 4 句 (10 + 10.8 + 10.8 + 10.8 = 42.4s < 45s)
    // 第 5 句开始会超限 → 42.4 + 10.8 = 53.2s > 45s
    const pcms = Array.from({ length: 8 }, () => makePcm(10))
    const batches = splitIntoBatches(pcms, 45, 800)

    expect(batches.length).toBeGreaterThan(1)
    // 验证批次覆盖所有索引
    const allIndices: number[] = []
    for (const [start, end] of batches) {
      for (let i = start; i <= end; i++) allIndices.push(i)
    }
    expect(allIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('单句超时长时独占一批', () => {
    const pcms = [makePcm(50)] // 50s > 45s
    const batches = splitIntoBatches(pcms, 45, 800)
    // 单句无法再拆，作为独立批次
    expect(batches).toEqual([[0, 0]])
  })

  it('空数组返回空批次', () => {
    const batches = splitIntoBatches([], 45)
    expect(batches).toEqual([])
  })

  it('分批后各批时长不超限（正常情况）', () => {
    // 每句 8s, 6 句
    const pcms = Array.from({ length: 6 }, () => makePcm(8))
    const batches = splitIntoBatches(pcms, 45, 800)

    for (const [start, end] of batches) {
      // 计算批次内总时长
      let duration = 0
      for (let i = start; i <= end; i++) {
        duration += getPcmDurationSec(pcms[i])
        if (i < end) duration += 0.8
      }
      // 每批应 ≤ 45s（允许单句超长的边界情况除外）
      if (end > start) {
        expect(duration).toBeLessThanOrEqual(45)
      }
    }
  })
})
