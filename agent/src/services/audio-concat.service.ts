/**
 * PCM 音频拼接服务
 * 将多段 16kHz/16bit/mono PCM 音频拼接为一段，句间插入静音
 */

const SAMPLE_RATE = 16000
const BYTES_PER_SAMPLE = 2

/**
 * 拼接多段 PCM 音频，句间插入静音
 * @param pcmBuffers 每句的 PCM buffer 数组
 * @param silenceDurationMs 句间静音时长（毫秒）
 * @returns 拼接后的完整 PCM buffer
 */
export function concatPcmAudio(
  pcmBuffers: Buffer[],
  silenceDurationMs: number = 800
): Buffer {
  if (pcmBuffers.length === 0) return Buffer.alloc(0)
  if (pcmBuffers.length === 1) return pcmBuffers[0]

  const silenceBytes = Math.floor(SAMPLE_RATE * BYTES_PER_SAMPLE * silenceDurationMs / 1000)
  const silenceBuffer = Buffer.alloc(silenceBytes, 0)

  const parts: Buffer[] = []
  for (let i = 0; i < pcmBuffers.length; i++) {
    parts.push(pcmBuffers[i])
    if (i < pcmBuffers.length - 1) {
      parts.push(silenceBuffer)
    }
  }
  return Buffer.concat(parts)
}

/**
 * 计算 PCM 音频时长（秒）
 */
export function getPcmDurationSec(pcmBuffer: Buffer): number {
  return pcmBuffer.length / (SAMPLE_RATE * BYTES_PER_SAMPLE)
}

/**
 * 将多段 PCM 按时长限制分批
 * @param pcmBuffers 每句的 PCM buffer 数组
 * @param maxDurationSec 每批最大时长（秒）
 * @param silenceDurationMs 句间静音时长（毫秒）
 * @returns 分批后的索引范围数组，如 [[0,4], [5,9]] 表示第一批 0-4 句，第二批 5-9 句
 */
export function splitIntoBatches(
  pcmBuffers: Buffer[],
  maxDurationSec: number = 45,
  silenceDurationMs: number = 800
): Array<[number, number]> {
  const batches: Array<[number, number]> = []
  const silenceSec = silenceDurationMs / 1000

  let batchStart = 0
  let currentDuration = 0

  for (let i = 0; i < pcmBuffers.length; i++) {
    const sentenceDuration = getPcmDurationSec(pcmBuffers[i])
    const addedDuration = i === batchStart
      ? sentenceDuration
      : sentenceDuration + silenceSec

    if (currentDuration + addedDuration > maxDurationSec && i > batchStart) {
      // 当前批次结束
      batches.push([batchStart, i - 1])
      batchStart = i
      currentDuration = sentenceDuration
    } else {
      currentDuration += addedDuration
    }
  }

  // 最后一批
  if (batchStart < pcmBuffers.length) {
    batches.push([batchStart, pcmBuffers.length - 1])
  }

  return batches
}
