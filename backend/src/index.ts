import app from './app.js'
import { env } from './config/env.js'
import { connectDatabase, disconnectDatabase } from './config/database.js'
import { initMinio } from './services/minio.service.js'
import { knowledgeVectorService } from './services/knowledge-vector.service.js'
import { logger } from './utils/logger.js'

async function main() {
  // 连接数据库
  await connectDatabase()

  // 初始化 MinIO（异步，不阻塞启动）
  initMinio().catch((err) => {
    logger.warn({ error: err }, '[MinIO] Initialization failed, will retry on first use')
  })

  // 预加载 LanceDB 知识库索引（异步，不阻塞启动）
  knowledgeVectorService.init().then(async () => {
    const count = await knowledgeVectorService.getCount()
    logger.info({ count }, '[VectorDB] Knowledge vectors loaded')
  }).catch((err) => {
    logger.warn({ error: err }, '[VectorDB] Init failed, will retry on first search')
  })

  // 启动服务器
  const server = app.listen(env.port, () => {
    logger.info({
      port: env.port,
      env: env.nodeEnv,
      api: `http://localhost:${env.port}/api`,
      health: `http://localhost:${env.port}/api/health`,
    }, '🚀 Server is running!')
  })

  // 优雅关闭
  const gracefulShutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal, closing gracefully...')

    server.close(async () => {
      await disconnectDatabase()
      logger.info('Server closed')
      process.exit(0)
    })

    // 强制退出超时
    setTimeout(() => {
      logger.error('Forced shutdown after timeout')
      process.exit(1)
    }, 10000)
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
}

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start server')
  process.exit(1)
})



