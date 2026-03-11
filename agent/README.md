# Word Teacher - Agent 服务

基于多 Agent 架构的 AI 对话引擎，为小学生英语口语练习提供智能对话、实时翻译和自动评分功能。

## 🏗️ 架构

### 流式工作流 (SSE)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Streaming Workflow (SSE)                             │
│                                                                         │
│  用户输入 (文字/语音)                                                    │
│     ↓                                                                   │
│  ┌─────────────────┐                                                    │
│  │ OmniDialogue    │ ──→ SSE: { type: 'text', content: '...' }         │
│  │   Agent         │         ↓ 文字逐字流式输出                          │
│  │ qwen3-omni-flash│ ──→ 保存音频 (等待翻译完成后发送)                    │
│  └────────┬────────┘                                                    │
│           ↓                                                             │
│  ┌─────────────────┐                                                    │
│  │ Translation     │ ──→ SSE: { type: 'translation', content: '...' }  │
│  │   Agent         │ ──→ SSE: { type: 'audio', content: 'base64...' }  │
│  │   qwen-turbo    │                                                    │
│  └────────┬────────┘                                                    │
│           ↓                                                             │
│  ┌─────────────────┐                                                    │
│  │  Scoring Agent  │ ──→ SSE: { type: 'scores', content: {...} }       │
│  │   qwen-plus     │         (仅第5轮触发)                               │
│  └────────┬────────┘                                                    │
│           ↓                                                             │
│      SSE: { type: 'done', isComplete: boolean }                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 流式事件类型

```typescript
type StreamEvent =
  | { type: 'text'; content: string }       // 文字块（逐字显示）
  | { type: 'translation'; content: string } // 中文翻译
  | { type: 'audio'; content: string }       // 音频 base64 (WAV 16kHz)
  | { type: 'scores'; content: ScoreResult } // 评分结果（5轮后触发）
  | { type: 'done'; isComplete: boolean }    // 完成标记
  | { type: 'error'; message: string }       // 错误
```

## 🤖 Agents

| Agent | 模型 | 功能 |
|-------|------|------|
| **OmniDialogueAgent** | `qwen3-omni-flash` | 英语对话 + 语音合成（端到端） |
| **TranslationAgent** | `qwen-turbo` | 英文翻译成中文（低延迟） |
| **ScoringAgent** | `qwen-plus` | 对话评分（词汇/语法/沟通/努力） |

## 📡 API 端点

### 流式工作流 (推荐)

```http
POST /api/agent/workflow/stream
Content-Type: application/json

{
  "sceneId": "scene_001",
  "sceneName": "Morning Greeting",
  "sceneDescription": "Practice daily greetings",
  "vocabulary": ["hello", "good morning", "how are you"],
  "currentRound": 1,
  "totalRounds": 5,
  "history": [],
  "studentMessage": "Hello teacher!"  // 开场白时可省略
}

Response: text/event-stream
data: {"type":"text","content":"Hi"}
data: {"type":"text","content":" there"}
data: {"type":"text","content":"!"}
data: {"type":"translation","content":"你好！"}
data: {"type":"audio","content":"UklGR..."}  // WAV base64
data: {"type":"scores","content":{...}}      // 仅第5轮
data: {"type":"done","isComplete":false}
```

### 非流式工作流 (LangGraph)

```http
POST /api/agent/workflow
```

使用 LangGraph StateGraph 编排，适合需要完整结果的场景。

### 其他端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/agent/chat` | POST | 纯文本对话 |
| `/api/agent/chat/audio` | POST | 音频对话（非流式） |
| `/api/agent/chat/audio/stream` | POST | 音频对话（流式 SSE） |
| `/api/agent/evaluate` | POST | 对话评分 |
| `/api/agent/health` | GET | 健康检查 |

## 🚀 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 类型检查
pnpm typecheck
```

## 🔧 环境变量

```env
# .env
OPENAI_API_KEY=sk-xxx          # Dashscope API Key
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
PORT=3002
```

## 📂 目录结构

```
agent/
├── src/
│   ├── agents/
│   │   ├── omni-dialogue.agent.ts   # 多模态对话 Agent
│   │   ├── translation.agent.ts     # 翻译 Agent
│   │   ├── scoring.agent.ts         # 评分 Agent
│   │   └── dialogue.agent.ts        # 纯文本对话 Agent
│   ├── workflows/
│   │   └── dialogue-workflow.ts     # LangGraph 工作流定义
│   ├── routes/
│   │   └── dialogue.routes.ts       # API 路由
│   ├── types/
│   │   └── index.ts                 # 类型定义
│   ├── config.ts                    # 配置
│   └── index.ts                     # 入口
├── package.json
└── README.md
```

## 🎯 核心特性

1. **流式响应**: 使用 SSE (Server-Sent Events) 实现文字逐字显示
2. **多模态**: 支持文字输入和语音输入，返回文字+语音
3. **自动翻译**: 每轮对话自动翻译成中文辅助理解
4. **自动评分**: 5 轮对话后自动触发评分（100 分制）
5. **角色扮演**: AI 扮演 "Teacher Lily" 英语老师
6. **开场白生成**: AI 自动生成开场白 + 音频 + 翻译

## 🔄 数据流

```
Frontend                    Backend                     Agent
   │                           │                           │
   │  POST /start/stream       │                           │
   │ ─────────────────────────>│  POST /workflow/stream    │
   │                           │ ─────────────────────────>│
   │                           │                           │
   │                           │  SSE: text chunks         │
   │  SSE: text chunks         │<─────────────────────────│
   │<──────────────────────────│                           │
   │  (逐字显示)                │                           │
   │                           │  SSE: translation         │
   │  SSE: translation         │<─────────────────────────│
   │<──────────────────────────│                           │
   │  (显示翻译)                │                           │
   │                           │  SSE: audio               │
   │  SSE: audio               │<─────────────────────────│
   │<──────────────────────────│                           │
   │  (播放音频)                │                           │
   │                           │  SSE: done                │
   │  SSE: done                │<─────────────────────────│
   │<──────────────────────────│                           │
   │  (更新状态)                │                           │
   └                           └                           └
```

