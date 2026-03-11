/**
 * 学习总结 Agent
 * 根据学生的历史练习评价，总结学习情况（优点和不足）
 */
import { ChatOpenAI } from '@langchain/openai'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { env } from '../config.js'

const SUMMARY_PROMPT = `你是一位经验丰富的英语老师，正在为小学生的英语学习情况撰写**个性化**总结报告。

## 学生信息
- 姓名：{studentName}
- 班级：{className}

## 练习统计（重要！必须在总结中体现）
- **总练习次数**：{totalCount} 次
- 对话练习：{practiceCount} 次，平均分 {practiceAvg} 分（最高 {practiceMax} 分，最低 {practiceMin} 分）
- 跟读练习：{readAloudCount} 次，平均分 {readAloudAvg} 分（最高 {readAloudMax} 分，最低 {readAloudMin} 分）

## 学习趋势分析（重要！必须分析进步或退步情况）
- 对话练习趋势：{practiceTrendDesc}
- 跟读练习趋势：{readAloudTrendDesc}

## 各项能力分析（对话练习细项平均分）
- 发音准确度：{pronunciationAvg} 分
- 口语流利度：{fluencyAvg} 分
- 语法正确性：{grammarAvg} 分

## 历史评价记录
{feedbackHistory}

## 任务要求
请根据以上数据撰写**个性化**学习总结，必须做到：

1. **必须提及具体数据**：
   - 明确说明"进行了 X 次练习"
   - 提及平均分、最高分等具体数字
   - 对比训练趋势（是进步了还是需要加油）

2. **分析学习变化**：
   - 如果有进步，说明进步了多少分
   - 如果有退步或停滞，委婉指出并给出建议
   - 分析哪项能力强、哪项需要提升

3. **给出针对性建议**：
   - 根据薄弱项给出具体训练建议
   - 建议要可操作、具体

输出格式要求（严格 JSON）：
{{
  "strengths": ["优点1（要具体，可引用数据）", "优点2", "优点3"],
  "weaknesses": ["需改进1（委婉表达）", "需改进2"],
  "overallComment": "150字左右的总体评价。必须包含：1.总练习次数 2.成绩趋势变化 3.鼓励的话",
  "suggestions": ["具体建议1", "具体建议2", "具体建议3"]
}}

注意：
1. 每个学生的总结都应该不同，体现个性化
2. 语言要适合家长和小学生阅读，温暖鼓励
3. 如果练习次数少于5次，要鼓励多练习
4. 如果某项分数特别低（<60），要重点关注`

export interface TrendData {
  trend: 'improving' | 'declining' | 'stable' | 'insufficient'
  change: number
  firstAvg?: number
  secondAvg?: number
}

export interface SummaryRequest {
  studentName: string
  className: string | null
  // 基础统计
  practiceCount: number
  readAloudCount: number
  totalCount: number
  practiceAvg: number
  readAloudAvg: number
  // 分数范围
  practiceMax: number
  practiceMin: number
  readAloudMax: number
  readAloudMin: number
  // 趋势数据
  practiceTrend: TrendData
  readAloudTrend: TrendData
  // 细项分数
  pronunciationAvg: number
  fluencyAvg: number
  grammarAvg: number
  // 反馈历史
  feedbackHistory: string
}

export interface SummaryResponse {
  strengths: string[]
  weaknesses: string[]
  overallComment: string
  suggestions: string[]
}

// 生成趋势描述
function describeTrend(trend: TrendData, type: string): string {
  if (trend.trend === 'insufficient') {
    return `练习次数较少，暂无法分析趋势`
  }
  if (trend.trend === 'improving') {
    return `呈上升趋势，从平均 ${trend.firstAvg} 分提升到 ${trend.secondAvg} 分，进步了 ${trend.change} 分 ✨`
  }
  if (trend.trend === 'declining') {
    return `需要关注，从平均 ${trend.firstAvg} 分下降到 ${trend.secondAvg} 分，下降了 ${Math.abs(trend.change)} 分`
  }
  return `保持稳定，维持在 ${trend.secondAvg || trend.firstAvg} 分左右`
}

export class SummaryAgent {
  private model: ChatOpenAI

  constructor() {
    this.model = new ChatOpenAI({
      openAIApiKey: env.openai.apiKey,
      configuration: { baseURL: env.openai.baseUrl },
      modelName: env.openai.model,
      temperature: 0.8, // 稍微提高创造性
    })
  }

  async generateSummary(request: SummaryRequest): Promise<SummaryResponse> {
    const prompt = ChatPromptTemplate.fromMessages([
      ['human', SUMMARY_PROMPT],
    ])

    const chain = prompt.pipe(this.model).pipe(new StringOutputParser())

    // 生成趋势描述文本
    const practiceTrendDesc = describeTrend(request.practiceTrend, '对话')
    const readAloudTrendDesc = describeTrend(request.readAloudTrend, '跟读')

    const response = await chain.invoke({
      studentName: request.studentName,
      className: request.className || '未知班级',
      // 基础统计
      totalCount: request.totalCount,
      practiceCount: request.practiceCount,
      readAloudCount: request.readAloudCount,
      practiceAvg: request.practiceAvg,
      readAloudAvg: request.readAloudAvg,
      // 分数范围
      practiceMax: request.practiceMax || '-',
      practiceMin: request.practiceMin || '-',
      readAloudMax: request.readAloudMax || '-',
      readAloudMin: request.readAloudMin || '-',
      // 趋势描述
      practiceTrendDesc,
      readAloudTrendDesc,
      // 细项分数
      pronunciationAvg: request.pronunciationAvg || '-',
      fluencyAvg: request.fluencyAvg || '-',
      grammarAvg: request.grammarAvg || '-',
      // 反馈历史
      feedbackHistory: request.feedbackHistory || '暂无详细评价记录',
    })

    // Parse JSON response
    let result: SummaryResponse
    try {
      const cleanedResponse = response.replace(/```json\n?|\n?```/g, '').trim()
      result = JSON.parse(cleanedResponse)
    } catch (error) {
      console.error('Failed to parse summary response:', response)
      // Return default summary with actual data if parsing fails
      const total = request.totalCount
      result = {
        strengths: [`已完成 ${total} 次练习，学习态度积极`],
        weaknesses: ['需要更多练习来巩固'],
        overallComment: `${request.studentName}同学共进行了 ${total} 次英语练习，对话平均分 ${request.practiceAvg} 分，跟读平均分 ${request.readAloudAvg} 分。继续保持学习热情！`,
        suggestions: ['每天坚持练习15分钟', '多进行口语训练'],
      }
    }

    return result
  }
}

export const summaryAgent = new SummaryAgent()

