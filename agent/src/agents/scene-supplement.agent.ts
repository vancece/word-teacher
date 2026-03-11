/**
 * 场景补充 Agent - 用于 AI 辅助场景创建
 */
import { env } from '../config.js'

// 使用配置中的模型
const MODEL_TURBO = env.models.turbo  // 快速翻译
const MODEL_IMAGE = env.models.image   // 图片生成

const BATCH_TRANSLATE_PROMPT = `You are a translator helping Chinese elementary school students (ages 6-12) understand English.

Translate each English sentence to simple, natural Chinese that children can easily understand.

Input format: A JSON array of English sentences
Output format: A JSON array of Chinese translations IN THE SAME ORDER

Example:
Input: ["Hello!", "How are you?", "I am fine."]
Output: ["你好！", "你好吗？", "我很好。"]

Rules:
1. Use simple Chinese words appropriate for children
2. Keep translations natural and friendly
3. Output ONLY the JSON array, no explanations
4. Maintain the exact same order as input`

const IMAGE_PROMPT_GENERATOR = `Create an image prompt for a children's educational scene.
Requirements: colorful, cartoon style, no text, child-friendly, bright colors.
Output ONLY the image generation prompt (max 100 words).`

export interface SceneSupplementRequest {
  sceneName: string
  sceneDescription?: string
  sentences?: Array<{ english: string }>
  type: 'readAloud' | 'dialogue'
  skipCoverImage?: boolean  // 跳过封面图生成（图片生成太贵了）
}

export interface SceneSupplementResponse {
  translations?: Array<{ english: string; chinese: string }>
  coverImage?: string
  error?: string
}

class SceneSupplementAgent {
  private apiKey: string
  private baseUrl: string

  constructor() {
    this.apiKey = env.dashscope.apiKey
    this.baseUrl = env.dashscope.baseUrl
    if (!this.apiKey) console.warn('⚠️ DASHSCOPE_API_KEY is not set.')
  }

  async translateSentences(sentences: Array<{ english: string }>): Promise<Array<{ english: string; chinese: string }>> {
    if (sentences.length === 0) return []

    try {
      // 把所有英文句子打包成 JSON 数组
      const englishArray = sentences.map(s => s.english)

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: MODEL_TURBO,
          messages: [
            { role: 'system', content: BATCH_TRANSLATE_PROMPT },
            { role: 'user', content: JSON.stringify(englishArray) }
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      })

      if (!res.ok) {
        console.error('Batch translation failed:', await res.text())
        return sentences.map(s => ({ english: s.english, chinese: '' }))
      }

      const data = await res.json() as any
      const content = data.choices?.[0]?.message?.content?.trim() || ''

      // 解析返回的 JSON 数组
      let translations: string[] = []
      try {
        translations = JSON.parse(content)
      } catch {
        // 如果解析失败，尝试提取数组内容
        const match = content.match(/\[[\s\S]*\]/)
        if (match) {
          try { translations = JSON.parse(match[0]) } catch {}
        }
      }

      // 组合结果，确保顺序对应
      return sentences.map((s, i) => ({
        english: s.english,
        chinese: translations[i] || ''
      }))
    } catch (error) {
      console.error('Batch translation error:', error)
      return sentences.map(s => ({ english: s.english, chinese: '' }))
    }
  }

  private async waitForImage(taskId: string): Promise<string | null> {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const res = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      })
      if (!res.ok) {
        console.error(`[SceneSupplement] Task query failed: ${res.status}`)
        continue
      }
      const data = await res.json() as any
      const status = data.output?.task_status
      console.log(`[SceneSupplement] Image status: ${status} (${i + 1}/30)`)
      if (status === 'SUCCEEDED') {
        // V2 API 返回格式可能是 results[].url 或 results[].b64_image
        const result = data.output?.results?.[0]
        console.log('[SceneSupplement] Image result:', JSON.stringify(result))
        return result?.url || result?.b64_image || null
      }
      if (status === 'FAILED') {
        console.error('[SceneSupplement] Image generation failed:', JSON.stringify(data.output))
        return null
      }
    }
    return null
  }

  private async downloadAsBase64(url: string): Promise<string | null> {
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      const buf = Buffer.from(await res.arrayBuffer())
      return `data:${res.headers.get('content-type') || 'image/png'};base64,${buf.toString('base64')}`
    } catch { return null }
  }

  async generateCoverImage(name: string, desc?: string): Promise<string | null> {
    try {
      // Step 1: Generate prompt (中文提示词效果更好)
      const pRes = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: MODEL_TURBO,
          messages: [{ role: 'system', content: IMAGE_PROMPT_GENERATOR }, { role: 'user', content: `Scene: ${name}\nDescription: ${desc || name}` }],
          temperature: 0.7, max_tokens: 200,
        }),
      })
      if (!pRes.ok) return null
      const prompt = ((await pRes.json()) as any).choices?.[0]?.message?.content?.trim()
      if (!prompt) return null
      console.log(`[SceneSupplement] Image prompt: ${prompt}`)

      // Step 2: 使用万相V2 API (text2image)
      const imageReqBody = {
        model: MODEL_IMAGE,
        input: { prompt },
        parameters: { size: '512*512', n: 1 }
      }
      console.log('[SceneSupplement] Image request:', JSON.stringify(imageReqBody))

      const iRes = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-DashScope-Async': 'enable'
        },
        body: JSON.stringify(imageReqBody),
      })
      if (!iRes.ok) {
        const errText = await iRes.text()
        console.error('[SceneSupplement] Image API error:', errText)
        return null
      }
      const iResData = await iRes.json() as any
      console.log('[SceneSupplement] Image task response:', JSON.stringify(iResData))
      const taskId = iResData.output?.task_id
      if (!taskId) {
        console.error('[SceneSupplement] No task_id in response')
        return null
      }

      // Step 3: Wait and download
      const imgUrl = await this.waitForImage(taskId)
      return imgUrl ? await this.downloadAsBase64(imgUrl) : null
    } catch (e) { console.error('generateCoverImage error:', e); return null }
  }

  async supplement(req: SceneSupplementRequest): Promise<SceneSupplementResponse> {
    const res: SceneSupplementResponse = {}
    const tasks: Promise<void>[] = []

    // 翻译句子
    if (req.sentences?.length) {
      tasks.push(this.translateSentences(req.sentences).then(t => { res.translations = t }))
    }

    // 生成封面图（除非 skipCoverImage 为 true）
    if (!req.skipCoverImage) {
      tasks.push(this.generateCoverImage(req.sceneName, req.sceneDescription).then(img => { if (img) res.coverImage = img }))
    }

    await Promise.all(tasks)
    return res
  }
}

export const sceneSupplementAgent = new SceneSupplementAgent()

