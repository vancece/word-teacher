/**
 * 跟读评测 Agent - 两套方案：
 * 主方案: 腾讯云 SOE 声学级评测（音素级精度，不依赖 AI）
 * 备方案: 阿里云 STT 识别 + 文本对比（SOE 不可用时 fallback）
 */
import { env } from '../config.js'
import { aliyunSttService } from '../services/aliyun-stt.service.js'
import { tencentSoeService, type SOEEvaluateResult } from '../services/tencent-soe.service.js'

const MODEL_OMNI = env.models.omni

const buildTranscribePrompt = () => `You are a speech-to-text system. Transcribe EXACTLY what you hear in the audio.

Rules:
1. If you hear silence, noise, or no clear speech → output: (silence)
2. Transcribe exactly what is said, word for word
3. Do NOT guess or assume what the speaker intended to say

Output ONLY the transcription or (silence). No explanations.`

export interface WordResult {
  text: string
  status: 'correct' | 'incorrect' | 'missing'
  spoken?: string
  // SOE 新增字段
  accuracy?: number
  fluency?: number
  matchTag?: 'correct' | 'extra' | 'missing' | 'mispronounced'
  phoneInfos?: Array<{
    phone: string
    accuracy: number
    detectedStress: boolean
    referencePhone: string
  }>
}

export interface ReadAloudResult {
  words: WordResult[]
  accuracy: number
  feedback: string
  spokenText?: string
  // SOE 新增字段
  fluency?: number
  completeness?: number
  suggestedScore?: number
  evaluationMethod: 'soe' | 'stt-compare'
}

export class ReadAloudAgent {
  private apiKey: string
  private baseUrl: string

  constructor() {
    this.apiKey = env.openai.apiKey
    this.baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  }

  /**
   * 评估音频 - 优先 SOE，fallback 到旧方案
   */
  async evaluateAudio(originalSentence: string, audioBase64: string): Promise<ReadAloudResult> {
    console.log(`[ReadAloudAgent] Evaluating: "${originalSentence}"`)

    // 主方案: 腾讯云 SOE
    if (tencentSoeService.isConfigured()) {
      try {
        const soeResult = await tencentSoeService.evaluate(originalSentence, audioBase64)
        if (soeResult.success && soeResult.data) {
          console.log(`[ReadAloudAgent] SOE success: accuracy=${soeResult.data.accuracy}, suggestedScore=${soeResult.data.suggestedScore}`)
          return this.formatSOEResult(originalSentence, soeResult)
        }
        console.warn(`[ReadAloudAgent] SOE failed: ${soeResult.error}, falling back to STT`)
      } catch (err) {
        console.warn(`[ReadAloudAgent] SOE error: ${err}, falling back to STT`)
      }
    }

    // 备方案: STT + 文本对比
    console.log(`[ReadAloudAgent] Using fallback: STT + text comparison`)
    const spokenText = await this.transcribeAudio(audioBase64)
    console.log(`[ReadAloudAgent] Transcribed: "${spokenText}"`)
    return { ...this.compareAndScore(originalSentence, spokenText), evaluationMethod: 'stt-compare' }
  }

  /**
   * 将 SOE 结果格式化为统一的 ReadAloudResult
   */
  private formatSOEResult(originalSentence: string, soeResult: SOEEvaluateResult): ReadAloudResult {
    const data = soeResult.data!
    // 保留原句单词的大小写
    const originalWords = originalSentence.split(/\s+/).filter(w => w.length > 0)

    // 辅助: 去标点小写化用于匹配
    const normalizeForMatch = (text: string) => text.toLowerCase().replace(/[.,!?'"''"";\-:]/g, '').trim()

    // 过滤掉 extra 词（多读的，原句里没有）
    const soeNonExtra = data.words.filter(w => w.matchTag !== 'extra')

    // 建立 SOE 词到原句词的映射关系
    // 策略: 将 SOE 连续的小词合并匹配原句单词（处理缩写被拆开的情况，如 "isn't" → "isn" + "t"）
    const soeToOrigMap = new Map<number, string>() // soeNonExtra index -> 原句文本

    let origIdx = 0
    let soeIdx = 0
    while (soeIdx < soeNonExtra.length && origIdx < originalWords.length) {
      const origNorm = normalizeForMatch(originalWords[origIdx])
      const soeNorm = normalizeForMatch(soeNonExtra[soeIdx].word)

      if (soeNorm === origNorm) {
        // 完全匹配
        soeToOrigMap.set(soeIdx, originalWords[origIdx])
        soeIdx++
        origIdx++
      } else if (origNorm.startsWith(soeNorm)) {
        // 原句单词可能被 SOE 拆成多个小词（如 "isn't" → "isn" + "t"）
        // 尝试向后合并 SOE 词直到匹配原句词
        let merged = soeNorm
        let lookAhead = soeIdx + 1
        let matched = false
        while (lookAhead < soeNonExtra.length && merged.length < origNorm.length) {
          merged += normalizeForMatch(soeNonExtra[lookAhead].word)
          if (merged === origNorm) {
            // 所有被拆开的 SOE 词都映射到同一个原句单词
            for (let k = soeIdx; k <= lookAhead; k++) {
              soeToOrigMap.set(k, k === soeIdx ? originalWords[origIdx] : '')
            }
            soeIdx = lookAhead + 1
            origIdx++
            matched = true
            break
          }
          lookAhead++
        }
        if (!matched) {
          // 合并失败，跳过
          soeToOrigMap.set(soeIdx, originalWords[origIdx])
          soeIdx++
          origIdx++
        }
      } else {
        // 不匹配，尝试跳过（可能 SOE 多识别了或者原句里少了）
        soeToOrigMap.set(soeIdx, originalWords[origIdx])
        soeIdx++
        origIdx++
      }
    }

    // 将 soeNonExtra 的索引映射回完整 data.words 数组的索引
    let nonExtraIdx = 0
    const words: WordResult[] = []
    for (const w of data.words) {
      // 将 SOE matchTag 映射为前端 status
      let status: 'correct' | 'incorrect' | 'missing' = 'correct'
      if (w.matchTag === 'missing') status = 'missing'
      else if (w.matchTag === 'mispronounced' || w.matchTag === 'extra') status = 'incorrect'
      // matchTag=correct 但 accuracy 极低时才标 incorrect（避免弱读词被误判）
      if (w.matchTag === 'correct' && w.accuracy < 40) status = 'incorrect'

      let displayText = w.word
      let skip = false
      if (w.matchTag !== 'extra') {
        const mapped = soeToOrigMap.get(nonExtraIdx)
        if (mapped === '') {
          // 这是缩写被拆开的后续部分（已合并到前一个词），跳过
          skip = true
        } else if (mapped !== undefined) {
          displayText = mapped
        }
        nonExtraIdx++
      }

      if (!skip) {
        words.push({
          text: displayText,
          status,
          spoken: w.realWord,
          accuracy: w.accuracy,
          fluency: w.fluency,
          matchTag: w.matchTag,
          phoneInfos: w.phoneInfos,
        })
      }
    }

    // 使用 SOE 的 suggestedScore 作为准确率（更合理）
    const accuracy = Math.round(data.suggestedScore)

    // 基于分数生成反馈
    let feedback: string
    if (accuracy >= 90) {
      feedback = '太棒了！发音非常标准！🌟'
    } else if (accuracy >= 75) {
      feedback = '不错！大部分发音很准确！'
    } else if (accuracy >= 60) {
      feedback = '还可以，再练习一下会更好！'
    } else if (accuracy >= 40) {
      feedback = '加油！注意标红的单词，多听多练！'
    } else {
      feedback = '别灰心！跟着原音多读几遍吧！'
    }

    return {
      words,
      accuracy,
      feedback,
      fluency: data.fluency,
      completeness: data.completeness,
      suggestedScore: data.suggestedScore,
      evaluationMethod: 'soe',
    }
  }

  /**
   * STT 语音识别 - 优先阿里云 STT，fallback 到 Qwen-Omni
   */
  private async transcribeAudio(audioBase64: string): Promise<string> {
    let cleanBase64 = audioBase64
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1]
    }
    cleanBase64 = cleanBase64.replace(/^data:audio\/\w+;base64,/, '')

    // 优先阿里云 STT
    if (aliyunSttService.isConfigured()) {
      try {
        const result = await aliyunSttService.transcribe(cleanBase64)
        if (result.success && result.text) {
          return result.text
        }
        if (result.success && !result.text) {
          return '(silence)'
        }
        console.warn(`[ReadAloudAgent] Aliyun STT failed: ${result.error}`)
      } catch (err) {
        console.warn(`[ReadAloudAgent] Aliyun STT error: ${err}`)
      }
    }

    // Fallback: Qwen-Omni
    return this.transcribeWithQwenOmni(cleanBase64)
  }

  private async transcribeWithQwenOmni(cleanBase64: string): Promise<string> {
    const audioData = `data:;base64,${cleanBase64}`
    const prompt = buildTranscribePrompt()

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_OMNI,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'input_audio', input_audio: { data: audioData, format: 'wav' } },
              { type: 'text', text: prompt },
            ],
          },
        ],
        modalities: ['text'],
        stream: true,
        temperature: 0.1,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[ReadAloudAgent] Qwen-Omni API error:', errorText)
      return '(error)'
    }

    let text = ''
    const reader = response.body?.getReader()
    if (!reader) return '(error)'

    const decoder = new TextDecoder()
    let buffer = ''

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
            const chunk = JSON.parse(data)
            const content = chunk.choices?.[0]?.delta?.content
            if (content) text += content
          } catch { /* ignore */ }
        }
      }
    }

    return text.trim() || '(silence)'
  }

  /**
   * 旧方案: 文本对比评分（作为 fallback）
   */
  private compareAndScore(originalSentence: string, spokenText: string): Omit<ReadAloudResult, 'evaluationMethod'> {
    if (!spokenText || spokenText === '(silence)' || spokenText === '(error)') {
      return {
        words: originalSentence.split(/\s+/).map(word => ({
          text: word,
          status: 'missing' as const,
        })),
        accuracy: 0,
        feedback: spokenText === '(error)' ? '识别出错，请重试！' : '没有检测到声音，请大声朗读！',
        spokenText,
      }
    }

    const normalize = (text: string) => text
      .toLowerCase()
      .replace(/[.,!?\u0027\u0022\u2018\u2019\u201C\u201D\u2010-\u2014-]/g, '')
      .trim()

    const originalWords = originalSentence.split(/\s+/).filter(w => w.length > 0)
    const spokenWords = spokenText.split(/\s+/)
    const normalizedSpokenOriginal = spokenWords.map(w => normalize(w))
    const usedIndices = new Set<number>()

    const hasChinese = /[\u4e00-\u9fa5]/.test(spokenText)

    const words: WordResult[] = originalWords.map((word) => {
      const normalizedOriginal = normalize(word)

      let foundIndex = normalizedSpokenOriginal.findIndex((w, i) => !usedIndices.has(i) && w === normalizedOriginal)
      if (foundIndex !== -1) {
        usedIndices.add(foundIndex)
        return { text: word, status: 'correct' as const }
      }

      const equivalents = getEquivalentForms(normalizedOriginal)
      for (const equiv of equivalents) {
        foundIndex = normalizedSpokenOriginal.findIndex((w, i) => !usedIndices.has(i) && w === equiv)
        if (foundIndex !== -1) {
          usedIndices.add(foundIndex)
          return { text: word, status: 'correct' as const }
        }
      }

      const multiWordMatch = tryMultiWordMatch(normalizedOriginal, normalizedSpokenOriginal, usedIndices)
      if (multiWordMatch.matched) {
        multiWordMatch.indices.forEach(i => usedIndices.add(i))
        return { text: word, status: 'correct' as const }
      }

      return { text: word, status: 'incorrect' as const }
    })

    const correctCount = words.filter(w => w.status === 'correct').length
    const accuracy = Math.round((correctCount / words.length) * 100)

    let feedback: string
    if (hasChinese && accuracy < 50) {
      feedback = '你说的是中文哦，试着说英语吧！'
    } else if (accuracy >= 90) {
      feedback = '太棒了！发音非常标准！'
    } else if (accuracy >= 70) {
      feedback = '不错！继续加油！'
    } else if (accuracy >= 50) {
      feedback = '再练习一下，你可以更好！'
    } else {
      feedback = '加油！多听多练！'
    }

    return { words, accuracy, feedback, spokenText }
  }
}

// 缩写等价映射表
const CONTRACTION_EQUIVALENTS: Record<string, string[]> = {
  "whats": ["what is"],
  "its": ["it is"],
  "isnt": ["is not"],
  "thats": ["that is"],
  "theres": ["there is"],
  "heres": ["here is"],
  "hes": ["he is"],
  "shes": ["she is"],
  "lets": ["let us"],
  "dont": ["do not"],
  "doesnt": ["does not"],
  "didnt": ["did not"],
  "cant": ["cannot", "can not"],
  "wont": ["will not"],
  "wouldnt": ["would not"],
  "couldnt": ["could not"],
  "shouldnt": ["should not"],
  "im": ["i am"],
  "youre": ["you are"],
  "were": ["we are"],
  "theyre": ["they are"],
  "ive": ["i have"],
  "youve": ["you have"],
  "weve": ["we have"],
  "theyve": ["they have"],
  "ill": ["i will"],
  "youll": ["you will"],
  "well": ["we will"],
  "theyll": ["they will"],
  "id": ["i would", "i had"],
  "youd": ["you would", "you had"],
  "wed": ["we would", "we had"],
  "theyd": ["they would", "they had"],
}

const NUMBER_EQUIVALENTS: Record<string, string[]> = {
  "0": ["zero"], "1": ["one"], "2": ["two"], "3": ["three"], "4": ["four"],
  "5": ["five"], "6": ["six"], "7": ["seven"], "8": ["eight"], "9": ["nine"],
  "10": ["ten"], "11": ["eleven"], "12": ["twelve"], "13": ["thirteen"],
  "14": ["fourteen"], "15": ["fifteen"], "16": ["sixteen"], "17": ["seventeen"],
  "18": ["eighteen"], "19": ["nineteen"], "20": ["twenty"],
  "21": ["twentyone"], "22": ["twentytwo"], "23": ["twentythree"],
  "24": ["twentyfour"], "25": ["twentyfive"], "26": ["twentysix"],
  "27": ["twentyseven"], "28": ["twentyeight"], "29": ["twentynine"],
  "30": ["thirty"], "40": ["forty"], "50": ["fifty"], "60": ["sixty"],
  "70": ["seventy"], "80": ["eighty"], "90": ["ninety"], "100": ["hundred"],
}

function getEquivalentForms(word: string): string[] {
  const equivalents: string[] = []
  if (CONTRACTION_EQUIVALENTS[word]) {
    equivalents.push(...CONTRACTION_EQUIVALENTS[word])
  }
  for (const [contraction, forms] of Object.entries(CONTRACTION_EQUIVALENTS)) {
    if (forms.includes(word)) {
      equivalents.push(contraction)
      equivalents.push(...forms.filter(f => f !== word))
    }
  }
  if (NUMBER_EQUIVALENTS[word]) {
    equivalents.push(...NUMBER_EQUIVALENTS[word])
  }
  for (const [number, forms] of Object.entries(NUMBER_EQUIVALENTS)) {
    if (forms.includes(word)) {
      equivalents.push(number)
      equivalents.push(...forms.filter(f => f !== word))
    }
  }
  return [...new Set(equivalents)]
}

function tryMultiWordMatch(
  originalWord: string,
  spokenWords: string[],
  usedIndices: Set<number>
): { matched: boolean; indices: number[] } {
  const expansions: Record<string, string[]> = {
    "whats": ["what", "is"], "its": ["it", "is"], "isnt": ["is", "not"],
    "thats": ["that", "is"], "theres": ["there", "is"], "heres": ["here", "is"],
    "hes": ["he", "is"], "shes": ["she", "is"], "lets": ["let", "us"],
    "dont": ["do", "not"], "doesnt": ["does", "not"], "didnt": ["did", "not"],
    "cant": ["can", "not"], "wont": ["will", "not"], "wouldnt": ["would", "not"],
    "couldnt": ["could", "not"], "shouldnt": ["should", "not"],
    "im": ["i", "am"], "youre": ["you", "are"], "were": ["we", "are"],
    "theyre": ["they", "are"], "ive": ["i", "have"], "youve": ["you", "have"],
    "weve": ["we", "have"], "theyve": ["they", "have"],
    "ill": ["i", "will"], "youll": ["you", "will"], "theyll": ["they", "will"],
    "id": ["i", "would"], "youd": ["you", "would"], "wed": ["we", "would"],
    "theyd": ["they", "would"],
    "21": ["twenty", "one"], "22": ["twenty", "two"], "23": ["twenty", "three"],
    "24": ["twenty", "four"], "25": ["twenty", "five"], "26": ["twenty", "six"],
    "27": ["twenty", "seven"], "28": ["twenty", "eight"], "29": ["twenty", "nine"],
  }

  const expansion = expansions[originalWord]
  if (!expansion) return { matched: false, indices: [] }

  for (let i = 0; i <= spokenWords.length - expansion.length; i++) {
    const indices: number[] = []
    let allMatch = true
    for (let j = 0; j < expansion.length; j++) {
      const idx = i + j
      if (usedIndices.has(idx) || spokenWords[idx] !== expansion[j]) {
        allMatch = false
        break
      }
      indices.push(idx)
    }
    if (allMatch) return { matched: true, indices }
  }

  return { matched: false, indices: [] }
}

export const readAloudAgent = new ReadAloudAgent()
