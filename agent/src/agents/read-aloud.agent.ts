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
