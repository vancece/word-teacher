/**
 * 跟读评分 Agent - 整体评估学生的跟读表现
 */
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { ChatOpenAI } from '@langchain/openai'
import { env } from '../config.js'

const SCORING_PROMPT = `你是一位专业的小学英语老师，正在为一位小学生（6-12岁）的英语跟读练习打分。

## ⚠️ 重要：严格基于实际准确率评分！
- 所有分数都必须参考实际的句子准确率
- 不能凭空给高分，必须有数据支撑
- 90分以上只给真正优秀的表现（平均准确率≥90%）

## 跟读场景
场景名称：{sceneName}

## 跟读记录（每句话的准确率已给出）
{readAloudHistory}

## 评分维度（每项0-100分）- 严格标准

### 1. 语音语调 (intonationScore)
必须基于准确率：
- 90-100分：平均准确率≥90%，且没有任何句子<70%
- 80-89分：平均准确率≥80%
- 70-79分：平均准确率≥70%
- 60-69分：平均准确率≥60%
- 60分以下：平均准确率<60%

### 2. 流利连贯 (fluencyScore)
参考准确率，适当浮动±5分：
- 如果有多个句子准确率很低（<50%），说明不流利，扣分
- 如果所有句子准确率较高且均匀，说明流利，可以略微加分

### 3. 准确完整 (accuracyScore)
**必须等于或接近（±3分）所有句子准确率的平均值！**
- 这是最客观的指标，不允许主观调整

### 4. 情感表现力 (expressionScore)
参考准确率，适当浮动±5分：
- 准确率高的情况下，可以适当加分
- 准确率低的情况下，不应该给高分

## 严格评分原则
1. **accuracyScore = 平均准确率**（允许±3分微调）
2. **其他三项不能偏离平均准确率太多**（±10分以内）
3. **totalScore = 四项平均值**
4. **有句子<50分时，总分不能超过80分**
5. **有句子<30分时，总分不能超过70分**

## 输出格式（JSON，不要 markdown）
{{
  "totalScore": 0-100（四项平均值，四舍五入取整）,
  "intonationScore": 0-100,
  "fluencyScore": 0-100,
  "accuracyScore": 0-100（必须接近平均准确率±3分）,
  "expressionScore": 0-100,
  "feedback": "鼓励性的中文评语，指出优点和改进方向",
  "strengths": ["亮点1", "亮点2"],
  "improvements": ["具体建议1", "具体建议2"]
}}

请严格根据学生的实际准确率给出评分：`

export interface ReadAloudScoringRequest {
  sceneName: string
  sentences: Array<{
    english: string
    chinese: string
    spokenText?: string
    accuracy: number
  }>
}

export interface ReadAloudScoringResponse {
  totalScore: number           // 总分 0-100
  intonationScore: number      // 语音语调 0-100
  fluencyScore: number         // 流利连贯 0-100
  accuracyScore: number        // 准确完整 0-100
  expressionScore: number      // 情感表现力 0-100
  feedback: string
  strengths: string[]
  improvements: string[]
}

class ReadAloudScoringAgent {
  private model: ChatOpenAI

  constructor() {
    this.model = new ChatOpenAI({
      modelName: env.models.plus,  // 使用高质量模型进行评分
      configuration: {
        baseURL: env.dashscope.baseUrl,
        apiKey: env.dashscope.apiKey,
      },
      temperature: 0.7,
    })
  }

  async evaluate(request: ReadAloudScoringRequest): Promise<ReadAloudScoringResponse> {
    // 构建跟读历史
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
      ['human', SCORING_PROMPT],
    ])

    const chain = prompt.pipe(this.model).pipe(new StringOutputParser())

    const response = await chain.invoke({
      sceneName: request.sceneName,
      readAloudHistory: history,
    })

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
      // 返回默认评分（直接基于平均准确率）
      const avgAccuracy = Math.round(request.sentences.reduce((sum, s) => sum + s.accuracy, 0) / request.sentences.length)

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
}

export const readAloudScoringAgent = new ReadAloudScoringAgent()

