import app from './app.js'
import { env } from './config/env.js'
import { connectDatabase, disconnectDatabase } from './config/database.js'
import { initMinio } from './services/minio.service.js'
import { knowledgeVectorService } from './services/knowledge-vector.service.js'
import { startHealthMonitor, stopHealthMonitor } from './services/health-monitor.service.js'
import { startPresenceCleanup } from './services/presence.service.js'
import { serverLogger, minioLogger, vectorLogger } from './utils/logger.js'

async function main() {
  // 连接数据库
  await connectDatabase()

  // 初始化 MinIO（异步，不阻塞启动）
  initMinio().catch((err) => {
    minioLogger.warn({ error: err }, 'Initialization failed, will retry on first use')
  })

  // 预加载 LanceDB 知识库索引（异步，不阻塞启动）
  knowledgeVectorService.init().then(async () => {
    const count = await knowledgeVectorService.getCount()
    vectorLogger.info({ count }, 'Knowledge vectors loaded')
  }).catch((err) => {
    vectorLogger.warn({ error: err }, 'Init failed, will retry on first search')
  })

  // 启动健康监控（5 分钟探测一次，unhealthy 时钉钉告警）
  startHealthMonitor()

  // 启动心跳清理（定期清除过期的在线状态记录）
  startPresenceCleanup()

  // 启动服务器
  const server = app.listen(env.port, () => {
    serverLogger.info({
      port: env.port,
      env: env.nodeEnv,
      api: `http://localhost:${env.port}/api`,
      health: `http://localhost:${env.port}/api/health`,
    }, '🚀 Server is running!')
  })

  // 优雅关闭
  const gracefulShutdown = async (signal: string) => {
    serverLogger.info({ signal }, 'Received shutdown signal, closing gracefully...')

    server.close(async () => {
      stopHealthMonitor()
      await disconnectDatabase()
      serverLogger.info('Server closed')
      process.exit(0)
    })

    // 强制退出超时
    setTimeout(() => {
      serverLogger.error('Forced shutdown after timeout')
      process.exit(1)
    }, 10000)
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
}

main().catch((error) => {
  serverLogger.fatal({ error }, 'Failed to start server')
  process.exit(1)
})



