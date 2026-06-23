/**
 * 跟读评测 Agent - 科大讯飞 ISE 语音评测（音素级精度）
 */
import { xfyunIseService, type ISEEvaluateResult } from '../services/xfyun-ise.service.js'
import { readAloudLogger as log } from '../utils/logger.js'

export interface WordResult {
  text: string
  status: 'correct' | 'incorrect' | 'missing'
  spoken?: string
  accuracy?: number
  fluency?: number
  matchTag?: 'correct' | 'extra' | 'missing' | 'mispronounced'
  phoneInfos?: Array<{
    phone: string
    accuracy: number
    detectedStress: boolean
    referencePhone: string
  }>
}

export interface ReadAloudResult {
  words: WordResult[]
  accuracy: number
  feedback: string
  fluency?: number
  completeness?: number
  suggestedScore?: number
  evaluationMethod: 'ise'
}

export class ReadAloudAgent {
  /**
   * 批量评测 — 篇章拼接模式（多句合并为一次 ISE 调用）
   * @param sentences 每句的 { text, audioBase64 }
   * @returns 每句的独立评测结果
   */
  async evaluateBatch(
    sentences: Array<{ text: string; audioBase64: string }>
  ): Promise<ReadAloudResult[]> {
    log.info({ count: sentences.length }, 'Batch evaluate start')

    if (!xfyunIseService.isConfigured()) {
      log.error('❌ 讯飞 ISE 未配置')
      return sentences.map(s => this.makeEmptyResult(s.text, '评测服务未配置，请联系管理员！'))
    }

    // 提取每句的 PCM buffer，逐句诊断
    const pcmBuffers: Buffer[] = []
    const validIndices: number[] = []
    const silentIndices: number[] = []
    const results: ReadAloudResult[] = new Array(sentences.length)

    for (let i = 0; i < sentences.length; i++) {
      const { text, audioBase64 } = sentences[i]
      const pcm = this.extractPCM(audioBase64)
      const durationSec = pcm.length / (16000 * 2)
      const maxAmp = this.getMaxAmplitude(pcm)

      log.info({
        index: i,
        text: text.slice(0, 40),
        pcmBytes: pcm.length,
        durationSec: durationSec.toFixed(2),
        maxAmplitude: maxAmp,
      }, 'Batch: audio diagnosis per sentence')

      // 静音检测 - RMS 过低的标记为未作答
      if (this.isSilent(pcm)) {
        log.warn({ index: i, text, maxAmplitude: maxAmp, durationSec: durationSec.toFixed(2) }, 'Batch: silent audio detected, marking as unanswered')
        results[i] = this.makeEmptyResult(text, '没有检测到语音，请确认麦克风正常并大声朗读哦！🎤')
        silentIndices.push(i)
      } else {
        pcmBuffers.push(pcm)
        validIndices.push(i)
      }
    }

    // 汇总诊断
    log.info({
      total: sentences.length,
      valid: validIndices.length,
      silent: silentIndices.length,
      silentIndices,
      validIndices,
    }, 'Batch: pre-evaluation summary')

    if (pcmBuffers.length === 0) {
      log.warn('Batch: all audio is silent, no sentences to evaluate')
      return results
    }

    // 调用篇章评测
    const validTexts = validIndices.map(i => sentences[i].text)

    try {
      const iseResults = await xfyunIseService.evaluateChapter(validTexts, pcmBuffers)

      // 检查返回的句子数是否匹配
      if (iseResults.length !== validIndices.length) {
        log.warn({
          expected: validIndices.length,
          got: iseResults.length,
        }, 'Batch: ISE returned sentence count mismatch')
      }

      for (let j = 0; j < validIndices.length; j++) {
        const originalIndex = validIndices[j]
        const iseResult = iseResults[j]

        if (iseResult.success && iseResult.data) {
          const d = iseResult.data
          log.info({
            index: originalIndex,
            text: sentences[originalIndex].text.slice(0, 30),
            accuracy: d.accuracy,
            fluency: d.fluency,
            completeness: d.completeness,
            suggestedScore: d.suggestedScore,
            wordCount: d.words.length,
            missingWords: d.words.filter(w => w.matchTag === 'missing').map(w => w.word),
          }, 'Batch: sentence result')
          results[originalIndex] = this.formatISEResult(sentences[originalIndex].text, iseResult)
        } else {
          log.warn({ index: originalIndex, error: iseResult.error }, 'Batch: sentence evaluate failed, falling back to per-sentence')
          const fallback = await this.evaluateAudio(sentences[originalIndex].text, sentences[originalIndex].audioBase64)
          results[originalIndex] = fallback
        }
      }

      // 最终汇总
      log.info({
        results: results.map((r, i) => ({
          index: i,
          accuracy: r?.accuracy ?? null,
          completeness: r?.completeness ?? null,
          missingWords: r?.words?.filter(w => w.matchTag === 'missing').length ?? 0,
        })),
      }, 'Batch: final results summary')
    } catch (err) {
      log.error({ err }, 'Batch: chapter evaluate failed entirely, falling back to per-sentence for all')
      for (const i of validIndices) {
        log.info({ index: i, text: sentences[i].text.slice(0, 30) }, 'Batch: fallback evaluating sentence individually')
        results[i] = await this.evaluateAudio(sentences[i].text, sentences[i].audioBase64)
      }
    }

    return results
  }

  private extractPCM(audioBase64: string): Buffer {
    let cleanBase64 = audioBase64
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1]
    }
    cleanBase64 = cleanBase64.replace(/^data:audio\/\w+;base64,/, '')
    const buf = Buffer.from(cleanBase64, 'base64')
    // WAV: strip 44-byte header
    if (buf.length > 44 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
      return buf.slice(44)
    }
    return buf
  }

  private getMaxAmplitude(pcm: Buffer): number {
    let max = 0
    for (let i = 0; i < pcm.length - 1; i += 2) {
      const sample = Math.abs(pcm.readInt16LE(i))
      if (sample > max) max = sample
    }
    return max
  }

  private isSilent(pcm: Buffer): boolean {
    if (pcm.length < 3200) return true // < 100ms
    return this.getMaxAmplitude(pcm) < 100 // 非常安静
  }

  private makeEmptyResult(text: string, feedback: string): ReadAloudResult {
    const words = text.split(/\s+/).filter(w => w.length > 0)
    return {
      words: words.map(w => ({ text: w, status: 'missing' as const, accuracy: 0, matchTag: 'missing' as const })),
      accuracy: 0,
      feedback,
      fluency: 0,
      completeness: 0,
      suggestedScore: 0,
      evaluationMethod: 'ise',
    }
  }

  /**
   * 评估音频 - 使用科大讯飞 ISE
   */
  async evaluateAudio(originalSentence: string, audioBase64: string): Promise<ReadAloudResult> {
    log.info({ sentence: originalSentence }, 'Evaluating audio')

    if (!xfyunIseService.isConfigured()) {
      log.error('❌ 讯飞 ISE 未配置，请检查 XFYUN_APP_ID / XFYUN_API_KEY / XFYUN_API_SECRET')
      const words = originalSentence.split(/\s+/).filter(w => w.length > 0)
      return {
        words: words.map(w => ({ text: w, status: 'missing' as const, accuracy: 0 })),
        accuracy: 0,
        feedback: '评测服务未配置，请联系管理员！',
        fluency: 0,
        completeness: 0,
        suggestedScore: 0,
        evaluationMethod: 'ise',
      }
    }

    try {
      log.info('🎯 Using: 科大讯飞 ISE')
      const iseResult = await xfyunIseService.evaluate(originalSentence, audioBase64)

      if (iseResult.success && iseResult.data) {
        const d = iseResult.data
        log.info({ accuracy: d.accuracy, fluency: d.fluency, completeness: d.completeness, totalScore: d.suggestedScore }, '✅ ISE Result')
        log.debug({ words: d.words.map(w => `${w.word}(${w.matchTag}:${w.accuracy})`) }, 'ISE word detail')

        // 检测静音：所有分数为 0 且所有词都是 missing
        const isSilent = d.suggestedScore === 0 && d.accuracy === 0
          && d.words.every(w => w.matchTag === 'missing')
        if (isSilent) {
          log.warn('🔇 ISE detected silence (all words missing, score=0)')
          const words = originalSentence.split(/\s+/).filter(w => w.length > 0)
          return {
            words: words.map(w => ({ text: w, status: 'missing' as const, accuracy: 0, matchTag: 'missing' as const })),
            accuracy: 0,
            feedback: '没有检测到语音，请确认麦克风正常并大声朗读哦！🎤',
            fluency: 0,
            completeness: 0,
            suggestedScore: 0,
            evaluationMethod: 'ise',
          }
        }

        return this.formatISEResult(originalSentence, iseResult)
      }

      // ISE 返回失败
      log.error({ error: iseResult.error }, '❌ ISE evaluate failed')
      const words = originalSentence.split(/\s+/).filter(w => w.length > 0)
      return {
        words: words.map(w => ({ text: w, status: 'missing' as const, accuracy: 0 })),
        accuracy: 0,
        feedback: '评测失败，请重试！',
        fluency: 0,
        completeness: 0,
        suggestedScore: 0,
        evaluationMethod: 'ise',
      }
    } catch (err) {
      log.error({ err }, '❌ ISE error')
      const words = originalSentence.split(/\s+/).filter(w => w.length > 0)
      return {
        words: words.map(w => ({ text: w, status: 'missing' as const, accuracy: 0 })),
        accuracy: 0,
        feedback: '评测服务异常，请稍后重试！',
        fluency: 0,
        completeness: 0,
        suggestedScore: 0,
        evaluationMethod: 'ise',
      }
    }
  }

  /**
   * 将讯飞 ISE 结果格式化为统一的 ReadAloudResult
   */
  private formatISEResult(originalSentence: string, iseResult: ISEEvaluateResult): ReadAloudResult {
    const data = iseResult.data!
    const originalWords = originalSentence.split(/\s+/).filter(w => w.length > 0)

    const normalizeForMatch = (text: string) => text.toLowerCase().replace(/[.,!?'"'\u2018\u2019\u201C\u201D;\-:]/g, '').trim()

    // 过滤掉 extra 词（多读的，原句里没有）
    const iseNonExtra = data.words.filter(w => w.matchTag !== 'extra')

    // 建立讯飞词到原句词的映射关系（处理缩写拆词等情况）
    const iseToOrigMap = new Map<number, string>()
    let origIdx = 0
    let iseIdx = 0
    while (iseIdx < iseNonExtra.length && origIdx < originalWords.length) {
      const origNorm = normalizeForMatch(originalWords[origIdx])
      const iseNorm = normalizeForMatch(iseNonExtra[iseIdx].word)

      if (iseNorm === origNorm) {
        iseToOrigMap.set(iseIdx, originalWords[origIdx])
        iseIdx++
        origIdx++
      } else if (origNorm.startsWith(iseNorm)) {
        let merged = iseNorm
        let lookAhead = iseIdx + 1
        let matched = false
        while (lookAhead < iseNonExtra.length && merged.length < origNorm.length) {
          merged += normalizeForMatch(iseNonExtra[lookAhead].word)
          if (merged === origNorm) {
            for (let k = iseIdx; k <= lookAhead; k++) {
              iseToOrigMap.set(k, k === iseIdx ? originalWords[origIdx] : '')
            }
            iseIdx = lookAhead + 1
            origIdx++
            matched = true
            break
          }
          lookAhead++
        }
        if (!matched) {
          iseToOrigMap.set(iseIdx, originalWords[origIdx])
          iseIdx++
          origIdx++
        }
      } else {
        iseToOrigMap.set(iseIdx, originalWords[origIdx])
        iseIdx++
        origIdx++
      }
    }

    // 构建词级结果
    let nonExtraIdx = 0
    const words: WordResult[] = []
    for (const w of data.words) {
      let status: 'correct' | 'incorrect' | 'missing' = 'correct'
      if (w.matchTag === 'missing') status = 'missing'
      else if (w.matchTag === 'mispronounced' || w.matchTag === 'extra') status = 'incorrect'
      if (w.matchTag === 'correct' && w.accuracy < 40) status = 'incorrect'

      let displayText = w.word
      let skip = false
      if (w.matchTag !== 'extra') {
        const mapped = iseToOrigMap.get(nonExtraIdx)
        if (mapped === '') {
          skip = true
        } else if (mapped !== undefined) {
          displayText = mapped
        }
        nonExtraIdx++
      }

      if (!skip) {
        words.push({
          text: displayText,
          status,
          spoken: w.realWord,
          accuracy: w.accuracy,
          fluency: w.fluency,
          matchTag: w.matchTag,
          phoneInfos: w.phoneInfos,
        })
      }
    }

    // ISE 评分已经足够准确，仅做微小调整避免过低打击信心
    const rawScore = data.suggestedScore
    let accuracy: number
    if (rawScore >= 80) {
      accuracy = Math.round(rawScore)
    } else if (rawScore >= 60) {
      accuracy = Math.round(rawScore + (80 - rawScore) * 0.1)
    } else if (rawScore >= 40) {
      accuracy = Math.round(rawScore + 5)
    } else {
      accuracy = Math.round(rawScore * 1.15 + 3)
    }
    accuracy = Math.min(accuracy, 100)

    // 根据多维度数据生成针对性 feedback
    let feedback: string
    if (accuracy >= 90) {
      feedback = '太棒了！发音非常标准！🌟'
    } else if (accuracy >= 80) {
      feedback = '很好！发音清晰准确！'
    } else if (accuracy >= 70) {
      if (data.fluency < 60) {
        feedback = '发音不错，注意语速和连读哦！'
      } else {
        feedback = '不错！注意标红单词的发音！'
      }
    } else if (accuracy >= 55) {
      if (data.completeness < 80) {
        feedback = '有漏读的词哦，尝试读完整！'
      } else if (data.fluency < 50) {
        feedback = '再流利一些会更好，多听多练！'
      } else {
        feedback = '还可以，注意波浪线的单词！'
      }
    } else if (accuracy >= 35) {
      feedback = '加油！跟着原音模仿发音！'
    } else {
      feedback = '别灰心！跟着原音多读几遍吧！'
    }

    return {
      words,
      accuracy,
      feedback,
      fluency: data.fluency,
      completeness: data.completeness,
      suggestedScore: data.suggestedScore,
      evaluationMethod: 'ise',
    }
  }
}

export const readAloudAgent = new ReadAloudAgent()
