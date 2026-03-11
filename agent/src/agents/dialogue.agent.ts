import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { streamText, generateText } from 'ai'
import { env } from '../config.js'
import type { ChatRequest, ChatResponse } from '../types/index.js'

interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `You are a friendly and patient English teacher for elementary school students (ages 6-12).
You are helping a student practice English conversation in the scene: "{sceneName}".

Scene description: {sceneDescription}

Key vocabulary for this scene: {vocabulary}

Guidelines:
1. Use simple, clear English appropriate for young learners
2. Be encouraging and positive - use phrases like "Good job!", "Well done!", "That's right!"
3. Gently correct mistakes by modeling the correct form, don't criticize
4. Keep responses short (1-3 sentences)
5. Ask follow-up questions to keep the conversation going
6. This is round {currentRound} of {totalRounds}

{roundInstruction}

Remember: Be warm, patient, and make learning fun!`

const ROUND_INSTRUCTIONS: Record<number, string> = {
  1: 'This is the FIRST round. Start with a friendly greeting and introduce the topic naturally.',
  2: 'This is round 2. Continue the conversation, ask a simple question about the topic.',
  3: 'This is round 3. Keep the conversation going, encourage the student.',
  4: 'This is round 4. Ask another question or introduce a new aspect of the topic.',
  5: 'This is the FINAL round. Wrap up the conversation warmly, praise the student for their effort.',
}

export class DialogueAgent {
  private provider: ReturnType<typeof createOpenAICompatible>

  constructor() {
    this.provider = createOpenAICompatible({
      name: 'qwen',
      apiKey: env.openai.apiKey,
      baseURL: env.openai.baseUrl,
    })
  }

  private buildSystemPrompt(request: ChatRequest): string {
    const totalRounds = 5
    const roundInstruction = ROUND_INSTRUCTIONS[request.currentRound] || ''

    return SYSTEM_PROMPT
      .replace('{sceneName}', request.sceneName)
      .replace('{sceneDescription}', request.sceneDescription || request.sceneName)
      .replace('{vocabulary}', request.vocabulary?.join(', ') || 'general vocabulary')
      .replace('{currentRound}', String(request.currentRound))
      .replace('{totalRounds}', String(totalRounds))
      .replace('{roundInstruction}', roundInstruction)
  }

  private buildMessages(request: ChatRequest): AIMessage[] {
    const messages: AIMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(request) }
    ]

    // Add history
    for (const msg of request.history) {
      messages.push({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content,
      })
    }

    // Add current student message
    if (request.studentMessage) {
      messages.push({ role: 'user', content: request.studentMessage })
    } else {
      messages.push({ role: 'user', content: '(Please start the conversation)' })
    }

    return messages
  }

  // 流式输出
  async chatStream(request: ChatRequest): Promise<{ stream: any; isComplete: boolean }> {
    const messages = this.buildMessages(request)
    const isComplete = request.currentRound >= 5

    const result = streamText({
      model: this.provider.chatModel(env.openai.model),
      messages: messages as any,
      temperature: 0.7,
    })

    return { stream: result, isComplete }
  }

  // 非流式输出（保留兼容）
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const messages = this.buildMessages(request)
    const isComplete = request.currentRound >= 5

    const result = await generateText({
      model: this.provider.chatModel(env.openai.model),
      messages: messages as any,
      temperature: 0.7,
    })

    return {
      message: result.text,
      isComplete,
    }
  }
}

export const dialogueAgent = new DialogueAgent()

