/**
 * 测试全局 setup
 * - Mock 环境变量（避免 env.ts 校验失败）
 * - Mock Prisma client
 */
import { vi } from 'vitest'

// 设置测试环境变量（在 env.ts 被 import 之前）
process.env.NODE_ENV = 'test'
process.env.PORT = '3001'
process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test'
process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long'
process.env.JWT_EXPIRES_IN = '7d'
process.env.AGENT_URL = 'http://localhost:8000/api/agent'
process.env.AGENT_API_KEY = 'test-agent-api-key'

// Mock pino logger（避免测试时输出大量日志）
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

// Mock knowledge vector service
vi.mock('../src/services/knowledge-vector.service.js', () => ({
  knowledgeVectorService: {
    search: vi.fn().mockResolvedValue([]),
    addDocument: vi.fn(),
    removeDocument: vi.fn(),
  },
}))
