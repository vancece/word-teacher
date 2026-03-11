/**
 * 阿里云智能语音交互 - 一句话识别 RESTful API
 * 文档: https://help.aliyun.com/zh/isi/developer-reference/restful-api-2
 *
 * 用于将学生的语音输入转换为文字，比 Qwen-Omni 成本更低
 *
 * Token 获取方式：
 * 1. 直接配置 ALIYUN_STT_TOKEN（适合测试，Token 有效期约 24 小时）
 * 2. 配置 ALIYUN_AK_ID 和 ALIYUN_AK_SECRET，自动获取和刷新 Token（推荐生产环境）
 *
 * @version 1.0.1 - 强制重启以应用阿里云 STT 环境变量
 */

import crypto from 'crypto'
import { env } from '../config.js'

interface AliyunSttResult {
  text: string
  success: boolean
  error?: string
  taskId?: string
}

// Token 缓存
let cachedToken: string | null = null
let tokenExpireTime: number = 0

/**
 * 阿里云智能语音交互 STT 服务
 */
class AliyunSttService {
  private get appKey() { return env.aliyunStt.appKey }
  private get configuredToken() { return env.aliyunStt.token }
  private get accessKeyId() { return env.aliyunStt.accessKeyId }
  private get accessKeySecret() { return env.aliyunStt.accessKeySecret }

  /**
   * 检查是否配置了阿里云 STT
   * 需要 AppKey + (Token 或 AccessKey)
   */
  isConfigured(): boolean {
    if (!this.appKey) return false
    // 方式1: 直接配置了 Token
    if (this.configuredToken) return true
    // 方式2: 配置了 AccessKey
    return !!(this.accessKeyId && this.accessKeySecret)
  }

  /**
   * 获取 Token（带缓存）
   * 优先使用直接配置的 Token，否则通过 AccessKey 动态获取
   */
  async getToken(): Promise<string> {
    // 如果直接配置了 Token，优先使用
    if (this.configuredToken) {
      return this.configuredToken
    }

    const now = Date.now()
    // 如果 token 还有超过 1 小时有效期，直接返回缓存
    if (cachedToken && tokenExpireTime > now + 3600000) {
      return cachedToken
    }

    console.log('[AliyunSTT] Fetching new token via AccessKey...')

    try {
      const token = await this.fetchToken()
      return token
    } catch (error) {
      console.error('[AliyunSTT] Failed to get token:', error)
      throw error
    }
  }

  /**
   * 通过 OpenAPI 获取 Token
   * 参考: https://help.aliyun.com/zh/isi/getting-started/use-http-or-https-to-obtain-an-access-token
   */
  private async fetchToken(): Promise<string> {
    const endpoint = 'https://nls-meta.cn-shanghai.aliyuncs.com'
    const apiVersion = '2019-02-28'
    const action = 'CreateToken'

    // 构建规范化请求参数
    const timestamp = new Date().toISOString().replace(/\.\d{3}/, '')
    const nonce = crypto.randomUUID()

    const params: Record<string, string> = {
      AccessKeyId: this.accessKeyId,
      Action: action,
      Format: 'JSON',
      RegionId: 'cn-shanghai',
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: nonce,
      SignatureVersion: '1.0',
      Timestamp: timestamp,
      Version: apiVersion,
    }

    // 生成签名
    const sortedKeys = Object.keys(params).sort()
    const canonicalizedQueryString = sortedKeys
      .map(key => `${this.percentEncode(key)}=${this.percentEncode(params[key])}`)
      .join('&')

    const stringToSign = `GET&${this.percentEncode('/')}&${this.percentEncode(canonicalizedQueryString)}`
    const signature = crypto
      .createHmac('sha1', `${this.accessKeySecret}&`)
      .update(stringToSign)
      .digest('base64')

    params.Signature = signature

    // 发送请求
    const queryString = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')

    const url = `${endpoint}/?${queryString}`

    const response = await fetch(url)
    const result = await response.json() as {
      Token?: { Id: string; ExpireTime: number }
      Message?: string
      Code?: string
    }

    if (result.Token?.Id) {
      cachedToken = result.Token.Id
      tokenExpireTime = result.Token.ExpireTime * 1000 // 转为毫秒
      console.log(`[AliyunSTT] Token obtained, expires at: ${new Date(tokenExpireTime).toISOString()}`)
      return cachedToken
    }

    throw new Error(`Failed to get token: ${result.Message || result.Code || 'Unknown error'}`)
  }

  /**
   * RFC 3986 URL 编码
   */
  private percentEncode(str: string): string {
    return encodeURIComponent(str)
      .replace(/\+/g, '%20')
      .replace(/\*/g, '%2A')
      .replace(/%7E/g, '~')
  }

  /**
   * 一句话识别 - 将音频转换为文字
   * @param audioBase64 - WAV 格式的 base64 音频（16kHz, 16-bit, mono）
   * @returns 识别结果
   */
  async transcribe(audioBase64: string): Promise<AliyunSttResult> {
    if (!this.isConfigured()) {
      return { text: '', success: false, error: 'Aliyun STT not configured' }
    }

    try {
      // 获取 Token
      const token = await this.getToken()

      // 清理 base64 数据
      let audioData = audioBase64
      if (audioData.includes(',')) {
        audioData = audioData.split(',')[1]
      }
      audioData = audioData.replace(/^data:audio\/\w+;base64,/, '')

      // 将 base64 转为二进制
      const audioBuffer = Buffer.from(audioData, 'base64')
      console.log(`[AliyunSTT] Audio buffer size: ${audioBuffer.length} bytes`)

      // 构建请求 URL
      const url = new URL('https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/asr')
      url.searchParams.set('appkey', this.appKey)
      url.searchParams.set('format', 'wav')
      url.searchParams.set('sample_rate', '16000')
      url.searchParams.set('enable_punctuation_prediction', 'true')
      url.searchParams.set('enable_inverse_text_normalization', 'true')

      console.log(`[AliyunSTT] Request URL: ${url.toString()}`)

      // 发送请求
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'X-NLS-Token': token,
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(audioBuffer.length),
        },
        body: audioBuffer,
      })

      const result = await response.json() as {
        task_id?: string
        result?: string
        status: number
        message: string
      }

      console.log(`[AliyunSTT] Response:`, JSON.stringify(result))

      if (result.status === 20000000) {
        const text = result.result || ''
        console.log(`[AliyunSTT] Transcribed: "${text}"`)
        return {
          text,
          success: true,
          taskId: result.task_id,
        }
      }

      return {
        text: '',
        success: false,
        error: `${result.status}: ${result.message}`,
        taskId: result.task_id,
      }

    } catch (error) {
      console.error('[AliyunSTT] Error:', error)
      return {
        text: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}

export const aliyunSttService = new AliyunSttService()

