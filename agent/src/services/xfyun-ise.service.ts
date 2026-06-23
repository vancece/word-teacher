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
import { env, type IseAccount } from '../config.js'
import { iseLogger as log } from '../utils/logger.js'
import { concatPcmAudio, splitIntoBatches, getPcmDurationSec } from './audio-concat.service.js'

const POOL_REFRESH_INTERVAL_MS = 5 * 60 * 1000  // 5 分钟刷新一次账号池

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

// 讯飞额度用完相关的错误码
const QUOTA_EXHAUSTED_CODES = new Set([
  10313,  // 服务量不在限额范围内
  11200,  // 授权已过期/无权限
  11201,  // 日流控超限
  10163,  // 接口请求次数超出日限额
  10200,  // 没有开通此服务
])

interface AccountState {
  account: IseAccount
  exhausted: boolean
  exhaustedAt: number  // timestamp
  failCount: number    // 连续失败次数
}

class XfyunIseService {
  private accounts: AccountState[] = []
  private currentIndex: number = 0
  private configured: boolean

  private readonly HOST = 'ise-api.xfyun.cn'
  private readonly PATH = '/v2/open-ise'
  private readonly EXHAUSTED_COOLDOWN_MS = 60 * 60 * 1000  // 1小时后重试（讯飞日额度一般次日重置）

  private lastPoolRefresh: number = 0

  constructor() {
    // 优先使用账号池（环境变量）
    const poolAccounts = env.xfyunIseAccounts || []
    if (poolAccounts.length > 0) {
      this.accounts = poolAccounts.map(acc => ({
        account: acc,
        exhausted: false,
        exhaustedAt: 0,
        failCount: 0,
      }))
      log.info({ count: this.accounts.length, labels: this.accounts.map(a => a.account.label) }, 'Account pool initialized from env')
    } else if (env.xfyunIse?.appId && env.xfyunIse?.apiKey && env.xfyunIse?.apiSecret) {
      // fallback: 使用单账号配置
      this.accounts = [{
        account: {
          appId: env.xfyunIse.appId,
          apiKey: env.xfyunIse.apiKey,
          apiSecret: env.xfyunIse.apiSecret,
          label: '主账号',
        },
        exhausted: false,
        exhaustedAt: 0,
        failCount: 0,
      }]
      log.info('Single account mode (no pool configured)')
    }

    this.configured = this.accounts.length > 0

    if (!this.configured) {
      log.warn('No ISE accounts configured, will try loading from backend API')
    }

    // 延迟从后端 API 加载账号池（构造函数不能 async）
    setTimeout(() => this.refreshPoolFromBackend(), 3000)
  }

  /**
   * 从后端 API 加载账号池（数据库管理的账号）
   * 会覆盖环境变量配置的账号池
   */
  async refreshPoolFromBackend(): Promise<void> {
    const backendUrl = env.backend?.apiUrl
    const agentApiKey = env.auth?.apiKey
    if (!backendUrl || !agentApiKey) {
      log.debug('Backend URL or Agent API Key not configured, skipping pool refresh')
      return
    }

    try {
      const response = await fetch(`${backendUrl}/admin/ise-accounts/pool`, {
        headers: { 'x-agent-api-key': agentApiKey },
      })

      if (!response.ok) {
        log.debug({ status: response.status }, 'Failed to fetch ISE pool from backend (may not be deployed yet)')
        return
      }

      const json = await response.json() as any
      const dbAccounts: any[] = json?.data || []

      if (dbAccounts.length === 0) {
        log.debug('No ISE accounts in database, keeping current config')
        return
      }

      // 用数据库的账号覆盖当前配置
      this.accounts = dbAccounts.map((acc: any) => ({
        account: {
          appId: acc.appId,
          apiKey: acc.apiKey,
          apiSecret: acc.apiSecret,
          label: acc.label || '未命名',
        },
        exhausted: false,
        exhaustedAt: 0,
        failCount: 0,
      }))
      this.currentIndex = 0
      this.configured = true
      this.lastPoolRefresh = Date.now()

      log.info({ count: this.accounts.length, labels: this.accounts.map(a => a.account.label) }, 'Account pool refreshed from database')
    } catch (err: any) {
      log.debug({ error: err?.message }, 'Failed to refresh pool from backend (network error)')
    }
  }

  /**
   * 确保账号池是最新的（定期刷新）
   */
  private async ensurePoolFresh(): Promise<void> {
    if (Date.now() - this.lastPoolRefresh > POOL_REFRESH_INTERVAL_MS) {
      await this.refreshPoolFromBackend()
    }
  }

  isConfigured(): boolean {
    return this.configured
  }

  /**
   * 获取当前可用账号（跳过已耗尽的，支持自动恢复）
   */
  private getAvailableAccount(): AccountState | null {
    const now = Date.now()

    // 先检查是否有已过冷却期的，自动恢复
    for (const state of this.accounts) {
      if (state.exhausted && (now - state.exhaustedAt > this.EXHAUSTED_COOLDOWN_MS)) {
        log.info({ label: state.account.label }, 'Account cooldown expired, restoring')
        state.exhausted = false
        state.failCount = 0
      }
    }

    // 从 currentIndex 开始，找第一个可用的
    for (let i = 0; i < this.accounts.length; i++) {
      const idx = (this.currentIndex + i) % this.accounts.length
      if (!this.accounts[idx].exhausted) {
        this.currentIndex = idx
        return this.accounts[idx]
      }
    }

    // 所有账号都耗尽了
    return null
  }

  /**
   * 标记当前账号为已耗尽，切到下一个
   */
  private markExhausted(state: AccountState): void {
    state.exhausted = true
    state.exhaustedAt = Date.now()
    log.warn({ label: state.account.label }, 'Account marked as exhausted, switching to next')
    // 自动切到下一个
    this.currentIndex = (this.currentIndex + 1) % this.accounts.length
  }

  /**
   * 检查错误码是否为额度耗尽
   */
  private isQuotaError(code: number): boolean {
    return QUOTA_EXHAUSTED_CODES.has(code)
  }

  /**
   * 获取账号池状态（用于健康检查/调试）
   */
  getPoolStatus(): { total: number; available: number; accounts: Array<{ label: string; exhausted: boolean }> } {
    return {
      total: this.accounts.length,
      available: this.accounts.filter(a => !a.exhausted).length,
      accounts: this.accounts.map(a => ({
        label: a.account.label,
        exhausted: a.exhausted,
      })),
    }
  }

  /**
   * 上报用量到后端数据库（fire-and-forget，不阻塞评测）
   */
  private reportUsage(appId: string): void {
    const backendUrl = env.backend?.apiUrl
    const agentApiKey = env.auth?.apiKey
    if (!backendUrl || !agentApiKey) return

    fetch(`${backendUrl}/internal/ise-usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-api-key': agentApiKey,
      },
      body: JSON.stringify({ appId }),
    }).catch(() => {
      // 静默失败，不影响评测
    })
  }

  /**
   * 生成鉴权 WebSocket URL
   */
  private getAuthUrl(account: IseAccount): string {
    const date = new Date().toUTCString()

    const signatureOrigin = `host: ${this.HOST}\ndate: ${date}\nGET ${this.PATH} HTTP/1.1`

    const signature = createHmac('sha256', account.apiSecret)
      .update(signatureOrigin)
      .digest('base64')

    const authorizationOrigin =
      `api_key="${account.apiKey}", algorithm="hmac-sha256", ` +
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
   * 评测发音（带账号轮转：额度用完自动切下一个账号重试）
   * @param refText 参考文本（原句）
   * @param audioBase64 音频数据 base64 编码（WAV 格式）
   * @param evalMode 评测模式: 'word' | 'sentence' | 'chapter'
   */
  async evaluate(
    refText: string,
    audioBase64: string,
    evalMode: 'word' | 'sentence' | 'chapter' = 'sentence'
  ): Promise<ISEEvaluateResult> {
    await this.ensurePoolFresh()

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

    // 尝试使用可用账号，额度耗尽时自动切换
    const maxRetries = this.accounts.length
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const accountState = this.getAvailableAccount()
      if (!accountState) {
        return { success: false, error: '所有讯飞账号额度已用完，请稍后再试' }
      }

      const { account } = accountState
      log.info({ label: account.label, attempt: attempt + 1 }, 'Using account')

      const result = await this.evaluateWithAccount(account, refText, pcmBuffer, category)

      if (result.success) {
        accountState.failCount = 0
        this.reportUsage(account.appId)
        return result
      }

      // 检查是否为额度耗尽错误
      const errorCode = this.extractErrorCode(result.error || '')
      if (errorCode !== null && this.isQuotaError(errorCode)) {
        this.markExhausted(accountState)
        log.warn({ label: account.label, errorCode, attempt: attempt + 1 }, 'Quota exhausted, trying next account')
        continue  // 重试下一个账号
      }

      // 非额度错误，直接返回
      return result
    }

    return { success: false, error: '所有讯飞账号额度已用完，请稍后再试' }
  }

  /**
   * 从错误消息中提取讯飞错误码
   */
  private extractErrorCode(errorMsg: string): number | null {
    const match = errorMsg.match(/ISE error (\d+):/)
    return match ? parseInt(match[1]) : null
  }

  /**
   * 使用指定账号执行评测
   */
  private evaluateWithAccount(
    account: IseAccount,
    refText: string,
    pcmBuffer: Buffer,
    category: string
  ): Promise<ISEEvaluateResult> {
    const url = this.getAuthUrl(account)
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
        log.error({ label: account.label }, 'WebSocket timeout (30s)')
        done({ success: false, error: 'ISE WebSocket timeout' })
      }, 30000)

      ws.on('open', () => {
        log.info({ label: account.label }, 'WebSocket connected, sending SSB...')

        const ssbFrame = JSON.stringify({
          common: {
            app_id: account.appId,
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
              log.info({ label: account.label }, 'Audio sent, waiting for result...')
            }
          }
        }

        setTimeout(sendAudioFrame, 100)
      })

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const json = JSON.parse(data.toString())

          if (json.code !== undefined && json.code !== 0) {
            log.error({ code: json.code, message: json.message, label: account.label }, 'Server error')
            clearTimeout(timeout)
            done({ success: false, error: `ISE error ${json.code}: ${json.message}` })
            return
          }

          if (json.data?.data) {
            resultData += json.data.data
          }

          if (json.data?.status === 2) {
            clearTimeout(timeout)

            if (!resultData) {
              done({ success: false, error: 'ISE returned empty result' })
              return
            }

            const xmlString = Buffer.from(resultData, 'base64').toString('utf-8')
            log.info({ xml: xmlString, label: account.label }, 'Raw XML result')

            const parsed = this.parseXmlResult(xmlString)
            if (!parsed) {
              log.error({ label: account.label }, 'Failed to parse XML result')
              done({ success: false, error: 'Failed to parse ISE XML result' })
              return
            }

            log.info({ accuracy: parsed.accuracy, fluency: parsed.fluency, completeness: parsed.completeness, totalScore: parsed.suggestedScore, label: account.label }, 'Evaluation complete')
            done({ success: true, data: parsed })
          }
        } catch (e) {
          // 非 JSON 消息，忽略
        }
      })

      ws.on('error', (err: Error) => {
        log.error({ err: err.message, label: account.label }, 'WebSocket error')
        clearTimeout(timeout)
        done({ success: false, error: `ISE WebSocket error: ${err.message}` })
      })

      ws.on('close', (code: number) => {
        clearTimeout(timeout)
        if (!resolved) {
          log.error({ code, label: account.label }, 'WebSocket closed unexpectedly')
          done({ success: false, error: `ISE WebSocket closed: code=${code}` })
        }
      })
    })
  }
  /**
   * 解析 read_chapter XML 结果，按 sentence 拆分返回每句独立评分
   */
  private parseChapterXmlBySentence(xmlString: string): Array<ISEEvaluateResult['data']> {
    const results: Array<ISEEvaluateResult['data']> = []

    try {
      // 匹配所有 <sentence ...>...</sentence> 节点
      const sentenceRegex = /<sentence\s([^>]*)>([\s\S]*?)<\/sentence>/g
      let match: RegExpExecArray | null

      while ((match = sentenceRegex.exec(xmlString)) !== null) {
        const attrs = match[1]
        const innerContent = match[2]

        const getAttr = (attr: string): number => {
          const m = attrs.match(new RegExp(`${attr}="([^"]*)"`, 'i'))
          return m ? parseFloat(m[1]) : 0
        }

        const accuracyScore = getAttr('accuracy_score')
        const fluencyScore = getAttr('fluency_score')
        const integrityScore = getAttr('integrity_score')
        const totalScore = getAttr('total_score')

        // 解析该 sentence 内的 word 节点
        const words = this.parseWordsFromXml(innerContent)

        results.push({
          accuracy: accuracyScore,
          fluency: fluencyScore,
          completeness: integrityScore,
          suggestedScore: totalScore,
          words,
        })
      }

      // 如果没匹配到 sentence 节点，尝试整体解析（降级）
      if (results.length === 0) {
        log.warn('No <sentence> nodes found in chapter XML, falling back to whole parse')
        const whole = this.parseXmlResult(xmlString)
        if (whole) results.push(whole)
      }
    } catch (err) {
      log.error({ err }, 'Chapter XML parse by sentence error')
    }

    return results
  }

  /**
   * 篇章评测 — 将多句文本和音频合并为一次 read_chapter 调用
   * @param sentences 每句的参考文本
   * @param pcmBuffers 每句的 PCM 音频 buffer
   * @returns 每句的独立评测结果
   */
  async evaluateChapter(
    sentences: string[],
    pcmBuffers: Buffer[]
  ): Promise<ISEEvaluateResult[]> {
    await this.ensurePoolFresh()

    if (!this.configured) {
      return sentences.map(() => ({ success: false, error: 'ISE service not configured' }))
    }

    if (sentences.length !== pcmBuffers.length) {
      return sentences.map(() => ({ success: false, error: 'sentences and pcmBuffers length mismatch' }))
    }

    // 按时长分批（每批 ≤ 45 秒）
    const batches = splitIntoBatches(pcmBuffers, 45, 800)
    log.info({ totalSentences: sentences.length, batches: batches.length, batchRanges: batches }, 'Chapter evaluate batches')

    const allResults: ISEEvaluateResult[] = new Array(sentences.length)

    for (const [batchStart, batchEnd] of batches) {
      const batchSentences = sentences.slice(batchStart, batchEnd + 1)
      const batchPcm = pcmBuffers.slice(batchStart, batchEnd + 1)

      // 拼接音频
      const concatPcm = concatPcmAudio(batchPcm, 800)
      const totalDuration = getPcmDurationSec(concatPcm)
      log.info({ batchStart, batchEnd, sentences: batchSentences.length, durationSec: totalDuration.toFixed(1) }, 'Evaluating batch')

      // 拼接文本 — 确保每句以分句符号结尾
      const normalizedTexts = batchSentences.map(s => {
        const trimmed = s.trim()
        if (/[.!?;]$/.test(trimmed)) return trimmed
        return trimmed + '.'
      })
      const chapterText = normalizedTexts.join(' ')

      // 调用讯飞评测（read_chapter 模式）
      const result = await this.evaluateRaw(chapterText, concatPcm, 'read_chapter')

      if (result.success && result.rawXml) {
        // 按 sentence 拆分
        const sentenceResults = this.parseChapterXmlBySentence(result.rawXml)

        for (let i = 0; i < batchSentences.length; i++) {
          if (i < sentenceResults.length && sentenceResults[i]) {
            allResults[batchStart + i] = { success: true, data: sentenceResults[i]! }
          } else {
            // sentence 数不匹配，标记失败
            log.warn({ expected: batchSentences.length, got: sentenceResults.length, index: i }, 'Sentence count mismatch in chapter result')
            allResults[batchStart + i] = { success: false, error: 'Sentence not found in chapter result' }
          }
        }
      } else {
        // 整批失败
        for (let i = batchStart; i <= batchEnd; i++) {
          allResults[i] = { success: false, error: result.error || 'Chapter evaluate failed' }
        }
      }
    }

    return allResults
  }

  /**
   * 底层评测调用（带账号轮转，返回原始 XML 用于 chapter 解析）
   */
  private async evaluateRaw(
    refText: string,
    pcmBuffer: Buffer,
    category: string
  ): Promise<{ success: boolean; error?: string; rawXml?: string }> {
    const maxRetries = this.accounts.length
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const accountState = this.getAvailableAccount()
      if (!accountState) {
        return { success: false, error: '所有讯飞账号额度已用完，请稍后再试' }
      }

      const { account } = accountState
      log.info({ refText: refText.slice(0, 80), pcmSize: pcmBuffer.length, category, label: account.label }, 'evaluateRaw')

      const result = await this.evaluateRawWithAccount(account, refText, pcmBuffer, category)

      if (result.success) {
        accountState.failCount = 0
        this.reportUsage(account.appId)
        return result
      }

      // 检查是否额度耗尽
      const errorCode = this.extractErrorCode(result.error || '')
      if (errorCode !== null && this.isQuotaError(errorCode)) {
        this.markExhausted(accountState)
        log.warn({ label: account.label, errorCode, attempt: attempt + 1 }, 'evaluateRaw: quota exhausted, trying next')
        continue
      }

      return result
    }

    return { success: false, error: '所有讯飞账号额度已用完，请稍后再试' }
  }

  /**
   * 使用指定账号执行底层评测
   */
  private evaluateRawWithAccount(
    account: IseAccount,
    refText: string,
    pcmBuffer: Buffer,
    category: string
  ): Promise<{ success: boolean; error?: string; rawXml?: string }> {
    const url = this.getAuthUrl(account)
    const formattedText = this.formatText(refText, category)

    return new Promise((resolve) => {
      const ws = new WebSocket(url)
      let resolved = false
      let resultData = ''

      const done = (result: { success: boolean; error?: string; rawXml?: string }) => {
        if (resolved) return
        resolved = true
        try { ws.close() } catch {}
        resolve(result)
      }

      const timeout = setTimeout(() => {
        log.error({ label: account.label }, 'WebSocket timeout (45s) in evaluateRaw')
        done({ success: false, error: 'ISE WebSocket timeout' })
      }, 45000)

      ws.on('open', () => {
        const ssbFrame = JSON.stringify({
          common: { app_id: account.appId },
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
          data: { status: 0 },
        })
        ws.send(ssbFrame)

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

            ws.send(JSON.stringify({
              business: { cmd: 'auw', aus },
              data: { status, data: chunk.toString('base64') },
            }))

            isFirst = false
            offset = end
            if (!isLast) setTimeout(sendAudioFrame, 40)
          }
        }

        setTimeout(sendAudioFrame, 100)
      })

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const json = JSON.parse(data.toString())
          if (json.code !== undefined && json.code !== 0) {
            log.error({ code: json.code, message: json.message, label: account.label }, 'evaluateRaw server error')
            clearTimeout(timeout)
            done({ success: false, error: `ISE error ${json.code}: ${json.message}` })
            return
          }
          if (json.data?.data) resultData += json.data.data
          if (json.data?.status === 2) {
            clearTimeout(timeout)
            if (!resultData) {
              done({ success: false, error: 'ISE returned empty result' })
              return
            }
            const xmlString = Buffer.from(resultData, 'base64').toString('utf-8')
            log.info({ xmlLength: xmlString.length, label: account.label }, 'evaluateRaw got XML result')
            done({ success: true, rawXml: xmlString })
          }
        } catch {}
      })

      ws.on('error', (err: Error) => {
        clearTimeout(timeout)
        done({ success: false, error: `WebSocket error: ${err.message}` })
      })

      ws.on('close', (code: number) => {
        clearTimeout(timeout)
        if (!resolved) done({ success: false, error: `WebSocket closed: code=${code}` })
      })
    })
  }
}

export const xfyunIseService = new XfyunIseService()
