# 讯飞语音评测 — 篇章拼接方案（省额度）

## 背景

当前朗读评测流程是**逐句调用**讯飞 ISE：学生每读一句话就发起一次 WebSocket 评测请求。一篇课文 10 句话消耗 10 次额度。

讯飞计费规则：**一次 API 调用 = 一次额度**，无论是 `read_word`、`read_sentence` 还是 `read_chapter`，都算一次。

**核心发现：`read_chapter`（篇章模式）支持一次提交多句，返回每句独立评分，仍只算一次调用。**

## 目标

- 将 5-10 句拼接为一次篇章评测，额度消耗降低 **80-90%**
- 保持每句独立评分的精度
- 前端体验尽量不变（或可接受的微调）

## 约束条件（讯飞篇章模式限制）

| 限制项 | 值 |
|--------|-----|
| 英文篇章总单词数 | ≤ 1000 个 |
| 每句单词数 | ≤ 100 个 |
| 每句字节数 | ≤ 1024 字节 |
| 分句符号 | `. ! ? ;`（英文半角） |
| 文本首行 | 必须以 `[content]` 开头 |
| 音频时长 | 建议 ≤ 60 秒（超长响应慢） |

小学生句子通常 5-15 个单词，10 句也就 50-150 个单词，远低于限制。

## 架构设计

### 当前流程（逐句）

```
学生读第1句 → 录音 → 调 ISE → 返回分数 → 显示 → 下一句
学生读第2句 → 录音 → 调 ISE → 返回分数 → 显示 → 下一句
...
学生读第N句 → 录音 → 调 ISE → 返回分数 → 显示 → 完成
```
**N 句 = N 次调用**

### 新流程（篇章拼接）

```
学生读第1句 → 录音缓存到内存
学生读第2句 → 录音缓存到内存
...
学生读第N句 → 录音缓存到内存
                    ↓
全部读完 → 拼接音频 + 拼接文本 → 调 ISE（read_chapter）→ 1 次调用
                    ↓
解析结果 → 按 sentence 拆分 → 分发每句评分 → 显示评分页
```
**N 句 = 1 次调用**

### 折中流程（分批 + 即时反馈）

如果需要保留一定的即时反馈感，可以分批：

```
学生读第1-5句 → 逐句缓存录音（前端不阻塞，继续下一句）
第5句读完 → 后台拼接提交第一批 → 异步返回 1-5 句评分
学生读第6-10句 → 逐句缓存
第10句读完 → 后台拼接提交第二批 → 异步返回 6-10 句评分
```
**10 句 = 2 次调用（省 80%）**

## 技术实现

### 1. 音频拼接（Agent 层）

```typescript
// agent/src/services/audio-concat.service.ts

/**
 * 拼接多段 16kHz 16bit PCM 音频
 * 在每段之间插入静音间隔
 */
function concatPcmAudio(
  audioBuffers: Buffer[],
  silenceDurationMs: number = 500
): Buffer {
  const SAMPLE_RATE = 16000
  const BYTES_PER_SAMPLE = 2
  const silenceBytes = Math.floor(SAMPLE_RATE * BYTES_PER_SAMPLE * silenceDurationMs / 1000)
  const silenceBuffer = Buffer.alloc(silenceBytes, 0) // 全零 = 静音

  const parts: Buffer[] = []
  for (let i = 0; i < audioBuffers.length; i++) {
    parts.push(audioBuffers[i])
    if (i < audioBuffers.length - 1) {
      parts.push(silenceBuffer)
    }
  }
  return Buffer.concat(parts)
}
```

**要点：**
- 前端传来的是 WAV（Base64），后端剥离 44 字节头得到 PCM
- 拼接时在句间插入 500ms 静音，帮助讯飞正确分句
- 最终合成一整段 PCM 发送

### 2. 文本拼接

```typescript
/**
 * 将多句文本拼接为 read_chapter 格式
 * 确保每句末尾有分句符号（. ! ?）
 */
function formatChapterText(sentences: string[]): string {
  const bom = '\uFEFF'
  const normalized = sentences.map(s => {
    const trimmed = s.trim()
    // 确保句尾有分句符号
    if (!/[.!?;]$/.test(trimmed)) {
      return trimmed + '.'
    }
    return trimmed
  })
  return `${bom}[content]\n${normalized.join(' ')}`
}
```

### 3. 结果拆分

讯飞 `read_chapter` 返回的 XML 中，每个 `<sentence>` 节点有独立评分：

```xml
<read_chapter ...  total_score="85.2">
  <sentence total_score="90.1" accuracy_score="88" fluency_score="92">
    <word content="Hello" total_score="95" />
    <word content="world" total_score="85" />
  </sentence>
  <sentence total_score="80.3" accuracy_score="78" fluency_score="82">
    ...
  </sentence>
</read_chapter>
```

按 `<sentence>` 索引对应回原始句子即可。

### 4. API 接口变更

#### 新增批量评测接口

```
POST /api/agent/read-aloud/evaluate-batch
```

**请求体：**
```json
{
  "sentences": [
    { "text": "Hello, how are you?", "audioBase64": "UklGR..." },
    { "text": "I am fine, thank you.", "audioBase64": "UklGR..." },
    ...
  ]
}
```

**响应体：**
```json
{
  "results": [
    { "words": [...], "accuracy": 88, "fluency": 90, "completeness": 100, "suggestedScore": 89 },
    { "words": [...], "accuracy": 82, "fluency": 85, "completeness": 100, "suggestedScore": 83 },
    ...
  ]
}
```

#### 保留原有单句接口（兼容 & 降级）

原有 `POST /api/agent/read-aloud/evaluate` 保持不变，作为降级方案。

### 5. 前端改动

#### 方案 A：全部读完再评测（最省额度）

```
录音阶段：学生逐句朗读，每句录音缓存在前端内存
          前端显示"正在录音..."状态，不显示分数
          读完一句自动翻到下一句

评测阶段：全部读完后，一次性提交所有录音
          调用 /evaluate-batch
          拿到所有分数后跳转到结果页
```

**优点：** 最省额度（N 句 = 1 次）
**缺点：** 读的过程中没有即时反馈

#### 方案 B：分批评测（推荐）

```
每 5 句为一批：
  - 学生读 1-5 句时，逐句缓存录音
  - 第 5 句录完后，后台静默提交评测
  - 学生继续读 6-10 句（不等结果）
  - 第 5 句的评分可以在读后续句子时异步显示

全部读完后：
  - 等待所有批次评测返回
  - 跳转结果页
```

**优点：** 有一定实时性，省 80% 额度
**缺点：** 前端状态管理更复杂

#### 方案 C：读完即评 + 篇章模式（最简改动）

```
流程不变，学生仍然逐句读
但不再逐句提交评测
全部读完后，统一拼接提交 read_chapter
结果页展示每句分数
```

和方案 A 类似，但 UI 流程完全不变（仍是逐句翻页），只是分数展示推迟到最后。

**这个改动最小，前端只需要：**
1. 去掉每句读完后等待评测结果的逻辑
2. 录音 buffer 存在状态里
3. 最后一句读完时批量提交

## 推荐方案

**方案 C（读完即评 + 篇章模式）**

理由：
1. 前端改动最小 — 只改提交时机和结果展示
2. 后端改动集中 — 新增一个 batch 接口 + 音频拼接逻辑
3. 额度省最多 — 一篇课文 1 次调用
4. 体验可接受 — 小学生读完一篇课文本来就要看总分页，提前几秒还是延后几秒看分数区别不大

## 降级策略

- 如果拼接后音频超过 60 秒（时长限制），自动拆分为 2 批
- 如果篇章评测失败（网络等原因），降级为逐句评测
- 后端加配置开关 `ISE_BATCH_ENABLED=true/false`，可随时回退

## 文件改动清单

### Agent（后端）

| 文件 | 改动 |
|------|------|
| `agent/src/services/xfyun-ise.service.ts` | 新增 `evaluateChapter(sentences, audioBuffers)` 方法 |
| `agent/src/services/audio-concat.service.ts` | **新建** — PCM 音频拼接工具 |
| `agent/src/agents/read-aloud.agent.ts` | 新增 `evaluateBatch()` 方法 |
| `agent/src/routes/read-aloud.routes.ts` | 新增 `POST /evaluate-batch` 路由 |

### Frontend（前端）

| 文件 | 改动 |
|------|------|
| `frontend/src/pages/ReadAloudPage.tsx` | 缓存每句录音，最后统一提交 |
| `frontend/src/api/read-aloud.ts` | 新增 `readAloudApi.evaluateBatch()` |
| `frontend/src/hooks/useAudioRecorder.ts` | 录音完成后返回 buffer 而非立即上传 |

### 配置

| 文件 | 改动 |
|------|------|
| `agent/src/config.ts` | 新增 `ISE_BATCH_ENABLED` 环境变量 |

## TODO List

- [ ] **T1** 新建 `audio-concat.service.ts` — PCM 拼接 + 静音填充
- [ ] **T2** `xfyun-ise.service.ts` 新增 `evaluateChapter()` — 用 `read_chapter` category 调用
- [ ] **T3** 解析 `read_chapter` XML 结果，按 `<sentence>` 拆分为数组
- [ ] **T4** `read-aloud.agent.ts` 新增 `evaluateBatch()` — 接收多句音频，调用拼接+评测
- [ ] **T5** `read-aloud.routes.ts` 新增 `POST /evaluate-batch` 路由
- [ ] **T6** 前端 `ReadAloudPage.tsx` — 每句录音缓存到 state，去掉逐句等待评测
- [ ] **T7** 前端 `read-aloud.ts` — 新增 `evaluateBatch()` API 方法
- [ ] **T8** 前端 — 最后一句读完后统一提交，等待结果后跳转评分页
- [ ] **T9** 自动拆批逻辑 — 音频超 60s 时自动拆为多批
- [ ] **T10** 降级逻辑 — batch 失败时 fallback 到逐句评测
- [ ] **T11** 配置开关 `ISE_BATCH_ENABLED` + 环境变量
- [ ] **T12** 本地联调测试 — 录 5 句验证拼接评测结果正确性
- [ ] **T13** 分数微调逻辑适配 — 确保 batch 结果也经过分数微调

## 风险点

1. **句间对齐**：讯飞按 `. ! ? ;` 分句，如果学生漏读/多读某句，句子索引可能错位
   - 应对：对比讯飞返回的句子数和提交的句子数，不匹配时降级为逐句
2. **录音质量差**：某句录音静音/噪音，拼接后可能影响后续句子评分
   - 应对：前端录音时做静音检测，静音段标记为 skip
3. **总时长过长**：学生读得慢，10 句可能超 60 秒
   - 应对：按时长自动拆批（每批 ≤ 50s）

## 预期效果

| 指标 | 当前 | 优化后 |
|------|------|--------|
| 10 句课文消耗 | 10 次 | 1 次 |
| 日均消耗（50-100 次/天） | 50-100 次 | 5-15 次 |
| 免费额度（500次/天）可支撑学生数 | ~5-10 人 | ~50-100 人 |
| 20 万次套餐可用天数 | ~2000-4000 天 | ~13000-40000 天 |
