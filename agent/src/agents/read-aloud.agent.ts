/**
 * 跟读评分 Agent - 两步走：
 * 1. 先用 Qwen-Omni 识别用户说了什么（提供原句作为参考，支持缩写容错）
 * 2. 再对比目标句子计算分数
 */
import { env } from '../config.js'

// 使用配置中的多模态对话模型
const MODEL_OMNI = env.models.omni

/**
 * 构建识别提示词 - 提供原句作为参考，支持缩写的语音等价识别
 *
 * 核心逻辑：
 * - 缩写和展开形式在语音上是等价的（What's = What is）
 * - 如果学生清晰地说出展开形式，应该识别为原句中的缩写形式
 * - 但如果学生说错了（不同的词、漏读、含糊），必须如实记录
 */
// 不提供原句，防止模型"作弊"
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
}

export interface ReadAloudResult {
  words: WordResult[]
  accuracy: number
  feedback: string
  spokenText?: string
}

export class ReadAloudAgent {
  private apiKey: string
  private baseUrl: string

  constructor() {
    this.apiKey = env.openai.apiKey
    this.baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  }

  /**
   * 两步评估：先识别（带原句参考），再对比
   */
  async evaluateAudio(originalSentence: string, audioBase64: string): Promise<ReadAloudResult> {
    console.log(`[ReadAloudAgent] Evaluating audio for: "${originalSentence}"`)

    // Step 1: 纯语音识别（不提供原句，防止模型作弊）
    const spokenText = await this.transcribeAudio(audioBase64)
    console.log(`[ReadAloudAgent] Transcribed: "${spokenText}"`)

    // Step 2: 对比评分
    return this.compareAndScore(originalSentence, spokenText)
  }

  /**
   * Step 1: 使用 Qwen-Omni 识别音频内容（纯语音识别，不提供原句）
   * @param audioBase64 音频数据
   */
  private async transcribeAudio(audioBase64: string): Promise<string> {
    // 清理 base64 数据：移除可能的 data URI 前缀，只保留纯 base64
    let cleanBase64 = audioBase64
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1]
    }
    cleanBase64 = cleanBase64.replace(/^data:audio\/\w+;base64,/, '')

    // 阿里云 Qwen-Omni 要求的格式: data:;base64,{base64_data}
    const audioData = `data:;base64,${cleanBase64}`

    console.log(`[ReadAloudAgent] Audio base64 length: ${cleanBase64.length}, first 50 chars: ${cleanBase64.substring(0, 50)}`)

    // 构建提示词（不提供原句，防止模型作弊）
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
        temperature: 0.1,  // 低温度，更准确
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[ReadAloudAgent] Transcribe API error:', errorText)
      return '(error)'
    }

    // 解析流式响应
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
   * Step 2: 对比识别结果和目标句子，计算分数
   * 支持缩写容错和数字容错
   */
  private compareAndScore(originalSentence: string, spokenText: string): ReadAloudResult {
    // 处理静音/错误情况
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

    // 规范化文本（移除标点，转小写）
    // 使用 Unicode 转义码确保匹配各种引号：
    // \u0027=' \u0022=" \u2018=' \u2019=' \u201C=" \u201D=" \u2010-\u2014=各种连字符
    const normalize = (text: string) => text
      .toLowerCase()
      .replace(/[.,!?\u0027\u0022\u2018\u2019\u201C\u201D\u2010-\u2014-]/g, '')
      .trim()

    // 过滤空字符串（原句末尾可能有空格导致空词）
    const originalWords = originalSentence.split(/\s+/).filter(w => w.length > 0)
    const spokenWords = spokenText.split(/\s+/)
    // 保存原始的 normalizedSpoken 用于多词匹配
    const normalizedSpokenOriginal = spokenWords.map(w => normalize(w))
    // 用于标记已使用的词
    const usedIndices = new Set<number>()

    // 检查是否说了中文
    const hasChinese = /[\u4e00-\u9fa5]/.test(spokenText)

    // 逐词对比（支持缩写和数字容错）
    const words: WordResult[] = originalWords.map((word) => {
      const normalizedOriginal = normalize(word)

      // 1. 精确匹配
      let foundIndex = normalizedSpokenOriginal.findIndex((w, i) => !usedIndices.has(i) && w === normalizedOriginal)
      if (foundIndex !== -1) {
        usedIndices.add(foundIndex)
        return { text: word, status: 'correct' as const }
      }

      // 2. 缩写容错匹配
      const equivalents = getEquivalentForms(normalizedOriginal)
      for (const equiv of equivalents) {
        // 单词等价（如 what's = whats）
        foundIndex = normalizedSpokenOriginal.findIndex((w, i) => !usedIndices.has(i) && w === equiv)
        if (foundIndex !== -1) {
          usedIndices.add(foundIndex)
          return { text: word, status: 'correct' as const }
        }
      }

      // 3. 多词展开匹配（如 "it's" 对应 "it is"）
      const multiWordMatch = tryMultiWordMatch(normalizedOriginal, normalizedSpokenOriginal, usedIndices)
      if (multiWordMatch.matched) {
        multiWordMatch.indices.forEach(i => usedIndices.add(i))
        return { text: word, status: 'correct' as const }
      }

      return { text: word, status: 'incorrect' as const }
    })

    // 计算准确率
    const correctCount = words.filter(w => w.status === 'correct').length
    const accuracy = Math.round((correctCount / words.length) * 100)

    // 生成反馈
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

/**
 * 缩写等价映射表
 * key: 缩写形式（规范化后，撇号已移除）
 * value: 等价的其他形式（也是规范化后的）
 *
 * 注意：normalize 会移除所有引号和撇号，所以：
 * - "it's" → "its"
 * - "isn't" → "isnt"
 * - "it is" → "it is"（空格保留，但这是多词形式，需要特殊处理）
 */
const CONTRACTION_EQUIVALENTS: Record<string, string[]> = {
  // 常见缩写（key 是 normalize 后的形式）
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
  "well": ["we will"],  // 注意：这个可能和 "well"（好）冲突，需要上下文判断
  "theyll": ["they will"],
  "id": ["i would", "i had"],
  "youd": ["you would", "you had"],
  "wed": ["we would", "we had"],
  "theyd": ["they would", "they had"],
}

/**
 * 数字等价映射表
 */
const NUMBER_EQUIVALENTS: Record<string, string[]> = {
  "0": ["zero"],
  "1": ["one"],
  "2": ["two"],
  "3": ["three"],
  "4": ["four"],
  "5": ["five"],
  "6": ["six"],
  "7": ["seven"],
  "8": ["eight"],
  "9": ["nine"],
  "10": ["ten"],
  "11": ["eleven"],
  "12": ["twelve"],
  "13": ["thirteen"],
  "14": ["fourteen"],
  "15": ["fifteen"],
  "16": ["sixteen"],
  "17": ["seventeen"],
  "18": ["eighteen"],
  "19": ["nineteen"],
  "20": ["twenty"],
  // normalize 会移除 -，所以 "twenty-one" → "twentyone"
  "21": ["twentyone"],
  "22": ["twentytwo"],
  "23": ["twentythree"],
  "24": ["twentyfour"],
  "25": ["twentyfive"],
  "26": ["twentysix"],
  "27": ["twentyseven"],
  "28": ["twentyeight"],
  "29": ["twentynine"],
  "30": ["thirty"],
  "40": ["forty"],
  "50": ["fifty"],
  "60": ["sixty"],
  "70": ["seventy"],
  "80": ["eighty"],
  "90": ["ninety"],
  "100": ["hundred"],  // "one hundred" 是两个词，需要多词匹配
}

/**
 * 获取一个词的所有等价形式
 */
function getEquivalentForms(word: string): string[] {
  const equivalents: string[] = []

  // 检查缩写等价
  if (CONTRACTION_EQUIVALENTS[word]) {
    equivalents.push(...CONTRACTION_EQUIVALENTS[word])
  }

  // 反向检查：如果 word 是展开形式，找对应的缩写
  for (const [contraction, forms] of Object.entries(CONTRACTION_EQUIVALENTS)) {
    if (forms.includes(word)) {
      equivalents.push(contraction)
      // 也添加其他等价形式
      equivalents.push(...forms.filter(f => f !== word))
    }
  }

  // 检查数字等价
  if (NUMBER_EQUIVALENTS[word]) {
    equivalents.push(...NUMBER_EQUIVALENTS[word])
  }

  // 反向检查数字
  for (const [number, forms] of Object.entries(NUMBER_EQUIVALENTS)) {
    if (forms.includes(word)) {
      equivalents.push(number)
      equivalents.push(...forms.filter(f => f !== word))
    }
  }

  return [...new Set(equivalents)] // 去重
}

/**
 * 尝试多词匹配（如 "it's" 对应连续的 "it" + "is"）
 */
function tryMultiWordMatch(
  originalWord: string,
  spokenWords: string[],
  usedIndices: Set<number>
): { matched: boolean; indices: number[] } {
  // 缩写到多词的映射（key 和 value 都是 normalize 后的形式）
  const expansions: Record<string, string[]> = {
    "whats": ["what", "is"],
    "its": ["it", "is"],
    "isnt": ["is", "not"],
    "thats": ["that", "is"],
    "theres": ["there", "is"],
    "heres": ["here", "is"],
    "hes": ["he", "is"],
    "shes": ["she", "is"],
    "lets": ["let", "us"],
    "dont": ["do", "not"],
    "doesnt": ["does", "not"],
    "didnt": ["did", "not"],
    "cant": ["can", "not"],
    "wont": ["will", "not"],
    "wouldnt": ["would", "not"],
    "couldnt": ["could", "not"],
    "shouldnt": ["should", "not"],
    "im": ["i", "am"],
    "youre": ["you", "are"],
    "were": ["we", "are"],
    "theyre": ["they", "are"],
    "ive": ["i", "have"],
    "youve": ["you", "have"],
    "weve": ["we", "have"],
    "theyve": ["they", "have"],
    "ill": ["i", "will"],
    "youll": ["you", "will"],
    // "well" 不加，因为会和 "well"（好）冲突
    "theyll": ["they", "will"],
    "id": ["i", "would"],
    "youd": ["you", "would"],
    "wed": ["we", "would"],
    "theyd": ["they", "would"],
    // 数字的多词形式
    "21": ["twenty", "one"],
    "22": ["twenty", "two"],
    "23": ["twenty", "three"],
    "24": ["twenty", "four"],
    "25": ["twenty", "five"],
    "26": ["twenty", "six"],
    "27": ["twenty", "seven"],
    "28": ["twenty", "eight"],
    "29": ["twenty", "nine"],
  }

  const expansion = expansions[originalWord]
  if (!expansion) {
    return { matched: false, indices: [] }
  }

  // 查找连续的多词匹配
  for (let i = 0; i <= spokenWords.length - expansion.length; i++) {
    // 检查这个位置开始的词是否都未使用
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

    if (allMatch) {
      return { matched: true, indices }
    }
  }

  return { matched: false, indices: [] }
}

export const readAloudAgent = new ReadAloudAgent()

