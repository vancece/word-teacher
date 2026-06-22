import { PrismaClient } from '@prisma/client'
import { env } from './env.js'
import { dbLogger } from '../utils/logger.js'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDev
      ? [
          { level: 'query', emit: 'event' },
          { level: 'error', emit: 'stdout' },
          { level: 'warn', emit: 'stdout' },
        ]
      : [{ level: 'error', emit: 'stdout' }],
  })

// 开发环境记录慢查询
if (env.isDev) {
  prisma.$on('query' as never, (e: { query: string; duration: number }) => {
    if (e.duration > 100) {
      dbLogger.warn({ query: e.query, duration: `${e.duration}ms` }, 'Slow query detected')
    }
  })
  globalForPrisma.prisma = prisma
}

export async function connectDatabase(maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$connect()
      dbLogger.info('Database connected successfully')
      return
    } catch (error) {
      if (attempt === maxRetries) {
        dbLogger.error({ error }, 'Database connection failed after all retries')
        process.exit(1)
      }
      dbLogger.warn(
        { attempt, maxRetries },
        `Database connection failed, retrying in ${attempt}s...`
      )
      await new Promise((r) => setTimeout(r, attempt * 1000))
    }
  }
}

export async function disconnectDatabase() {
  await prisma.$disconnect()
  dbLogger.info('Database disconnected')
}

