import express from 'express'
import cors from 'cors'
import { env, validateEnv } from './config.js'
import { agentAuth } from './middleware/auth.js'
import dialogueRoutes from './routes/dialogue.routes.js'
import readAloudRoutes from './routes/read-aloud.routes.js'
import summaryRoutes from './routes/summary.routes.js'
import sceneSupplementRoutes from './routes/scene-supplement.routes.js'

// 开发环境：禁用 SSL 证书验证（解决阿里云 API 调用问题）
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

// Validate environment variables
validateEnv()

const app = express()

// Middleware
app.use(cors({ origin: env.cors.origins }))
app.use(express.json({ limit: '50mb' }))  // 增加限制以支持音频数据

// Agent API Key 认证（生产环境必须携带 X-Agent-Api-Key 头）
app.use('/api/agent', agentAuth)

// Routes
app.use('/api/agent', dialogueRoutes)
app.use('/api/agent/read-aloud', readAloudRoutes)
app.use('/api/agent/summary', summaryRoutes)
app.use('/api/agent/scene', sceneSupplementRoutes)

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'Echo Kid AI Agent',
    version: '1.0.0',
    endpoints: {
      health: '/api/agent/health',
      chat: 'POST /api/agent/chat',
      evaluate: 'POST /api/agent/evaluate',
      readAloud: 'POST /api/agent/read-aloud/evaluate',
    },
  })
})

// Start server
app.listen(env.server.port, () => {
  console.log(`
🤖 Echo Kid AI Agent is running!
📡 API:      http://localhost:${env.server.port}/api/agent
🔧 ENV:      ${env.server.nodeEnv}
📊 Health:   http://localhost:${env.server.port}/api/agent/health
  `)
})

