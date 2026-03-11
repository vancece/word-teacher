/**
 * LangGraph 对话工作流 (支持流式输出)
 * 流程: 对话 Agent → 翻译 Agent → (5轮后) → 评分 Agent
 *
 * 流式事件:
 * - { type: 'text', content: string } - 对话文字块
 * - { type: 'translation_chunk', content: string } - 翻译文字块（流式）
 * - { type: 'translation', content: string } - 翻译完成（完整翻译）
 * - { type: 'audio', content: string } - 音频 base64
 * - { type: 'scores', content: ScoreResult } - 评分结果
 * - { type: 'done', isComplete: boolean } - 完成标记
 */
import { StateGraph, START, END, Annotation, type LangGraphRunnableConfig } from '@langchain/langgraph'
import { omniDialogueAgent, type OmniChatRequest } from '../agents/omni-dialogue.agent.js'
import { translationAgent } from '../agents/translation.agent.js'
import { scoringAgent } from '../agents/scoring.agent.js'

// 流式事件类型定义
export type StreamEvent =
  | { type: 'text'; content: string }
  | { type: 'translation_chunk'; content: string }
  | { type: 'translation'; content: string }
  | { type: 'audio'; content: string }
  | { type: 'scores'; content: ScoreResult }
  | { type: 'done'; isComplete: boolean }

export interface ScoreResult {
  totalScore: number
  vocabularyScore: number
  grammarScore: number
  communicationScore: number
  effortScore: number
  feedback: string
  strengths: string[]
  improvements: string[]
}

// 定义工作流状态
const DialogueState = Annotation.Root({
  // 输入
  sceneId: Annotation<string>,
  sceneName: Annotation<string>,
  sceneDescription: Annotation<string>,
  scenePrompt: Annotation<string | undefined>,  // 场景自定义 AI 提示词
  vocabulary: Annotation<string[]>,
  studentAudioBase64: Annotation<string | undefined>,
  studentMessage: Annotation<string | undefined>,
  history: Annotation<Array<{ role: 'ai' | 'student'; content: string }>>,
  currentRound: Annotation<number>,
  totalRounds: Annotation<number>,

  // 对话输出
  aiEnglish: Annotation<string>,
  aiChinese: Annotation<string>,
  aiAudio: Annotation<string>,

  // 评分输出 (5轮后)
  scores: Annotation<ScoreResult | null>,

  // 流程控制
  isComplete: Annotation<boolean>,
})

export type DialogueWorkflowState = typeof DialogueState.State
export type DialogueWorkflowInput = Partial<DialogueWorkflowState>

// 节点1: 对话 Agent - 生成英文回复+音频 (支持流式)
async function dialogueNode(
  state: DialogueWorkflowState,
  config: LangGraphRunnableConfig
): Promise<Partial<DialogueWorkflowState>> {
  console.log(`[Workflow] Dialogue node - round ${state.currentRound}/${state.totalRounds}`)

  const request: OmniChatRequest = {
    sceneId: state.sceneId,
    sceneName: state.sceneName,
    sceneDescription: state.sceneDescription,
    scenePrompt: state.scenePrompt,
    vocabulary: state.vocabulary,
    currentRound: state.currentRound,
    totalRounds: state.totalRounds,
    history: state.history,
    studentAudioBase64: state.studentAudioBase64,
    studentMessage: state.studentMessage,
  }

  // 使用流式方法，通过 config.writer 发送事件
  const writer = config.writer
  let fullText = ''
  let audioBase64 = ''
  let isComplete = false

  const result = await omniDialogueAgent.chatStream(
    request,
    // onTextChunk: 实时发送文字块
    (textChunk) => {
      if (writer) {
        writer({ type: 'text', content: textChunk } as StreamEvent)
      }
      fullText += textChunk
    },
    // onAudioComplete: 保存音频（稍后发送）
    (audio) => {
      audioBase64 = audio
    }
  )

  isComplete = result.isComplete
  fullText = result.text // 使用完整文本确保一致性

  return {
    aiEnglish: fullText,
    aiAudio: audioBase64,
    isComplete: isComplete,
  }
}

// 节点2: 翻译 Agent - 将英文翻译成中文 (流式输出)
async function translateNode(
  state: DialogueWorkflowState,
  config: LangGraphRunnableConfig
): Promise<Partial<DialogueWorkflowState>> {
  console.log(`[Workflow] Translate node - translating: "${state.aiEnglish.substring(0, 30)}..."`)

  const writer = config.writer

  // 使用流式翻译，逐字发送翻译结果
  const chinese = await translationAgent.translateStream(
    state.aiEnglish,
    (chunk) => {
      if (writer) {
        writer({ type: 'translation_chunk', content: chunk } as StreamEvent)
      }
    }
  )

  // 翻译完成后发送完整翻译（用于最终保存）
  if (writer) {
    writer({ type: 'translation', content: chinese } as StreamEvent)
    // 同时发送音频（文字和翻译都完成后）
    if (state.aiAudio) {
      writer({ type: 'audio', content: state.aiAudio } as StreamEvent)
    }
  }

  return {
    aiChinese: chinese,
  }
}

// 节点3: 评分 Agent - 5轮对话结束后评分 (支持流式)
async function scoringNode(
  state: DialogueWorkflowState,
  config: LangGraphRunnableConfig
): Promise<Partial<DialogueWorkflowState>> {
  console.log(`[Workflow] Scoring node - evaluating dialogue`)

  // 构建对话历史（包含最后一轮）
  const fullHistory = [
    ...state.history,
    { role: 'student' as const, content: state.studentMessage || '(语音输入)' },
    { role: 'ai' as const, content: state.aiEnglish },
  ]

  const evaluation = await scoringAgent.evaluate({
    sceneId: state.sceneId,
    sceneName: state.sceneName,
    vocabulary: state.vocabulary,
    dialogueHistory: fullHistory.map(m => ({
      role: m.role,
      content: m.content,
    })),
  })

  const scores: ScoreResult = {
    totalScore: evaluation.totalScore,
    vocabularyScore: evaluation.vocabularyScore,
    grammarScore: evaluation.grammarScore,
    communicationScore: evaluation.communicationScore,
    effortScore: evaluation.effortScore,
    feedback: evaluation.feedback,
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
  }

  // 发送评分结果
  const writer = config.writer
  if (writer) {
    writer({ type: 'scores', content: scores } as StreamEvent)
  }

  return {
    scores,
  }
}

// 条件: 判断是否需要评分
function shouldScore(state: DialogueWorkflowState): 'scoring' | 'end' {
  if (state.isComplete || state.currentRound >= state.totalRounds) {
    console.log(`[Workflow] Routing to scoring (round ${state.currentRound}/${state.totalRounds})`)
    return 'scoring'
  }
  console.log(`[Workflow] Routing to end (continue dialogue)`)
  return 'end'
}

// 构建工作流图
const workflow = new StateGraph(DialogueState)
  .addNode('dialogue', dialogueNode)
  .addNode('translate', translateNode)
  .addNode('scoring', scoringNode)
  .addEdge(START, 'dialogue')
  .addEdge('dialogue', 'translate')
  .addConditionalEdges('translate', shouldScore, {
    scoring: 'scoring',
    end: END,
  })
  .addEdge('scoring', END)

// 编译工作流
export const dialogueWorkflow = workflow.compile()

console.log('[Workflow] Dialogue workflow compiled successfully')

