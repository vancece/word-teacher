/**
 * 翻译 Agent - 将英文翻译成适合儿童理解的中文
 * 使用快速模型（翻译任务对速度要求高）
 */
import { env } from '../config.js'

// 使用配置中的快速模型
const MODEL = env.models.turbo

const SYSTEM_PROMPT = `You are a translator helping Chinese elementary school students (ages 6-12) understand English.

Your task: Translate the English text to simple, natural Chinese that children can easily understand.

Rules:
1. Use simple Chinese words appropriate for children
2. Keep the translation natural and friendly
3. ONLY output the Chinese translation, nothing else
4. Do not add explanations or notes
5. Keep emoji if present in the original text`

export interface TranslationRequest {
  text: string  // 要翻译的英文文本
}

export interface TranslationResponse {
  translation: string  // 中文翻译
}

class TranslationAgent {
  private apiKey: string
  private baseUrl: string

  constructor() {
    this.apiKey = env.dashscope.apiKey
    this.baseUrl = env.dashscope.baseUrl

    if (!this.apiKey) {
      throw new Error('DASHSCOPE_API_KEY is required for TranslationAgent')
    }
  }

  async translate(text: string): Promise<string> {
    const startTime = Date.now()
    console.log(`[Translation] Translating: "${text.substring(0, 50)}..."`)

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text }
        ],
        temperature: 0.3,  // 翻译任务用较低温度保持准确
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Translation] API error:', errorText)
      throw new Error(`Translation API failed: ${response.status}`)
    }

    const result = await response.json() as {
      choices: Array<{ message: { content: string } }>
    }

    const translation = result.choices[0]?.message?.content?.trim() || ''

    console.log(`[Translation] Completed in ${Date.now() - startTime}ms`)
    console.log(`[Translation] Result: "${translation.substring(0, 50)}..."`)

    return translation
  }

  /**
   * 流式翻译 - 逐字输出翻译结果
   * @param text 要翻译的英文文本
   * @param onChunk 每收到一个文本块时的回调
   * @returns 完整的翻译结果
   */
  async translateStream(text: string, onChunk: (chunk: string) => void): Promise<string> {
    const startTime = Date.now()
    console.log(`[Translation] Stream translating: "${text.substring(0, 50)}..."`)

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text }
        ],
        temperature: 0.3,
        max_tokens: 500,
        stream: true,  // 启用流式输出
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Translation] API error:', errorText)
      throw new Error(`Translation API failed: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let fullTranslation = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const chunk = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>
            }

            const content = chunk.choices?.[0]?.delta?.content
            if (content) {
              fullTranslation += content
              onChunk(content)
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    console.log(`[Translation] Stream completed in ${Date.now() - startTime}ms`)
    console.log(`[Translation] Result: "${fullTranslation.substring(0, 50)}..."`)

    return fullTranslation
  }
}

export const translationAgent = new TranslationAgent()

