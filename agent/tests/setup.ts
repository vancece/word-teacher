/**
 * Agent 测试全局 setup
 */
import { vi } from 'vitest'

// 设置测试环境变量
process.env.NODE_ENV = 'test'
process.env.OPENAI_API_KEY = 'test-openai-key'
process.env.OPENAI_BASE_URL = 'http://localhost:11434/v1'
process.env.BACKEND_API_URL = 'http://localhost:3001/api'
process.env.AGENT_API_KEY = 'test-agent-key'
process.env.PORT = '8000'

// Mock pino logger
vi.mock('../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}))
