import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  AGENT_URL: z.string().default('http://localhost:8000/api/agent'),
  AGENT_API_KEY: z.string().optional(), // Agent 服务间通信密钥
  CORS_ORIGINS: z.string().optional(), // 允许的前端域名，逗号分隔
  AI_API_KEY: z.string().optional(),
  AI_API_URL: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.format())
  process.exit(1)
}

// 解析 CORS 域名列表
const parseCorsOrigins = (origins: string | undefined, isDev: boolean): string[] => {
  if (isDev) {
    // 开发环境允许多个可能的端口（端口可能被占用自动切换）
    return [
      'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176',
      'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:5175', 'http://127.0.0.1:5176',
    ]
  }
  if (!origins) {
    return []
  }
  return origins.split(',').map(s => s.trim()).filter(Boolean)
}

const isDev = parsed.data.NODE_ENV === 'development'

export const env = {
  port: parseInt(parsed.data.PORT, 10),
  nodeEnv: parsed.data.NODE_ENV,
  isDev,
  isProd: parsed.data.NODE_ENV === 'production',
  databaseUrl: parsed.data.DATABASE_URL,
  jwt: {
    secret: parsed.data.JWT_SECRET,
    expiresIn: parsed.data.JWT_EXPIRES_IN,
  },
  agent: {
    url: parsed.data.AGENT_URL,
    apiKey: parsed.data.AGENT_API_KEY || '',
  },
  cors: {
    origins: parseCorsOrigins(parsed.data.CORS_ORIGINS, isDev),
  },
  ai: {
    apiKey: parsed.data.AI_API_KEY,
    apiUrl: parsed.data.AI_API_URL,
  },
}

