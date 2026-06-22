/**
 * Prisma Client Mock
 * 使用 vitest 的 mock 机制，为每个 model 创建 mock 方法
 */
import { vi } from 'vitest'

// 创建一个 model 的所有标准方法 mock
function createModelMock() {
  return {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue({ _avg: {}, _sum: {}, _count: {} }),
    groupBy: vi.fn().mockResolvedValue([]),
  }
}

export const prismaMock = {
  student: createModelMock(),
  teacher: createModelMock(),
  class: createModelMock(),
  classTeacher: createModelMock(),
  practiceRecord: createModelMock(),
  readAloudRecord: createModelMock(),
  wordGameRecord: createModelMock(),
  scene: createModelMock(),
  readAloudScene: createModelMock(),
  wordPack: createModelMock(),
}

// Mock prisma module
vi.mock('../../src/config/database.js', () => ({
  prisma: prismaMock,
}))

/**
 * 重置所有 mock（在每个 test 前调用）
 */
export function resetPrismaMocks() {
  Object.values(prismaMock).forEach(model => {
    Object.values(model).forEach(method => {
      if (typeof method === 'function' && 'mockReset' in method) {
        (method as any).mockReset()
      }
    })
  })
}
