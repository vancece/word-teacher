/**
 * 音频播放 Hook
 * 支持播放 Qwen-Omni 返回的 PCM 数据（需要添加 WAV 头）
 */
import { useState, useRef, useCallback, useEffect } from 'react'

export interface UseAudioPlayerReturn {
  isPlaying: boolean
  currentTime: number
  duration: number
  play: (audioBase64: string, format?: string) => Promise<void>
  pause: () => void
  stop: () => void
  setVolume: (volume: number) => void
}

/**
 * 将 PCM 数据转换为 WAV 格式
 * Qwen-Omni 返回的是 16-bit PCM, 24000Hz, 单声道
 */
function pcmToWav(pcmData: ArrayBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): ArrayBuffer {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcmData.byteLength
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
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true)  // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // Copy PCM data
  const pcmView = new Uint8Array(pcmData)
  const wavView = new Uint8Array(buffer)
  wavView.set(pcmView, headerSize)

  return buffer
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 清理函数
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
  }, [])

  // 播放 Base64 音频，返回 Promise 在播放完成后 resolve
  const play = useCallback((audioBase64: string, format: string = 'wav'): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        // 停止当前播放
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.src = ''
        }

        // 解码 Base64
        const binaryString = atob(audioBase64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        const pcmBuffer = bytes.buffer

        // Qwen-Omni 返回的是 PCM 数据，需要添加 WAV 头
        const wavBuffer = pcmToWav(pcmBuffer, 24000, 1, 16)
        const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' })
        const wavUrl = URL.createObjectURL(wavBlob)

        // 创建新的 Audio 元素
        const audio = new Audio()
        audioRef.current = audio
        audio.src = wavUrl

        // 监听事件
        audio.onloadedmetadata = () => {
          setDuration(audio.duration)
        }

        audio.ontimeupdate = () => {
          setCurrentTime(audio.currentTime)
        }

        audio.onended = () => {
          setIsPlaying(false)
          setCurrentTime(0)
          URL.revokeObjectURL(wavUrl) // 释放 URL
          resolve() // 播放完成后 resolve
        }

        audio.onerror = (e) => {
          console.error('Audio playback error:', e)
          setIsPlaying(false)
          URL.revokeObjectURL(wavUrl)
          reject(new Error('Audio playback failed'))
        }

        // 播放
        setIsPlaying(true)
        audio.play().then(() => {
          console.log('[AudioPlayer] Playing WAV audio, duration estimation:', pcmBuffer.byteLength / (24000 * 2), 's')
        }).catch((err) => {
          // 处理浏览器失焦、自动播放策略等导致的播放失败
          // 常见错误：NotAllowedError (自动播放被阻止), AbortError (播放被中断)
          console.warn('[AudioPlayer] Playback failed (possibly due to browser policy or tab unfocused):', err?.name || err)
          setIsPlaying(false)
          URL.revokeObjectURL(wavUrl)
          // 静默解决，不抛出错误，避免影响用户体验
          resolve()
        })

      } catch (err) {
        console.warn('[AudioPlayer] Failed to prepare audio:', err)
        setIsPlaying(false)
        // 静默解决，不抛出错误
        resolve()
      }
    })
  }, [])

  // 暂停
  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }, [])

  // 停止
  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsPlaying(false)
      setCurrentTime(0)
    }
  }, [])

  // 设置音量 (0-1)
  const setVolume = useCallback((volume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume))
    }
  }, [])

  return {
    isPlaying,
    currentTime,
    duration,
    play,
    pause,
    stop,
    setVolume,
  }
}

