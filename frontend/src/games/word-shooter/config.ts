/**
 * 单词游戏配置 - 单词包数据
 * 优先从后端 API 获取，API 不可用时使用本地 Demo 数据作为 fallback
 */

export interface WordItem {
  english: string
  chinese: string
  phonetic?: string
  audio?: string
  difficulty?: number
}

export interface WordPack {
  id: string
  name: string
  description?: string
  words: WordItem[]
}

// Demo 单词包（fallback）
export const DEMO_WORD_PACKS: WordPack[] = [
  {
    id: 'animals',
    name: '动物世界',
    description: '常见动物的英语单词',
    words: [
      { english: 'cat', chinese: '猫', difficulty: 1 },
      { english: 'dog', chinese: '狗', difficulty: 1 },
      { english: 'bird', chinese: '鸟', difficulty: 1 },
      { english: 'fish', chinese: '鱼', difficulty: 1 },
      { english: 'rabbit', chinese: '兔子', difficulty: 2 },
      { english: 'elephant', chinese: '大象', difficulty: 3 },
      { english: 'giraffe', chinese: '长颈鹿', difficulty: 3 },
      { english: 'dolphin', chinese: '海豚', difficulty: 2 },
      { english: 'penguin', chinese: '企鹅', difficulty: 2 },
      { english: 'butterfly', chinese: '蝴蝶', difficulty: 3 },
      { english: 'tiger', chinese: '老虎', difficulty: 2 },
      { english: 'monkey', chinese: '猴子', difficulty: 2 },
      { english: 'panda', chinese: '熊猫', difficulty: 2 },
      { english: 'snake', chinese: '蛇', difficulty: 1 },
      { english: 'horse', chinese: '马', difficulty: 1 },
    ],
  },
  {
    id: 'fruits',
    name: '水果乐园',
    description: '美味水果的英语单词',
    words: [
      { english: 'apple', chinese: '苹果', difficulty: 1 },
      { english: 'banana', chinese: '香蕉', difficulty: 1 },
      { english: 'orange', chinese: '橙子', difficulty: 1 },
      { english: 'grape', chinese: '葡萄', difficulty: 1 },
      { english: 'strawberry', chinese: '草莓', difficulty: 3 },
      { english: 'watermelon', chinese: '西瓜', difficulty: 3 },
      { english: 'pineapple', chinese: '菠萝', difficulty: 3 },
      { english: 'cherry', chinese: '樱桃', difficulty: 2 },
      { english: 'peach', chinese: '桃子', difficulty: 1 },
      { english: 'mango', chinese: '芒果', difficulty: 2 },
      { english: 'lemon', chinese: '柠檬', difficulty: 2 },
      { english: 'coconut', chinese: '椰子', difficulty: 2 },
      { english: 'blueberry', chinese: '蓝莓', difficulty: 3 },
      { english: 'kiwi', chinese: '猕猴桃', difficulty: 2 },
      { english: 'pear', chinese: '梨', difficulty: 1 },
    ],
  },
  {
    id: 'colors',
    name: '缤纷色彩',
    description: '颜色相关的英语单词',
    words: [
      { english: 'red', chinese: '红色', difficulty: 1 },
      { english: 'blue', chinese: '蓝色', difficulty: 1 },
      { english: 'green', chinese: '绿色', difficulty: 1 },
      { english: 'yellow', chinese: '黄色', difficulty: 1 },
      { english: 'purple', chinese: '紫色', difficulty: 2 },
      { english: 'orange', chinese: '橙色', difficulty: 1 },
      { english: 'pink', chinese: '粉色', difficulty: 1 },
      { english: 'brown', chinese: '棕色', difficulty: 1 },
      { english: 'black', chinese: '黑色', difficulty: 1 },
      { english: 'white', chinese: '白色', difficulty: 1 },
      { english: 'silver', chinese: '银色', difficulty: 2 },
      { english: 'golden', chinese: '金色', difficulty: 2 },
    ],
  },
]

const API_BASE = import.meta.env.PROD ? '/api' : '/api'

/**
 * 从后端获取单词包列表（按游戏类型）
 * API 失败时回退到 Demo 数据
 */
export async function fetchWordPacks(gameType?: string): Promise<WordPack[]> {
  try {
    const url = gameType
      ? `${API_BASE}/word-packs?gameType=${gameType}`
      : `${API_BASE}/word-packs`
    const res = await fetch(url)
    if (!res.ok) throw new Error('API error')
    const json = await res.json()
    if (json.success && json.data && json.data.length > 0) {
      return json.data.map((p: any) => ({
        id: String(p.id),
        name: p.name,
        description: p.description,
        words: p.words,
      }))
    }
  } catch {
    // API 不可用，使用 fallback
  }
  return DEMO_WORD_PACKS
}

/**
 * 获取指定单词包
 */
export async function fetchWordPack(packId: string): Promise<WordPack | undefined> {
  try {
    const res = await fetch(`${API_BASE}/word-packs/${packId}`)
    if (!res.ok) throw new Error('API error')
    const json = await res.json()
    if (json.success && json.data) {
      const p = json.data
      return { id: String(p.id), name: p.name, description: p.description, words: p.words }
    }
  } catch {
    // fallback
  }
  return DEMO_WORD_PACKS.find(p => p.id === packId)
}
