export type Scene = {
  id: string
  name: string
  grade: string
  rounds: number
  icon: string
  description: string
  vocabulary: string[]
  prompts: string[]
}

export const sceneLibrary: Scene[] = [
  {
    id: 'scene_001',
    name: '打招呼',
    grade: '1-2 年级',
    rounds: 3,
    icon: '👋',
    description: '学习日常问候和自我介绍开场。',
    vocabulary: ['hello', 'hi', 'morning', 'name'],
    prompts: [
      "Hello! Good morning! I'm your AI teacher.",
      'Nice to meet you! What is your name?',
      'Great! How are you today?',
    ],
  },
  {
    id: 'scene_004',
    name: '认识动物',
    grade: '2-3 年级',
    rounds: 4,
    icon: '🐶',
    description: '围绕动物名称与喜好进行简单表达。',
    vocabulary: ['dog', 'cat', 'bird', 'fish', 'like'],
    prompts: [
      'Look! I can see a cute dog. What animal do you like?',
      'Wonderful! Can you say it one more time slowly?',
      'Can your favorite animal run or fly?',
      'Excellent! Please say one full sentence about it.',
    ],
  },
  {
    id: 'scene_010',
    name: '购物',
    grade: '4-6 年级',
    rounds: 5,
    icon: '🛍️',
    description: '练习购物问答与礼貌表达。',
    vocabulary: ['buy', 'shop', 'money', 'how much', 'cheap'],
    prompts: [
      'Welcome to my shop! What do you want to buy?',
      'Good choice. How many do you want?',
      'It is ten yuan. Is that okay?',
      'Would you like anything else?',
      'Great shopping! Please say thank you and goodbye.',
    ],
  },
]
