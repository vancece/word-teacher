/**
 * 讯飞 ISE 账号池管理路由
 * 管理员专属：CRUD + 用量统计 + 状态查询
 */
import { Router } from 'express'
import { createHmac } from 'crypto'
import WebSocket from 'ws'
import { prisma } from '../../config/database.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { success } from '../../utils/response.js'
import type { TeacherRequest } from '../../types/index.js'

/**
 * 验证讯飞 ISE 账号凭证是否有效
 * 通过尝试 WebSocket 鉴权握手来检测
 */
async function verifyIseCredentials(appId: string, apiKey: string, apiSecret: string): Promise<{ valid: boolean; error?: string }> {
  const HOST = 'ise-api.xfyun.cn'
  const PATH = '/v2/open-ise'
  const date = new Date().toUTCString()

  const signatureOrigin = `host: ${HOST}\ndate: ${date}\nGET ${PATH} HTTP/1.1`
  const signature = createHmac('sha256', apiSecret).update(signatureOrigin).digest('base64')
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = Buffer.from(authorizationOrigin).toString('base64')
  const url = `wss://${HOST}${PATH}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(HOST)}`

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { ws.close() } catch {}
      resolve({ valid: false, error: '连接超时（10秒）' })
    }, 10000)

    const ws = new WebSocket(url)

    ws.on('open', () => {
      // 连接成功，发送一个最小的 SSB 帧来测试 appId 是否有效
      const ssbFrame = JSON.stringify({
        common: { app_id: appId },
        business: {
          sub: 'ise',
          ent: 'en_vip',
          category: 'read_sentence',
          aue: 'raw',
          auf: 'audio/L16;rate=16000',
          cmd: 'ssb',
          text: '\uFEFF[content]\nhello',
          tte: 'utf-8',
          rstcd: 'utf8',
          rst: 'entirety',
        },
        data: { status: 0 },
      })
      ws.send(ssbFrame)

      // 发送一帧静音然后结束，触发服务端处理
      const silentPcm = Buffer.alloc(1280, 0)
      ws.send(JSON.stringify({
        business: { cmd: 'auw', aus: 1 },
        data: { status: 2, data: silentPcm.toString('base64') },
      }))
    })

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const json = JSON.parse(data.toString())
        clearTimeout(timeout)

        if (json.code !== undefined && json.code !== 0) {
          // 有错误码 — 区分"凭证无效"和"额度耗尽"
          const code = json.code
          // 鉴权失败相关错误码
          if (code === 10005 || code === 10313 || code === 11200 || code === 11201 || code === 10200) {
            // 10313/11200/11201/10200 是额度相关，说明凭证本身是对的
            ws.close()
            resolve({ valid: true })
          } else {
            ws.close()
            resolve({ valid: false, error: `讯飞返回错误 ${code}: ${json.message || '未知错误'}` })
          }
          return
        }

        // 收到正常响应（包括评测结果），说明凭证有效
        if (json.data?.status === 2 || json.data?.status === 1) {
          ws.close()
          resolve({ valid: true })
        }
      } catch {}
    })

    ws.on('error', (err: Error) => {
      clearTimeout(timeout)
      // 鉴权失败时 WebSocket 会被服务端拒绝（401）
      if (err.message.includes('401') || err.message.includes('Unexpected server response')) {
        resolve({ valid: false, error: '鉴权失败：API Key 或 API Secret 不正确' })
      } else {
        resolve({ valid: false, error: `连接错误: ${err.message}` })
      }
    })

    ws.on('close', (code: number) => {
      clearTimeout(timeout)
      // 如果还没 resolve，检查 close code
      // 讯飞鉴权失败一般返回 4xx close 或直接断开
    })
  })
}

const router = Router()

/**
 * GET /api/admin/ise-accounts
 * 获取所有账号列表
 */
router.get('/', asyncHandler(async (req: TeacherRequest, res) => {
  if (!req.teacher!.isAdmin) {
    return res.status(403).json({ success: false, message: '仅管理员可操作' })
  }

  const accounts = await prisma.iseAccount.findMany({
    orderBy: { createdAt: 'asc' },
  })

  // 脱敏：apiSecret 只返回前4位 + ****
  const masked = accounts.map(acc => ({
    ...acc,
    apiSecret: acc.apiSecret.slice(0, 4) + '****',
  }))

  return success(res, masked)
}))

/**
 * POST /api/admin/ise-accounts
 * 新增账号（自动验证凭证有效性）
 */
router.post('/', asyncHandler(async (req: TeacherRequest, res) => {
  if (!req.teacher!.isAdmin) {
    return res.status(403).json({ success: false, message: '仅管理员可操作' })
  }

  const { appId, apiKey, apiSecret, label, dailyQuota, skipVerify } = req.body

  if (!appId || !apiKey || !apiSecret) {
    return res.status(400).json({ success: false, message: 'appId, apiKey, apiSecret 必填' })
  }

  // 验证凭证
  let credentialValid = true
  let verifyError = ''
  if (!skipVerify) {
    const verifyResult = await verifyIseCredentials(appId, apiKey, apiSecret)
    credentialValid = verifyResult.valid
    verifyError = verifyResult.error || ''
  }

  if (!credentialValid) {
    return res.status(400).json({
      success: false,
      message: `凭证验证失败: ${verifyError}`,
      code: 'CREDENTIAL_INVALID',
    })
  }

  const account = await prisma.iseAccount.create({
    data: {
      appId,
      apiKey,
      apiSecret,
      label: label || '未命名',
      dailyQuota: dailyQuota || 500,
    },
  })

  return success(res, { ...account, apiSecret: account.apiSecret.slice(0, 4) + '****' }, '添加成功', 201)
}))

/**
 * PUT /api/admin/ise-accounts/:id
 * 编辑账号（如果修改了凭证则自动验证）
 */
router.put('/:id', asyncHandler(async (req: TeacherRequest, res) => {
  if (!req.teacher!.isAdmin) {
    return res.status(403).json({ success: false, message: '仅管理员可操作' })
  }

  const id = parseInt(req.params.id)
  const { appId, apiKey, apiSecret, label, enabled, dailyQuota, skipVerify } = req.body

  const data: any = {}
  if (appId !== undefined) data.appId = appId
  if (apiKey !== undefined) data.apiKey = apiKey
  if (apiSecret !== undefined) data.apiSecret = apiSecret
  if (label !== undefined) data.label = label
  if (enabled !== undefined) data.enabled = enabled
  if (dailyQuota !== undefined) data.dailyQuota = dailyQuota

  // 如果修改了凭证相关字段，验证有效性
  const credentialChanged = appId || apiKey || apiSecret
  if (credentialChanged && !skipVerify) {
    // 需要取到完整的凭证来验证
    const existing = await prisma.iseAccount.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ success: false, message: '账号不存在' })
    }

    const verifyAppId = appId || existing.appId
    const verifyApiKey = apiKey || existing.apiKey
    const verifyApiSecret = apiSecret || existing.apiSecret

    const verifyResult = await verifyIseCredentials(verifyAppId, verifyApiKey, verifyApiSecret)
    if (!verifyResult.valid) {
      return res.status(400).json({
        success: false,
        message: `凭证验证失败: ${verifyResult.error}`,
        code: 'CREDENTIAL_INVALID',
      })
    }
  }

  const account = await prisma.iseAccount.update({
    where: { id },
    data,
  })

  return success(res, { ...account, apiSecret: account.apiSecret.slice(0, 4) + '****' })
}))

/**
 * POST /api/admin/ise-accounts/:id/verify
 * 手动验证账号凭证是否有效
 */
router.post('/:id/verify', asyncHandler(async (req: TeacherRequest, res) => {
  if (!req.teacher!.isAdmin) {
    return res.status(403).json({ success: false, message: '仅管理员可操作' })
  }

  const id = parseInt(req.params.id)
  const account = await prisma.iseAccount.findUnique({ where: { id } })
  if (!account) {
    return res.status(404).json({ success: false, message: '账号不存在' })
  }

  const result = await verifyIseCredentials(account.appId, account.apiKey, account.apiSecret)
  return success(res, { valid: result.valid, error: result.error || null })
}))

/**
 * DELETE /api/admin/ise-accounts/:id
 * 删除账号
 */
router.delete('/:id', asyncHandler(async (req: TeacherRequest, res) => {
  if (!req.teacher!.isAdmin) {
    return res.status(403).json({ success: false, message: '仅管理员可操作' })
  }

  const id = parseInt(req.params.id)
  await prisma.iseAccount.delete({ where: { id } })
  res.status(204).send()
}))

/**
 * POST /api/admin/ise-accounts/:id/toggle
 * 启用/禁用账号
 */
router.post('/:id/toggle', asyncHandler(async (req: TeacherRequest, res) => {
  if (!req.teacher!.isAdmin) {
    return res.status(403).json({ success: false, message: '仅管理员可操作' })
  }

  const id = parseInt(req.params.id)
  const account = await prisma.iseAccount.findUnique({ where: { id } })
  if (!account) {
    return res.status(404).json({ success: false, message: '账号不存在' })
  }

  const updated = await prisma.iseAccount.update({
    where: { id },
    data: { enabled: !account.enabled },
  })

  return success(res, { ...updated, apiSecret: updated.apiSecret.slice(0, 4) + '****' })
}))

/**
 * POST /api/admin/ise-accounts/reset-daily
 * 手动重置所有账号的每日用量（通常由定时任务自动执行）
 */
router.post('/reset-daily', asyncHandler(async (req: TeacherRequest, res) => {
  if (!req.teacher!.isAdmin) {
    return res.status(403).json({ success: false, message: '仅管理员可操作' })
  }

  await prisma.iseAccount.updateMany({
    data: { usedToday: 0, exhaustedAt: null },
  })

  return success(res, null, '已重置所有账号每日用量')
}))

/**
 * GET /api/admin/ise-accounts/pool
 * 获取账号池状态（供 Agent 服务调用，不脱敏）
 * 注意：此接口通过 AGENT_API_KEY 认证，不走 teacher 认证
 */
router.get('/pool', asyncHandler(async (req: TeacherRequest, res) => {
  // 允许管理员或通过 agent api key 访问
  const agentKey = req.headers['x-agent-api-key'] as string
  const isAgentCall = agentKey && agentKey === process.env.AGENT_API_KEY

  if (!req.teacher?.isAdmin && !isAgentCall) {
    return res.status(403).json({ success: false, message: '无权限' })
  }

  const accounts = await prisma.iseAccount.findMany({
    where: { enabled: true },
    orderBy: { createdAt: 'asc' },
  })

  return success(res, accounts)
}))

export default router
