/**
 * 科大讯飞语音评测 (ISE) 服务 - 流式版 WebSocket API
 *
 * 协议: WebSocket (wss://ise-api.xfyun.cn/v2/open-ise)
 * 鉴权: HMAC-SHA256 签名
 *
 * 文档: https://www.xfyun.cn/doc/Ise/IseAPI.html
 */
import { createHmac } from 'crypto'
import WebSocket from 'ws'
import { env } from '../config.js'
import { iseLogger as log } from '../utils/logger.js'

// 复用现有的统一评测结果接口（保持前端兼容）
export interface ISEEvaluateResult {
  success: boolean
  error?: string
  data?: {
    accuracy: number       // 准确度 [0-100]
    fluency: number        // 流利度 [0-100]
    completeness: number   // 完整度 [0-100]
    suggestedScore: number // 总分 [0-100]
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

// 讯飞 XML 解析后的中间结构
interface ParsedWord {
  content: string
  totalScore: number
  dpMessage: number
  syllables: Array<{
    content: string
    serrMsg: number
    syllAccent: number
  }>
  phones: Array<{
    content: string
    dpMessage: number
  }>
}

class XfyunIseService {
  private appId: string
  private apiKey: string
  private apiSecret: string
  private configured: boolean

  private readonly HOST = 'ise-api.xfyun.cn'
  private readonly PATH = '/v2/open-ise'

  constructor() {
    this.appId = env.xfyunIse?.appId || ''
    this.apiKey = env.xfyunIse?.apiKey || ''
    this.apiSecret = env.xfyunIse?.apiSecret || ''

    this.configured = !!(this.appId && this.apiKey && this.apiSecret)

    if (!this.configured) {
      const missing = []
      if (!this.appId) missing.push('XFYUN_APP_ID')
      if (!this.apiKey) missing.push('XFYUN_API_KEY')
      if (!this.apiSecret) missing.push('XFYUN_API_SECRET')
      log.warn(`Missing config: ${missing.join(', ')}, ISE service disabled`)
    } else {
      log.info('Service initialized (WebSocket mode)')
    }
  }

  isConfigured(): boolean {
    return this.configured
  }

  /**
   * 生成鉴权 WebSocket URL
   */
  private getAuthUrl(): string {
    const date = new Date().toUTCString()

    // signature_origin = "host: {host}\ndate: {date}\nGET {path} HTTP/1.1"
    const signatureOrigin = `host: ${this.HOST}\ndate: ${date}\nGET ${this.PATH} HTTP/1.1`

    // HMAC-SHA256 签名
    const signature = createHmac('sha256', this.apiSecret)
      .update(signatureOrigin)
      .digest('base64')

    // authorization_origin
    const authorizationOrigin =
      `api_key="${this.apiKey}", algorithm="hmac-sha256", ` +
      `headers="host date request-line", signature="${signature}"`
    const authorization = Buffer.from(authorizationOrigin).toString('base64')

    return `wss://${this.HOST}${this.PATH}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(this.HOST)}`
  }

  /**
   * 格式化试题文本（英文句子需要 [content] 节点）
   */
  private formatText(text: string, category: string): string {
    const bom = '\uFEFF' // UTF-8 BOM（讯飞要求）
    switch (category) {
      case 'read_word':
        return `${bom}[word]\n${text}`
      case 'read_sentence':
      case 'read_chapter':
        return `${bom}[content]\n${text}`
      default:
        return `${bom}[content]\n${text}`
    }
  }

  /**
   * 从 WAV base64 中提取 PCM 数据
   */
  private extractPCMFromWav(wavBase64: string): Buffer {
    let cleanBase64 = wavBase64
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1]
    }
    cleanBase64 = cleanBase64.replace(/^data:audio\/\w+;base64,/, '')

    const wavBuffer = Buffer.from(cleanBase64, 'base64')
    // WAV 文件头 44 字节，后面是 PCM 数据
    // 验证是否真的是 WAV（RIFF 头）
    if (wavBuffer.length > 44 &&
        wavBuffer[0] === 0x52 && wavBuffer[1] === 0x49 &&
        wavBuffer[2] === 0x46 && wavBuffer[3] === 0x46) {
      return wavBuffer.slice(44)
    }
    // 如果不是 WAV，当作裸 PCM 处理
    return wavBuffer
  }

  /**
   * 解析讯飞返回的 XML 评测结果
   * 讯飞返回的 XML 结构比较复杂，这里用正则+字符串解析
   */
  private parseXmlResult(xmlString: string): ISEEvaluateResult['data'] | null {
    try {
      // 提取 read_sentence 或 read_chapter 节点的属性
      const sentenceMatch = xmlString.match(/<read_sentence[^>]*>/) ||
                           xmlString.match(/<read_chapter[^>]*>/) ||
                           xmlString.match(/<read_word[^>]*>/)
      if (!sentenceMatch) {
        log.warn('Cannot find read_sentence/read_chapter/read_word node in XML')
        return null
      }

      // 查找 rec_paper 下的 read_sentence（包含总分）
      const recPaperContent = xmlString.match(/<rec_paper>([\s\S]*?)<\/rec_paper>/)
      let scoreNode = ''
      if (recPaperContent) {
        const innerSentence = recPaperContent[1].match(/<read_sentence[^>]*/)
        if (innerSentence) scoreNode = innerSentence[0]
        // 也可能是 read_chapter
        if (!scoreNode) {
          const innerChapter = recPaperContent[1].match(/<read_chapter[^>]*/)
          if (innerChapter) scoreNode = innerChapter[0]
        }
      }
      if (!scoreNode) {
        // fallback: 用最外层的
        scoreNode = sentenceMatch[0]
      }

      const getAttr = (node: string, attr: string): number => {
        const match = node.match(new RegExp(`${attr}="([^"]*)"`, 'i'))
        return match ? parseFloat(match[1]) : 0
      }

      const accuracyScore = getAttr(scoreNode, 'accuracy_score')
      const fluencyScore = getAttr(scoreNode, 'fluency_score')
      const integrityScore = getAttr(scoreNode, 'integrity_score')
      const standardScore = getAttr(scoreNode, 'standard_score')
      const totalScore = getAttr(scoreNode, 'total_score')

      // 解析 word 节点
      const words = this.parseWordsFromXml(xmlString)

      return {
        accuracy: accuracyScore,
        fluency: fluencyScore,
        completeness: integrityScore,
        suggestedScore: totalScore,
        words,
      }
    } catch (err) {
      log.error({ err }, 'XML parse error')
      return null
    }
  }

  /**
   * 从 XML 中解析词级结果
   */
  private parseWordsFromXml(xml: string): NonNullable<ISEEvaluateResult['data']>['words'] {
    const words: NonNullable<ISEEvaluateResult['data']>['words'] = []

    // 匹配所有 <word ...>...</word> 或 <word .../> 节点
    const wordRegex = /<word\s([^>]*)(?:\/>|>([\s\S]*?)<\/word>)/g
    let match: RegExpExecArray | null

    while ((match = wordRegex.exec(xml)) !== null) {
      const attrs = match[1]
      const innerContent = match[2] || ''

      const getAttr = (attr: string): string => {
        const m = attrs.match(new RegExp(`${attr}="([^"]*)"`, 'i'))
        return m ? m[1] : ''
      }

      const content = getAttr('content')
      const totalScoreStr = getAttr('total_score')
      const dpMessageStr = getAttr('dp_message')

      const totalScore = totalScoreStr ? parseFloat(totalScoreStr) : 0
      const dpMessage = dpMessageStr ? parseInt(dpMessageStr) : 0

      // dp_message → matchTag 映射
      let matchTag: 'correct' | 'extra' | 'missing' | 'mispronounced' = 'correct'
      if (dpMessage === 16) matchTag = 'missing'
      else if (dpMessage === 32) matchTag = 'extra'
      else if (dpMessage === 64 || dpMessage === 128) matchTag = 'mispronounced'
      else if (dpMessage === 0 && totalScore < 30) matchTag = 'mispronounced'

      // 解析音素信息
      const phoneInfos: Array<{
        phone: string
        accuracy: number
        detectedStress: boolean
        referencePhone: string
      }> = []

      const phoneRegex = /<phone\s([^>]*)(?:\/>|>[^<]*<\/phone>)/g
      let phoneMatch: RegExpExecArray | null
      while ((phoneMatch = phoneRegex.exec(innerContent)) !== null) {
        const pAttrs = phoneMatch[1]
        const getPhoneAttr = (attr: string): string => {
          const m = pAttrs.match(new RegExp(`${attr}="([^"]*)"`, 'i'))
          return m ? m[1] : ''
        }
        const phoneDp = parseInt(getPhoneAttr('dp_message') || '0')
        if (phoneDp === 32) continue // 跳过增读音素

        phoneInfos.push({
          phone: getPhoneAttr('content'),
          accuracy: 0, // 讯飞英文没有单独的音素分数，用词分代替
          detectedStress: false,
          referencePhone: getPhoneAttr('content'),
        })
      }

      // 跳过 sil/fil 静音节点
      if (content === 'sil' || content === 'silv' || content === 'fil') continue

      words.push({
        word: content,
        accuracy: totalScore,
        fluency: 0, // 讯飞词级没有单独流利度，用 0 填充
        realWord: content,
        matchTag,
        phoneInfos: phoneInfos.length > 0 ? phoneInfos : undefined,
      })
    }

    return words
  }

  /**
   * 评测发音
   * @param refText 参考文本（原句）
   * @param audioBase64 音频数据 base64 编码（WAV 格式）
   * @param evalMode 评测模式: 'word' | 'sentence' | 'chapter'
   */
  async evaluate(
    refText: string,
    audioBase64: string,
    evalMode: 'word' | 'sentence' | 'chapter' = 'sentence'
  ): Promise<ISEEvaluateResult> {
    if (!this.configured) {
      return { success: false, error: 'ISE service not configured' }
    }

    const categoryMap = {
      word: 'read_word',
      sentence: 'read_sentence',
      chapter: 'read_chapter',
    }
    const category = categoryMap[evalMode]

    // 提取 PCM 数据
    const pcmBuffer = this.extractPCMFromWav(audioBase64)

    // 诊断：检查音频是否为静音
    let maxAmplitude = 0
    let nonZeroSamples = 0
    for (let i = 0; i < pcmBuffer.length - 1; i += 2) {
      const sample = Math.abs(pcmBuffer.readInt16LE(i))
      if (sample > maxAmplitude) maxAmplitude = sample
      if (sample > 0) nonZeroSamples++
    }
    const totalSamples = Math.floor(pcmBuffer.length / 2)
    log.info({ refText, pcmSize: pcmBuffer.length, category, maxAmplitude, nonZeroSamples, totalSamples, silentRatio: `${((1 - nonZeroSamples / totalSamples) * 100).toFixed(1)}%` }, 'Evaluating')

    const url = this.getAuthUrl()
    const formattedText = this.formatText(refText, category)

    return new Promise<ISEEvaluateResult>((resolve) => {
      const ws = new WebSocket(url)
      let resolved = false
      let resultData = ''

      const done = (result: ISEEvaluateResult) => {
        if (resolved) return
        resolved = true
        try { ws.close() } catch {}
        resolve(result)
      }

      const timeout = setTimeout(() => {
        log.error('WebSocket timeout (30s)')
        done({ success: false, error: 'ISE WebSocket timeout' })
      }, 30000)

      ws.on('open', () => {
        log.info('WebSocket connected, sending SSB...')

        // 阶段1: SSB 参数上传
        const ssbFrame = JSON.stringify({
          common: {
            app_id: this.appId,
          },
          business: {
            sub: 'ise',
            ent: 'en_vip',
            category,
            aue: 'raw',
            auf: 'audio/L16;rate=16000',
            cmd: 'ssb',
            text: formattedText,
            tte: 'utf-8',
            ttp_skip: true,
            rstcd: 'utf8',
            rst: 'entirety',
            ise_unite: '1',
            extra_ability: 'multi_dimension;syll_phone_err_msg',
          },
          data: {
            status: 0,
          },
        })
        ws.send(ssbFrame)

        // 阶段2: AUW 音频上传
        // 建议每帧 1280B（40ms @ 16k/16bit/mono），不超过 19200B
        const frameSize = 1280
        let offset = 0
        let isFirst = true

        const sendAudioFrame = () => {
          if (resolved) return

          if (offset < pcmBuffer.length) {
            const end = Math.min(offset + frameSize, pcmBuffer.length)
            const chunk = pcmBuffer.slice(offset, end)
            const isLast = end >= pcmBuffer.length

            const aus = isFirst ? 1 : (isLast ? 4 : 2)
            const status = isLast ? 2 : 1

            const frame = JSON.stringify({
              business: {
                cmd: 'auw',
                aus,
              },
              data: {
                status,
                data: chunk.toString('base64'),
              },
            })
            ws.send(frame)

            isFirst = false
            offset = end

            if (!isLast) {
              setTimeout(sendAudioFrame, 40)
            } else {
              log.info('Audio sent, waiting for result...')
            }
          }
        }

        // 短暂延迟后开始发送音频（让 SSB 先处理）
        setTimeout(sendAudioFrame, 100)
      })

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const json = JSON.parse(data.toString())

          // 错误处理
          if (json.code !== undefined && json.code !== 0) {
            log.error({ code: json.code, message: json.message }, 'Server error')
            clearTimeout(timeout)
            done({ success: false, error: `ISE error ${json.code}: ${json.message}` })
            return
          }

          // 拼接结果数据
          if (json.data?.data) {
            resultData += json.data.data
          }

          // status=2 表示最终结果
          if (json.data?.status === 2) {
            clearTimeout(timeout)

            if (!resultData) {
              done({ success: false, error: 'ISE returned empty result' })
              return
            }

            // base64 解码 → XML
            const xmlString = Buffer.from(resultData, 'base64').toString('utf-8')
            log.info({ xml: xmlString }, 'Raw XML result')

            const parsed = this.parseXmlResult(xmlString)
            if (!parsed) {
              log.error('Failed to parse XML result')
              done({ success: false, error: 'Failed to parse ISE XML result' })
              return
            }

            log.info({ accuracy: parsed.accuracy, fluency: parsed.fluency, completeness: parsed.completeness, totalScore: parsed.suggestedScore }, 'Evaluation complete')
            done({ success: true, data: parsed })
          }
        } catch (e) {
          // 非 JSON 消息，忽略
        }
      })

      ws.on('error', (err: Error) => {
        log.error({ err: err.message }, 'WebSocket error')
        clearTimeout(timeout)
        done({ success: false, error: `ISE WebSocket error: ${err.message}` })
      })

      ws.on('close', (code: number) => {
        clearTimeout(timeout)
        if (!resolved) {
          log.error({ code }, 'WebSocket closed unexpectedly')
          done({ success: false, error: `ISE WebSocket closed: code=${code}` })
        }
      })
    })
  }
}

export const xfyunIseService = new XfyunIseService()
