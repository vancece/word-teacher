/**
 * Qwen3-ASR-Flash 语音识别服务
 * 用于精准识别学生说了什么
 */

import { env } from '../config.js'

interface ASRResult {
  text: string       // 识别出的文字
  success: boolean
  error?: string
}

class ASRService {
  private baseUrl = env.dashscope.baseUrl
  private apiKey = env.dashscope.apiKey

  /**
   * 识别音频内容
   * @param audioBase64 - WAV 格式的 base64 音频
   * @returns 识别结果
   */
  async transcribe(audioBase64: string): Promise<ASRResult> {
    try {
      // 去掉可能的 data URI 前缀，保留纯 base64
      let audioData = audioBase64
      if (audioData.includes(',')) {
        audioData = audioData.split(',')[1]
      }
      audioData = audioData.replace(/^data:audio\/\w+;base64,/, '')

      console.log('[ASR] Audio data length:', audioData.length)
      console.log('[ASR] Audio data prefix:', audioData.substring(0, 50))

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'qwen3-asr-flash',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_audio',
                  input_audio: { data: audioData, format: 'wav' },
                },
              ],
            },
          ],
          stream: true,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[ASR] API error:', errorText)
        return { text: '', success: false, error: `API error: ${response.status}` }
      }

      // 解析流式响应
      const reader = response.body?.getReader()
      if (!reader) {
        return { text: '', success: false, error: 'No response body' }
      }

      let transcribedText = ''
      const decoder = new TextDecoder()
      let rawChunks: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        rawChunks.push(chunk)
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '))

        for (const line of lines) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const json = JSON.parse(data)
            const delta = json.choices?.[0]?.delta
            if (delta?.content) {
              transcribedText += delta.content
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      console.log('[ASR] Raw chunks count:', rawChunks.length)
      console.log('[ASR] First chunk preview:', rawChunks[0]?.substring(0, 200))
      console.log('[ASR] Transcribed:', transcribedText || '(empty)')
      return { text: transcribedText.trim(), success: true }

    } catch (error) {
      console.error('[ASR] Error:', error)
      return { 
        text: '', 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }
}

export const asrService = new ASRService()

