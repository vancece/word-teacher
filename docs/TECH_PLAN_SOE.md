# 跟读评测技术方案：接入腾讯云智聆口语评测 (SOE) + AI 总评

## 一、方案概述

**核心改动**：将跟读评测从"STT 转文字 → 文本对比"改为"腾讯云 SOE 声学级评测 → AI 生成个性化评语"两阶段架构。

### 新旧方案对比

| | 旧方案 | 新方案 |
|--|--|--|
| 单词评测 | Qwen-Omni/阿里云 STT → 文本逐词对比 | 腾讯云 SOE 声学级 GOP 评分 |
| 评测粒度 | 词级（对/错） | 音素级（每个音发得准不准） |
| 纠错能力 | 只能判对错 | 漏读/多读/错读/重复 全覆盖 |
| 总评 | AI 只看"哪些词对了错了" | AI 获得完整声学数据后给出专业评语 |
| 延迟 | 2-5 秒（大模型推理） | < 1 秒（SOE） + 1-2 秒（AI 总评） |
| 成本 | ~0.01 元/次（Qwen-Omni） | ~0.001 元/次（SOE）+ AI 仅总评时调用 |

---

## 二、系统架构

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React)                                        │
│  - 录音 (WAV 16kHz 16bit mono)                           │
│  - 逐句展示 SOE 评分 + 词级高亮                           │
│  - 总评展示 (AI 生成的个性化评语)                          │
└────────────┬───────────────────────────────┬─────────────┘
             │ 每句录完                       │ 全部完成
             ▼                               ▼
┌────────────────────────┐     ┌──────────────────────────┐
│  Backend (Express)      │     │  Backend                  │
│  POST /api/read-aloud   │     │  POST /api/read-aloud     │
│       /evaluate         │     │       /score              │
└────────────┬────────────┘     └────────────┬─────────────┘
             │                               │
             ▼                               ▼
┌────────────────────────┐     ┌──────────────────────────┐
│  Agent: SOE Service     │     │  Agent: AI Scoring        │
│  - 调用腾讯云 SOE API   │     │  - 汇总所有句子的 SOE 数据│
│  - 返回词级/音素级评分   │     │  - 喂给 AI 生成总评       │
└─────────────────────────┘     └──────────────────────────┘
             │                               │
             ▼                               ▼
┌─────────────────────────┐     ┌──────────────────────────┐
│  腾讯云 SOE API          │     │  Qwen-Plus               │
│  TransmitOralProcess     │     │  只做总评（不做识别）      │
│  WithInit                │     │                          │
└──────────────────────────┘     └──────────────────────────┘
```

---

## 三、腾讯云 SOE 接入详情

### 3.1 API 选择

使用 `TransmitOralProcessWithInit` 接口（一次调用完成初始化 + 评测）。

### 3.2 关键参数

```typescript
{
  SeqId: 1,
  IsEnd: 1,                    // 一次性传完
  VoiceFileType: 3,            // wav
  VoiceEncodeType: 1,          // pcm
  UserVoiceData: audioBase64,  // 前端录音 base64
  SessionId: uuid,             // 唯一标识
  RefText: "Good morning",     // 参考文本（原句）
  WorkMode: 1,                 // 1=一次性评测（录完再评）
  EvalMode: 1,                 // 0=单词, 1=句子, 2=段落, 4=单词纠错
  ScoreCoeff: 1.0,             // 评分难度系数（1.0=标准，<1更宽松）
  ServerType: 0,               // 0=英文, 1=中文
}
```

### 3.3 返回结果结构

```typescript
interface SOEResult {
  // 整句维度
  PronAccuracy: number       // 准确度 [0-100]
  PronFluency: number        // 流利度 [0-1]
  PronCompletion: number     // 完整度 [0-1]
  SuggestScore: number       // 建议评分 [0-100]

  // 词级维度
  Words: Array<{
    Word: string             // 单词
    PronAccuracy: number     // 该词准确度
    PronFluency: number      // 该词流利度
    RealWord: string         // 实际识别的词
    MatchTag: number         // 0=正确 1=多读 2=漏读 3=错读
    // 音素级
    PhoneInfos: Array<{
      Phone: string          // 音素
      PronAccuracy: number   // 该音素准确度
      DetectedStress: boolean // 是否为重音
      RLetter: string        // 对应字母
      ReferencePhone: string // 参考音素
    }>
  }>
}
```

### 3.4 认证方式

后端使用 `tencentcloud-sdk-nodejs` 通过 SecretId/SecretKey 直接调用（服务端安全）。

---

## 四、AI 总评设计

### 4.1 触发时机

- **单句评测**：不调用 AI，直接用 SOE 返回的数据展示
- **全场景评测完成**：汇总所有句子的 SOE 数据，调用 AI 生成总评

### 4.2 喂给 AI 的数据

```json
{
  "sceneName": "日常问候",
  "studentName": "张小明",
  "sentences": [
    {
      "text": "Hello!",
      "accuracy": 92,
      "fluency": 0.85,
      "completeness": 1.0,
      "suggestScore": 88,
      "wordDetails": [
        { "word": "Hello", "accuracy": 92, "match": "correct" }
      ]
    },
    {
      "text": "Good morning!",
      "accuracy": 45,
      "fluency": 0.6,
      "completeness": 1.0,
      "suggestScore": 52,
      "wordDetails": [
        { "word": "Good", "accuracy": 78, "match": "correct" },
        { "word": "morning", "accuracy": 32, "match": "mispronounced" }
      ]
    }
  ],
  "overallAccuracy": 68,
  "overallFluency": 0.72
}
```

### 4.3 AI Prompt

```
你是一位温柔鼓励的小学英语老师，正在给学生的跟读练习写评语。

以下是学生的跟读评测数据（由语音评测系统生成）：
{data}

请根据数据给出：
1. totalScore (0-100)：综合评分
2. feedback：2-3句中文评语，具体指出哪些词读得好、哪些需要改进
3. strengths：2个亮点
4. improvements：2个改进建议（具体到哪个词/音）

注意：
- 这是小学生，以鼓励为主
- 评语要具体，不要泛泛而谈（如"morning的/ɔː/发音需要嘴巴张大一点"）
- 如果整体较差，也要找到亮点
```

### 4.4 AI 的作用变化

| | 旧方案 | 新方案 |
|--|--|--|
| 语音识别 | AI 做 | ❌ 不需要 AI |
| 词级评分 | AI 做 | ❌ SOE 做 |
| 总评评语 | AI 基于 "对/错" 猜着写 | ✅ AI 基于精确数据写（准确、具体） |

AI 从"干所有活"变成"只做它最擅长的事：基于数据写出有温度的评语"。

---

## 五、前端改动

### 5.1 单句评测展示（变化）

旧方案：每个词只有 ✅ 正确 / ❌ 错误 两种状态

新方案：
```
Good (92分/绿色) morning (32分/红色 ⚠️发音不准)!
```

- 分数 ≥ 80：绿色
- 分数 60-79：橙色
- 分数 < 60：红色
- MatchTag=2(漏读)：灰色+删除线
- MatchTag=1(多读)：标注"多读"

### 5.2 总评页面

新增音素级详情（可选展开）：
```
morning → /m/ ✅ /ɔː/ ❌(38分) /n/ ✅ /ɪ/ ✅ /ŋ/ ✅
         提示: /ɔː/ 需要嘴巴张大，舌头放低
```

---

## 六、后端改动

### 6.1 新增 SOE Service

```
agent/src/services/tencent-soe.service.ts
```

职责：
- 封装腾讯云 SOE API 调用
- 管理 SecretId/SecretKey
- 格式化返回结果为统一结构

### 6.2 改造 ReadAloudAgent

```diff
- 旧: transcribeAudio() → compareAndScore()
+ 新: evaluateWithSOE() → 直接返回 SOE 结果
```

### 6.3 改造评分 Agent

```diff
- 旧: AI 凭 "哪些词对了" 猜着评分
+ 新: AI 接收 SOE 精确数据，写出针对性评语
```

---

## 七、环境变量新增

```bash
# agent/.env
TENCENT_SECRET_ID=your-secret-id
TENCENT_SECRET_KEY=your-secret-key
```

---

## 八、费用估算

| 场景 | 单价 | 估算 |
|------|------|------|
| SOE 评测 | 0.99 元/千次（优惠包） | 1个学生×5句×每天1次=5次/天，100学生=500次/天≈15元/月 |
| AI 总评 | ~0.002 元/次（Qwen-Plus） | 100学生×1次/天=100次/天≈6元/月 |
| **合计** | | **~21 元/月**（100 学生） |

对比旧方案（每句都调 Qwen-Omni）：100学生×5句×0.01=5元/天=150元/月。新方案省 **85%** 成本。

---

## 九、实施计划

| 阶段 | 工作内容 | 工期 |
|------|---------|------|
| P1 | 接入 SOE：新建 service + 改造 evaluate 接口 | 1 天 |
| P2 | 前端适配：词级评分展示、颜色映射 | 0.5 天 |
| P3 | AI 总评改造：喂 SOE 数据 + 新 prompt | 0.5 天 |
| P4 | 联调 + 测试 | 0.5 天 |
| **合计** | | **2.5 天** |

---

## 十、风险与备案

| 风险 | 应对 |
|------|------|
| 腾讯云 SOE 服务不稳定 | 保留旧方案（阿里云 STT + 文本对比）作为 fallback |
| SOE 对儿童发音评分过严 | 调低 ScoreCoeff（如 0.8），或前端展示时做分数映射 |
| 首单 9.9 元/万次用完 | 提前购买 15 万次套餐（600 元/年），足够 1000 学生用 |
