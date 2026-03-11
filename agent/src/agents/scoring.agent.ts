import { ChatOpenAI } from '@langchain/openai'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { env } from '../config.js'
import type { EvaluationRequest, EvaluationResponse } from '../types/index.js'

const SCORING_PROMPT = `你是一位经验丰富的英语老师，正在评估小学生的英语对话练习。

## ⚠️ 重要：以下只有学生说的内容！

你需要评估的是学生在对话练习中说的这些话：

{studentMessages}

## 背景信息
- 场景：{sceneName}
- 目标词汇：{vocabulary}
- 学生年龄：小学生（6-12岁）

## 🚨 语言判断规则（最重要！）

**先判断学生说的是什么语言：**
- **英文**（包含英文单词/句子）→ 有效回复，正常评分
- **中文**（只有中文字符）→ 无效回复！所有项目最多30分！
- **沉默/噪音**（如 "(silence)"、"(无法识别)"、"[学生未发言]"）→ 无效！所有项目最多20分！

## 评分标准（每项0-100分，基于小学生标准，鼓励为主）

**词汇运用** (0-100分)
- 50-64分：只用最基础词汇（hello, yes, no）
- 65-79分：使用了1-2个目标词汇
- 80-94分：使用了3个以上目标词汇
- 95-100分：自然使用所有目标词汇

**语法准确** (0-100分) 💡 宽松评分
- 60-74分：能表达意思，语法错误不影响理解
- 75-84分：大部分句子能理解，有一些小错误
- 85-94分：语法基本正确
- 95-100分：语法完美

**交流能力** (0-100分)
- 50-64分：能用单词回应
- 65-79分：能用短句回答问题
- 80-94分：回答较好，有互动
- 95-100分：主动发起话题、补充细节

**努力程度** (0-100分)
- 50-64分：有尝试说英语
- 65-79分：积极回应每个问题
- 80-94分：一直使用英语交流
- 95-100分：回答详细有创意

## 输出格式
只返回JSON，不要markdown：

{{
  "totalScore": <0-100整数>,
  "vocabularyScore": <0-100整数>,
  "grammarScore": <0-100整数>,
  "communicationScore": <0-100整数>,
  "effortScore": <0-100整数>,
  "feedback": "<中文评语，只基于学生说的内容>",
  "strengths": ["亮点1", "亮点2"],
  "improvements": ["建议1", "建议2"]
}}

## 反馈模板
- 学生说了英文且表现好："你的英语表达很棒！..." + 具体引用学生说的话
- 学生说了英文但较少："你开始尝试用英语了，继续加油！..."
- 学生说中文："这次要记得用英语回答哦！勇敢地说出来！"
- 学生沉默："这次你好像没怎么开口哦，下次勇敢地尝试用英语回答吧！"

记住：只评价上面列出的学生说的内容！feedback 中引用的句子必须是学生说的！`

export class ScoringAgent {
  private model: ChatOpenAI

  constructor() {
    this.model = new ChatOpenAI({
      openAIApiKey: env.openai.apiKey,
      modelName: env.openai.model,
      temperature: 0.2, // Lower temperature for consistent scoring
      configuration: {
        baseURL: env.openai.baseUrl,
      },
    })
  }

  // 检测文本是否主要是中文（用于兜底判断）
  private isMostlyChinese(text: string): boolean {
    if (!text) return false
    // 匹配中文字符
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || []
    // 匹配英文单词
    const englishWords = text.match(/[a-zA-Z]+/g) || []
    // 如果中文字符数量 > 英文单词数量的2倍，认为是主要中文
    return chineseChars.length > englishWords.length * 2
  }

  async evaluate(request: EvaluationRequest): Promise<EvaluationResponse> {
    // 提取学生说的所有内容（只要学生的，不要 AI 的！）
    const studentMessagesList = request.dialogueHistory
      .filter(msg => msg.role === 'student')
      .map(msg => msg.content)

    const studentMessagesText = studentMessagesList.join(' ')

    // 🚨 兜底检查：如果学生主要说中文，强制给低分
    const studentSpeaksChinese = this.isMostlyChinese(studentMessagesText)
    if (studentSpeaksChinese) {
      console.log('[Scoring] Student spoke mostly Chinese, forcing low score')
      return {
        totalScore: 25,
        vocabularyScore: 20,
        grammarScore: 25,
        communicationScore: 30,
        effortScore: 30,
        feedback: '这次要记得用英语回答哦！我们是在练习英语口语，下次勇敢地说出来！你可以从简单的 "Hello" "My name is..." 开始！',
        strengths: ['积极参与了对话', '能理解 AI 老师的问题'],
        improvements: ['下次要用英语回答，哪怕只是简单的单词也好', '可以先学会说 "Hello", "Yes", "I like..." 这些简单表达'],
      }
    }

    // 🔥 关键修改：只传递学生说的内容，不传递 AI 的话！
    // 格式化为编号列表，清晰展示每一句
    const studentMessagesFormatted = studentMessagesList
      .map((msg, i) => `${i + 1}. "${msg}"`)
      .join('\n')

    console.log('[Scoring] Only evaluating student messages:', studentMessagesFormatted)

    const prompt = ChatPromptTemplate.fromMessages([
      ['human', SCORING_PROMPT],
    ])

    const chain = prompt.pipe(this.model).pipe(new StringOutputParser())

    const response = await chain.invoke({
      sceneName: request.sceneName,
      vocabulary: request.vocabulary?.join(', ') || 'general vocabulary',
      studentMessages: studentMessagesFormatted,
    })

    // Parse JSON response
    let result: Record<string, unknown>
    try {
      // Clean up response (remove potential markdown code blocks)
      const cleanedResponse = response.replace(/```json\n?|\n?```/g, '').trim()
      result = JSON.parse(cleanedResponse)
    } catch (error) {
      console.error('Failed to parse scoring response:', response)
      // Return default scores if parsing fails (60 points - average)
      result = {
        totalScore: 60,
        vocabularyScore: 60,
        grammarScore: 60,
        communicationScore: 60,
        effortScore: 60,
        feedback: '你做得很好！继续努力练习英语！每次练习都是进步！',
        strengths: ['积极参与了对话练习', '勇敢地尝试说英语'],
        improvements: ['可以多使用完整的句子', '继续扩展词汇量'],
      }
    }

    // Extract 100-point scores
    const totalScore = (result.totalScore as number) ?? 60
    const vocabScore = (result.vocabularyScore as number) ?? 60
    const grammarScore = (result.grammarScore as number) ?? 60
    const commScore = (result.communicationScore as number) ?? 60
    const effortScore = (result.effortScore as number) ?? 60

    return {
      totalScore: totalScore,
      vocabularyScore: vocabScore,
      grammarScore: grammarScore,
      communicationScore: commScore,
      effortScore: effortScore,
      feedback: (result.feedback as string) ?? '继续加油！',
      strengths: (result.strengths as string[]) ?? [],
      improvements: (result.improvements as string[]) ?? [],
    }
  }
}

export const scoringAgent = new ScoringAgent()

