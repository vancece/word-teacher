/**
 * 跟读整体评分 Agent
 * 新方案: 基于腾讯云 SOE 精确数据（音素级）生成专业评语
 * 兼容: 旧方案数据（只有 accuracy + spokenText）也能评分
 */
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { ChatOpenAI } from '@langchain/openai'
import { env } from '../config.js'

const SOE_SCORING_PROMPT = `你是一位温柔鼓励的小学英语老师，正在给学生（6-12岁）的英语跟读练习写评语。
评语是给小学生和家长看的，必须用简单易懂的中文，不要出现任何音素符号（如 /m/、/ɔː/、/hh/ 等）。

## 跟读场景
场景名称：{sceneName}

## 评测数据（仅供你分析参考，不要直接暴露给学生）
{evaluationData}

## 参考分数（由引擎计算，你需要在此基础上微调±5分以内）
{scoreReference}

## 写评语的规则（非常重要）

### 绝对禁止
- ❌ 不要写任何音素符号，如 /m/、/ao/、/hh/、/ey/、/ng/ 等
- ❌ 不要列举音素列表
- ❌ 不要提及"音素准确度≥92分"之类的技术指标
- ❌ 不要说"全部达标"、"均准确度≥XX分"

### 应该怎么写
- ✅ 直接说哪个单词读得好："Good morning 读得特别清楚"
- ✅ 用比喻和口语化的描述："Hello 你说得跟外国小朋友一样棒！"
- ✅ 给改进建议时用日常语言："name 这个词试试把嘴巴张开一点，像打哈欠开头那样"
- ✅ 简短、亲切、一看就懂

## 你的任务

1. **feedback**：1-2句简短评语
   - 说哪几个词/句读得好，哪个词需要加油，语气像聊天一样自然
   - 举例："'Good morning'和'How are you'说得超棒！'Hello'再大声一点会更好哦～"

2. **strengths**：2个亮点
   - 具体到哪个词或哪句话，用简单的话夸
   - 举例："'Good morning' 每个音都读得很清楚"、"说话的节奏很流畅，不赶不慢"

3. **improvements**：1-2个改进建议
   - 说哪个词需要练，用生活化的比喻教怎么改
   - 举例："'Hello' 可以试试先轻轻哈一口气再说，像冬天哈气那样"
   - 如果整体分数≥85，只用说"可以试着读得更有感情"

## 输出格式（纯 JSON，不要 markdown 代码块）
{{
  "totalScore": {refTotal},
  "accuracyScore": {refAccuracy},
  "fluencyScore": {refFluency},
  "intonationScore": 你根据整体表现给的分(0-100),
  "expressionScore": 你根据整体表现给的分(0-100),
  "feedback": "简短亲切的评语，不含音素符号",
  "strengths": ["亮点1", "亮点2"],
  "improvements": ["建议1", "建议2"]
}}`

const FALLBACK_SCORING_PROMPT = `你是一位专业的小学英语老师，正在为一位小学生（6-12岁）的英语跟读练习打分。

## 跟读场景
场景名称：{sceneName}

## 跟读记录
{readAloudHistory}

## 评分维度（每项0-100分）
- accuracyScore: 必须接近所有句子准确率的平均值（±3分）
- intonationScore: 参考准确率，±10分浮动
- fluencyScore: 参考准确率，±10分浮动
- expressionScore: 参考准确率，±10分浮动
- totalScore: 四项平均值

## 输出格式（纯 JSON，不要 markdown 代码块）
{{
  "totalScore": 0-100,
  "intonationScore": 0-100,
  "fluencyScore": 0-100,
  "accuracyScore": 0-100,
  "expressionScore": 0-100,
  "feedback": "鼓励性评语",
  "strengths": ["亮点1", "亮点2"],
  "improvements": ["建议1", "建议2"]
}}`

export interface ReadAloudScoringRequest {
  sceneName: string
  sentences: Array<{
    english: string
    chinese: string
    spokenText?: string
    accuracy: number
    // SOE 新增字段
    fluency?: number
    completeness?: number
    suggestedScore?: number
    evaluationMethod?: 'soe' | 'stt-compare'
    words?: Array<{
      word: string
      accuracy: number
      fluency: number
      matchTag: string
      phoneInfos?: Array<{
        phone: string
        accuracy: number
        detectedStress?: boolean
        referencePhone: string
      }>
    }>
  }>
}

export interface ReadAloudScoringResponse {
  totalScore: number
  intonationScore: number
  fluencyScore: number
  accuracyScore: number
  expressionScore: number
  feedback: string
  strengths: string[]
  improvements: string[]
}

class ReadAloudScoringAgent {
  private model: ChatOpenAI

  constructor() {
    this.model = new ChatOpenAI({
      modelName: env.models.plus,
      configuration: {
        baseURL: env.dashscope.baseUrl,
        apiKey: env.dashscope.apiKey,
      },
      temperature: 0.7,
    })
  }

  async evaluate(request: ReadAloudScoringRequest): Promise<ReadAloudScoringResponse> {
    // 判断是否有 SOE 数据
    const hasSOEData = request.sentences.some(s => s.evaluationMethod === 'soe' && s.words)

    let response: string

    if (hasSOEData) {
      response = await this.evaluateWithSOEData(request)
    } else {
      response = await this.evaluateWithFallback(request)
    }

    console.log('[ReadAloudScoring] Raw response:', response)

    // 解析 JSON
    try {
      const cleaned = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      return JSON.parse(cleaned)
    } catch {
      console.error('[ReadAloudScoring] Failed to parse:', response)
      return this.buildDefaultScore(request)
    }
  }

  /**
   * 基于 SOE 精确数据评分
   */
  private async evaluateWithSOEData(request: ReadAloudScoringRequest): Promise<string> {
    // 构建详细的评测数据（包含音素级信息）
    const evaluationData = request.sentences.map((s, i) => {
      const wordDetails = s.words?.map(w => {
        let detail = `  "${w.word}": 准确度${w.accuracy}分, 流利度${(w.fluency * 100).toFixed(0)}% [${w.matchTag}]`
        if (w.phoneInfos && w.phoneInfos.length > 0) {
          const phonemes = w.phoneInfos.map(p => {
            let mark = p.accuracy >= 80 ? '✓' : p.accuracy >= 60 ? '△' : `❌${p.accuracy}`
            if (p.detectedStress) mark += '⬆'
            return `/${p.phone}/${mark}`
          }).join(' ')
          detail += `\n    音素: ${phonemes}`
          // 标出参考音素（方便 AI 对比发音差异）
          const refPhones = w.phoneInfos.map(p => `/${p.referencePhone}/`).join(' ')
          if (refPhones) detail += `\n    参考: ${refPhones}`
        }
        return detail
      }).join('\n') || '  (无词级详情)'

      return `第${i + 1}句: "${s.english}"（${s.chinese}）
  准确度: ${s.accuracy}分 | 流利度: ${((s.fluency || 0) * 100).toFixed(0)}% | 完整度: ${((s.completeness || 0) * 100).toFixed(0)}% | 建议分: ${s.suggestedScore || s.accuracy}
${wordDetails}`
    }).join('\n\n')

    // 预计算各维度参考分数（基于 SOE 数据）
    const soeSentences = request.sentences.filter(s => s.evaluationMethod === 'soe')
    const avgSuggested = Math.round(soeSentences.reduce((sum, s) => sum + (s.suggestedScore || s.accuracy), 0) / soeSentences.length)
    const avgAccuracy = Math.round(soeSentences.reduce((sum, s) => sum + s.accuracy, 0) / soeSentences.length)
    const avgFluency = Math.round(soeSentences.reduce((sum, s) => sum + ((s.fluency || 0) * 100), 0) / soeSentences.length)

    const scoreReference = `总分参考: ${avgSuggested} | 准确度参考: ${avgAccuracy} | 流利度参考: ${avgFluency}`

    const prompt = ChatPromptTemplate.fromMessages([
      ['human', SOE_SCORING_PROMPT],
    ])

    const chain = prompt.pipe(this.model).pipe(new StringOutputParser())
    return chain.invoke({
      sceneName: request.sceneName,
      evaluationData,
      scoreReference,
      refTotal: avgSuggested,
      refAccuracy: avgAccuracy,
      refFluency: avgFluency,
    })
  }

  /**
   * 旧方案评分（兼容）
   */
  private async evaluateWithFallback(request: ReadAloudScoringRequest): Promise<string> {
    const history = request.sentences
      .map((s, i) => {
        const status = s.accuracy >= 80 ? '✓ 优秀' : s.accuracy >= 50 ? '△ 一般' : '✗ 需改进'
        return `第${i + 1}句：
  目标：${s.english}（${s.chinese}）
  识别：${s.spokenText || '(未识别)'}
  得分：${s.accuracy}分 ${status}`
      })
      .join('\n\n')

    const prompt = ChatPromptTemplate.fromMessages([
      ['human', FALLBACK_SCORING_PROMPT],
    ])

    const chain = prompt.pipe(this.model).pipe(new StringOutputParser())
    return chain.invoke({
      sceneName: request.sceneName,
      readAloudHistory: history,
    })
  }

  private buildDefaultScore(request: ReadAloudScoringRequest): ReadAloudScoringResponse {
    const avgAccuracy = Math.round(
      request.sentences.reduce((sum, s) => sum + s.accuracy, 0) / request.sentences.length
    )
    return {
      totalScore: avgAccuracy,
      intonationScore: avgAccuracy,
      fluencyScore: avgAccuracy,
      accuracyScore: avgAccuracy,
      expressionScore: avgAccuracy,
      feedback: avgAccuracy >= 80 ? '太棒了！你的朗读非常出色！继续保持！' : '练习完成！继续加油！',
      strengths: avgAccuracy >= 80 ? ['发音清晰准确', '完成度很高'] : ['完成了练习', '勇敢开口说英语'],
      improvements: ['继续保持练习', '可以尝试更有感情地朗读'],
    }
  }
}

export const readAloudScoringAgent = new ReadAloudScoringAgent()
