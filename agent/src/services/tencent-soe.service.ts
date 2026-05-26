/**
 * 腾讯云智聆口语评测 (SOE) 服务 - 新版 WebSocket API
 *
 * 新版使用 WebSocket 协议：wss://soe.cloud.tencent.com/soe/api/{AppID}
 * 鉴权方式：HMAC-SHA1 签名
 *
 * 文档: https://cloud.tencent.com/document/product/1774/107497
 */
import { createHmac, randomUUID } from 'crypto'
import WebSocket from 'ws'
import { env } from '../config.js'

// 统一的评测结果（给前端用）
export interface SOEEvaluateResult {
  success: boolean
  error?: string
  data?: {
    accuracy: number       // 准确度 [0-100]
    fluency: number        // 流利度 [0-1]
    completeness: number   // 完整度 [0-1]
    suggestedScore: number // 建议评分 [0-100]
    words: Array<{
      word: string
      accuracy: number
      fluency: number
      realWord: string
      matchTag: 'correct' | 'extra' | 'missing' | 'mispronounced'
      phoneInfos?: Array<{
        phone: string
        accuracy: number
        detectedStress: boolean
        referencePhone: string
      }>
    }>
  }
}

class TencentSoeService {
  private secretId: string
  private secretKey: string
  private appId: string
  private configured: boolean

  constructor() {
    this.secretId = env.tencentSoe?.secretId || ''
    this.secretKey = env.tencentSoe?.secretKey || ''
    this.appId = env.tencentSoe?.appId || ''

    this.configured = !!(this.secretId && this.secretKey && this.appId)

    if (!this.configured) {
      const missing = []
      if (!this.secretId) missing.push('TENCENT_SECRET_ID')
      if (!this.secretKey) missing.push('TENCENT_SECRET_KEY')
      if (!this.appId) missing.push('TENCENT_APP_ID')
      console.warn(`[TencentSOE] Missing config: ${missing.join(', ')}, SOE service disabled`)
    } else {
      console.log('[TencentSOE] Service initialized (WebSocket mode)')
    }
  }

  isConfigured(): boolean {
    return this.configured
  }

  /**
   * 生成 HMAC-SHA1 签名
   */
  private generateSignature(params: Record<string, string | number>): string {
    const sortedKeys = Object.keys(params).sort()
    const sortedParams = sortedKeys.map(k => `${k}=${params[k]}`).join('&')
    const signStr = `soe.cloud.tencent.com/soe/api/${this.appId}?${sortedParams}`
    const hmac = createHmac('sha1', this.secretKey)
    hmac.update(signStr)
    return hmac.digest('base64')
  }

  /**
   * 构建 WebSocket URL
   */
  private buildWsUrl(refText: string, evalMode: number): string {
    const timestamp = Math.floor(Date.now() / 1000)
    const expired = timestamp + 86400
    const nonce = Math.floor(Math.random() * 1000000000)
    const voiceId = randomUUID()

    const params: Record<string, string | number> = {
      eval_mode: evalMode,
      expired,
      nonce,
      rec_mode: 0,                    // 流式评测
      ref_text: refText,
      score_coeff: 3.5,
      secretid: this.secretId,
      sentence_info_enabled: 1,
      server_engine_type: '16k_en',   // 英文16k引擎
      text_mode: 0,
      timestamp,
      voice_format: 1,                // wav
      voice_id: voiceId,
    }

    const signature = this.generateSignature(params)

    const urlParams = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')

    return `wss://soe.cloud.tencent.com/soe/api/${this.appId}?${urlParams}&signature=${encodeURIComponent(signature)}`
  }

  /**
   * 评测发音
   * @param refText 参考文本（原句）
   * @param audioBase64 音频数据 base64 编码
   * @param evalMode 评测模式: 0=单词, 1=句子
   */
  async evaluate(
    refText: string,
    audioBase64: string,
    evalMode: number = 1
  ): Promise<SOEEvaluateResult> {
    if (!this.configured) {
      return { success: false, error: 'SOE service not configured' }
    }

    // 清理 base64 → 原始二进制
    let cleanBase64 = audioBase64
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1]
    }
    cleanBase64 = cleanBase64.replace(/^data:audio\/\w+;base64,/, '')

    const audioBuffer = Buffer.from(cleanBase64, 'base64')
    console.log(`[TencentSOE] Evaluating: "${refText}", audio: ${audioBuffer.length} bytes`)

    const url = this.buildWsUrl(refText, evalMode)

    return new Promise<SOEEvaluateResult>((resolve) => {
      const ws = new WebSocket(url)
      let resolved = false

      const done = (result: SOEEvaluateResult) => {
        if (resolved) return
        resolved = true
        try { ws.close() } catch {}
        resolve(result)
      }

      const timeout = setTimeout(() => {
        console.error('[TencentSOE] WebSocket timeout (20s)')
        done({ success: false, error: 'SOE WebSocket timeout' })
      }, 20000)

      ws.on('open', () => {
        console.log('[TencentSOE] WebSocket connected, sending audio chunks...')
        // 分片发送音频（每片 6400 bytes ≈ 200ms @ 16k/16bit/mono）
        const chunkSize = 6400
        let offset = 0

        const sendChunk = () => {
          if (resolved) return
          if (offset < audioBuffer.length) {
            const end = Math.min(offset + chunkSize, audioBuffer.length)
            ws.send(audioBuffer.slice(offset, end))
            offset = end
            setTimeout(sendChunk, 40) // 快速发送，无需 1:1 模拟
          } else {
            // 发送结束标记
            ws.send(JSON.stringify({ type: 'end' }))
            console.log('[TencentSOE] Audio sent, waiting for result...')
          }
        }
        sendChunk()
      })

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const json = JSON.parse(data.toString())

          // 错误
          if (json.code !== undefined && json.code !== 0) {
            console.error(`[TencentSOE] Server error: code=${json.code}, message=${json.message}`)
            clearTimeout(timeout)
            done({ success: false, error: `SOE error ${json.code}: ${json.message}` })
            return
          }

          // 握手成功（final=0, result=null）
          if (json.final === 0 && json.result === null) {
            console.log('[TencentSOE] Handshake OK, voice_id:', json.voice_id)
            return
          }

          // 中间结果
          if (json.final === 0 && json.result) {
            return
          }

          // 最终结果（final=1）
          if (json.final === 1 && json.result) {
            clearTimeout(timeout)
            const r = json.result

            console.log(`[TencentSOE] Result: accuracy=${r.PronAccuracy}, fluency=${r.PronFluency}, completion=${r.PronCompletion}, score=${r.SuggestedScore}`)

            const matchTagMap: Record<number, 'correct' | 'extra' | 'missing' | 'mispronounced'> = {
              0: 'correct',
              1: 'extra',
              2: 'missing',
              3: 'mispronounced',
            }

            const words = (r.Words || []).map((w: any) => ({
              word: w.Word || '',
              accuracy: w.PronAccuracy ?? 0,
              fluency: w.PronFluency ?? 0,
              realWord: w.ReferenceWord || w.Word || '',
              matchTag: matchTagMap[w.MatchTag ?? 0] || 'correct',
              phoneInfos: w.PhoneInfos?.map((p: any) => ({
                phone: p.Phone || '',
                accuracy: p.PronAccuracy ?? 0,
                detectedStress: p.DetectedStress ?? false,
                referencePhone: p.ReferencePhone || '',
              })),
            }))

            done({
              success: true,
              data: {
                accuracy: r.PronAccuracy ?? 0,
                fluency: r.PronFluency ?? 0,
                completeness: r.PronCompletion ?? 0,
                suggestedScore: r.SuggestedScore ?? 0,
                words,
              },
            })
          }
        } catch (e) {
          // 非 JSON 消息，忽略
        }
      })

      ws.on('error', (err: Error) => {
        console.error('[TencentSOE] WebSocket error:', err.message)
        clearTimeout(timeout)
        done({ success: false, error: `SOE WebSocket error: ${err.message}` })
      })

      ws.on('close', (code: number) => {
        clearTimeout(timeout)
        if (!resolved) {
          console.error(`[TencentSOE] WebSocket closed unexpectedly: code=${code}`)
          done({ success: false, error: `SOE WebSocket closed: code=${code}` })
        }
      })
    })
  }
}

export const tencentSoeService = new TencentSoeService()
