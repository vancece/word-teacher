/**
 * 跟读整体评分 Agent
 * 基于科大讯飞 ISE 精确数据（音素级）生成专业评语
 */
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { ChatOpenAI } from '@langchain/openai'
import { env } from '../config.js'

const SCORING_PROMPT = `你是一位温柔鼓励的小学英语老师，正在给学生（6-12岁）的英语跟读练习写评语。
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

export interface ReadAloudScoringRequest {
  sceneName: string
  sentences: Array<{
    english: string
    chinese: string
    accuracy: number
    fluency?: number
    completeness?: number
    suggestedScore?: number
    evaluationMethod?: string
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
    let response: string

    try {
      response = await this.evaluateWithISEData(request)
    } catch (err) {
      console.error('[ReadAloudScoring] Evaluation error:', err)
      return this.buildDefaultScore(request)
    }

    console.log('[ReadAloudScoring] Raw response:', response)

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

  private async evaluateWithISEData(request: ReadAloudScoringRequest): Promise<string> {
    const evaluationData = request.sentences.map((s, i) => {
      const wordDetails = s.words?.map(w => {
        let detail = `  "${w.word}": 准确度${Math.round(w.accuracy)}分, 流利度${Math.round(w.fluency * 100)}% [${w.matchTag}]`
        if (w.phoneInfos && w.phoneInfos.length > 0) {
          const phonemes = w.phoneInfos.map(p => {
            let mark = p.accuracy >= 80 ? '✓' : p.accuracy >= 60 ? '△' : `❌${Math.round(p.accuracy)}`
            if (p.detectedStress) mark += '⬆'
            return `/${p.phone}/${mark}`
          }).join(' ')
          detail += `\n    音素: ${phonemes}`
        }
        return detail
      }).join('\n') || '  (无词级详情)'

      return `第${i + 1}句: "${s.english}"（${s.chinese}）
  准确度: ${s.accuracy}分 | 流利度: ${Math.round(s.fluency || 0)}% | 完整度: ${Math.round(s.completeness || 0)}% | 建议分: ${s.suggestedScore || s.accuracy}
${wordDetails}`
    }).join('\n\n')

    const avgSuggested = Math.round(request.sentences.reduce((sum, s) => sum + (s.suggestedScore || s.accuracy), 0) / request.sentences.length)
    const avgAccuracy = Math.round(request.sentences.reduce((sum, s) => sum + s.accuracy, 0) / request.sentences.length)
    const avgFluency = Math.round(request.sentences.reduce((sum, s) => sum + (s.fluency || 0), 0) / request.sentences.length)

    const scoreReference = `总分参考: ${avgSuggested} | 准确度参考: ${avgAccuracy} | 流利度参考: ${avgFluency}`

    const prompt = ChatPromptTemplate.fromMessages([
      ['human', SCORING_PROMPT],
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
