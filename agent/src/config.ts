import { config } from 'dotenv'

config()

const isDev = process.env.NODE_ENV !== 'production'

export const env = {
  openai: {
    // 优先使用 OPENAI_API_KEY，如果没有则回退到 DASHSCOPE_API_KEY
    apiKey: process.env.OPENAI_API_KEY || process.env.DASHSCOPE_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.OPENAI_MODEL || 'qwen-plus',
  },
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  models: {
    // 对话模型（支持语音输入输出的多模态模型）
    omni: process.env.MODEL_OMNI || 'qwen-omni-turbo',
    // 高质量模型（评分、复杂推理等需要高质量输出的任务）
    plus: process.env.MODEL_PLUS || 'qwen-plus',
    // 快速模型（翻译、简单生成等对速度要求高的任务）
    turbo: process.env.MODEL_TURBO || 'qwen-plus',
    // 图片生成模型
    image: process.env.MODEL_IMAGE || 'wanx2.1-t2i-turbo',
  },
  // 阿里云智能语音交互（对话场景一句话识别）
  aliyunStt: {
    appKey: process.env.ALIYUN_STT_APPKEY || '',
    token: process.env.ALIYUN_STT_TOKEN || '',
    accessKeyId: process.env.ALIYUN_AK_ID || '',
    accessKeySecret: process.env.ALIYUN_AK_SECRET || '',
  },
  // 科大讯飞语音评测 (ISE)
  xfyunIse: {
    appId: process.env.XFYUN_APP_ID || '',
    apiKey: process.env.XFYUN_API_KEY || '',
    apiSecret: process.env.XFYUN_API_SECRET || '',
  },
  server: {
    port: parseInt(process.env.PORT || '8000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    isDev,
  },
  backend: {
    apiUrl: process.env.BACKEND_API_URL || 'http://localhost:3001/api',
  },
  // Agent 服务间认证密钥（Backend 调用 Agent 时需要携带）
  auth: {
    apiKey: process.env.AGENT_API_KEY || '',
  },
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174')
      .split(',')
      .map((s) => s.trim()),
  },
}

// Validate required env vars
export function validateEnv(): void {
  if (!env.openai.apiKey && !env.dashscope.apiKey) {
    console.warn('⚠️  OPENAI_API_KEY / DASHSCOPE_API_KEY is not set. AI features will not work.')
  }
  if (!env.auth.apiKey && !isDev) {
    console.warn('⚠️  AGENT_API_KEY is not set. Agent API is unprotected!')
  }
  if (!env.xfyunIse.appId || !env.xfyunIse.apiKey || !env.xfyunIse.apiSecret) {
    console.warn('⚠️  XFYUN_APP_ID/API_KEY/API_SECRET is not set. 语音评测功能不可用！')
  }
}
