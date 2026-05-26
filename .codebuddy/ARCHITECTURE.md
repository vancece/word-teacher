# 系统架构

## 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│  学生端 Frontend (React + Vite)                     :5174        │
│  ├── 场景选择页                                                  │
│  ├── AI 对话页 (音频录制/播放、流式文本)                          │
│  ├── 跟读评测页 (录音 → 词级评分 → 颜色映射)                     │
│  └── 评分结果页 (4维度雷达图 + AI 评语)                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP (axios)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend (Express + Prisma + MySQL)                 :3001        │
│  ├── /api/auth/*           认证 (JWT)                           │
│  ├── /api/scenes/*         场景 CRUD                            │
│  ├── /api/dialogue/*       对话代理 → Agent                     │
│  ├── /api/read-aloud/*     跟读代理 → Agent + 数据持久化         │
│  └── /api/admin/*          管理后台接口                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP (fetch, X-Agent-Api-Key)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Agent Service (Express + LangChain)                :8000        │
│  ├── routes/                                                     │
│  │   ├── dialogue.routes.ts        对话路由                      │
│  │   ├── read-aloud.routes.ts      跟读评测路由                  │
│  │   ├── scene-supplement.routes.ts 场景补充路由                  │
│  │   └── summary.routes.ts         总结路由                      │
│  ├── agents/                                                     │
│  │   ├── omni-dialogue.agent.ts    多模态对话 (Qwen-Omni)       │
│  │   ├── read-aloud.agent.ts       跟读评测 (SOE优先)           │
│  │   ├── read-aloud-scoring.agent.ts 跟读总评 (AI)              │
│  │   ├── scoring.agent.ts          对话评分                      │
│  │   └── summary.agent.ts          对话总结                      │
│  ├── services/                                                   │
│  │   ├── tencent-soe.service.ts    腾讯云口语评测                │
│  │   ├── aliyun-stt.service.ts     阿里云一句话识别              │
│  │   └── asr.service.ts            Qwen ASR                     │
│  └── workflows/                                                  │
│      └── dialogue-workflow.ts      LangGraph 对话流程            │
└──────────────┬────────────────────────────┬─────────────────────┘
               │                            │
               ▼                            ▼
┌──────────────────────────┐  ┌──────────────────────────────────┐
│  腾讯云 SOE               │  │  阿里云 Dashscope                 │
│  soe.tencentcloudapi.com  │  │  dashscope.aliyuncs.com          │
│                           │  │                                   │
│  TransmitOralProcess      │  │  - Qwen-Omni (多模态对话)        │
│  WithInit                 │  │  - Qwen-Plus (评分/总评)          │
│  (HTTP REST, 一次性评测)   │  │  - 一句话识别 STT (fallback)     │
└───────────────────────────┘  └───────────────────────────────────┘
```

## 数据流

### AI 对话流程

```
1. 用户录音 → audioBase64
2. Frontend POST /api/dialogue/stream (SSE)
3. Backend 代理 → Agent /dialogue/stream
4. Agent: Qwen-Omni (音频输入 → 文本+音频输出)
5. SSE 流式返回: text chunks + audio base64
6. Frontend: 实时显示文字 + 播放音频
```

### 跟读评测流程 (SOE 方案)

```
1. 用户对着目标句朗读 → WAV 16kHz
2. Frontend POST /api/read-aloud/evaluate
3. Backend 代理 → Agent /read-aloud/evaluate
4. Agent:
   a. 调用 tencentSoeService.evaluate(refText, audioBase64)
   b. SOE 返回: PronAccuracy, Words[{MatchTag, PhoneInfos}]
   c. 格式化为 ReadAloudResult
5. 返回前端: 词级分数 + 颜色映射
6. 所有句子完成后 → POST /api/read-aloud/score
7. Agent: 汇总 SOE 数据 → AI 生成个性化总评
```

## 数据库模型 (Prisma)

关键 model:
- `Student` - 学生账号
- `Scene` - 对话/跟读场景
- `DialogueRecord` - 对话练习记录
- `ReadAloudRecord` - 跟读练习记录
- `ReadAloudScene` - 跟读场景(含句子)

## Agent 模型选择策略

| 任务类型 | 模型 | 原因 |
|---------|------|------|
| 多模态对话 | qwen-omni-turbo | 需要音频 I/O |
| 跟读评测 | 腾讯云 SOE | 声学级精度,不需要 LLM |
| 总评/评分 | qwen-plus | 需要高质量文本生成 |
| 翻译/简单生成 | qwen-plus | 速度+质量平衡 |

## 认证机制

```
Frontend → Backend: JWT token (cookie/header)
Backend → Agent: X-Agent-Api-Key (服务间密钥)
Agent → 腾讯云: SecretId + SecretKey (云 API 签名)
Agent → 阿里云: API Key (Bearer token)
```
