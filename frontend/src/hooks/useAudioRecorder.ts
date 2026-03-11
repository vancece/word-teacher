/**
 * 录音 Hook - 使用 MediaRecorder API
 * 输出 WAV 格式以兼容 Qwen-Omni
 */
import { useState, useRef, useCallback } from 'react'

export interface UseAudioRecorderReturn {
  isRecording: boolean
  isPaused: boolean
  recordingTime: number
  startRecording: () => Promise<void>
  stopRecording: () => Promise<string | null>  // 返回 Base64 WAV
  pauseRecording: () => void
  resumeRecording: () => void
  error: string | null
}

// 使用 AudioContext 直接录制 PCM 数据
export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Float32Array[]>([])
  const timerRef = useRef<number | null>(null)
  const resolveRef = useRef<((value: string | null) => void) | null>(null)

  // 开始录音
  const startRecording = useCallback(async () => {
    try {
      setError(null)
      chunksRef.current = []
      setRecordingTime(0)

      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      streamRef.current = stream

      // 创建 AudioContext
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)

      // 使用 ScriptProcessorNode 捕获原始 PCM 数据
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        // 复制数据（因为 buffer 会被重用）
        chunksRef.current.push(new Float32Array(inputData))
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      setIsRecording(true)

      // 开始计时
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)

    } catch (err) {
      console.error('Failed to start recording:', err)
      setError('无法访问麦克风，请检查权限设置')
      throw err
    }
  }, [])

  // 停止录音并返回 Base64 WAV
  const stopRecording = useCallback(async (): Promise<string | null> => {
    // 停止计时器
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // 断开音频处理
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    // 停止音频流
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    // 关闭 AudioContext
    if (audioContextRef.current) {
      await audioContextRef.current.close()
      audioContextRef.current = null
    }

    setIsRecording(false)
    setIsPaused(false)

    // 合并所有 PCM 数据
    if (chunksRef.current.length === 0) {
      return null
    }

    const totalLength = chunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0)
    const pcmData = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of chunksRef.current) {
      pcmData.set(chunk, offset)
      offset += chunk.length
    }
    chunksRef.current = []

    // 转换为 16-bit PCM
    const pcm16 = new Int16Array(pcmData.length)
    for (let i = 0; i < pcmData.length; i++) {
      const s = Math.max(-1, Math.min(1, pcmData[i]))
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }

    // 创建 WAV 文件
    const wavBuffer = createWavFile(pcm16, 16000)

    // 转换为 Base64
    const base64 = arrayBufferToBase64(wavBuffer)
    console.log(`[AudioRecorder] Recorded ${pcmData.length} samples, WAV size: ${wavBuffer.byteLength} bytes`)

    return base64
  }, [])

  // 暂停录音（简化版不支持）
  const pauseRecording = useCallback(() => {
    console.warn('Pause not supported in this implementation')
  }, [])

  // 恢复录音（简化版不支持）
  const resumeRecording = useCallback(() => {
    console.warn('Resume not supported in this implementation')
  }, [])

  return {
    isRecording,
    isPaused,
    recordingTime,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    error,
  }
}

// 创建 WAV 文件
function createWavFile(pcmData: Int16Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcmData.length * 2
  const headerSize = 44
  const totalSize = headerSize + dataSize

  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)

  // RIFF chunk
  writeString(view, 0, 'RIFF')
  view.setUint32(4, totalSize - 8, true)
  writeString(view, 8, 'WAVE')

  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)  // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // PCM data
  const pcmView = new Int16Array(buffer, headerSize)
  pcmView.set(pcmData)

  return buffer
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

