# AI 助手技术方案（钉钉机器人 + Admin 后台）

## 一、需求背景

部分老师（技术能力较弱）在使用管理后台时遇到困难：
- 不知道怎么筛选学生、创建场景、管理词包
- 不理解数据指标的含义
- 操作步骤记不住

## 二、方案概述

提供两个入口，共享同一套知识库和 AI 回答能力：

1. **钉钉机器人客服**（主入口）— 老师在钉钉群/私聊中 @机器人 提问，零门槛
2. **Admin 后台 AI 客服页面**（辅助入口）— 登录后台后在线问答，同时可查看对话历史

## 三、整体架构

```
┌──────────────┐         ┌──────────────┐
│  钉钉群/私聊  │         │  Admin 后台   │
│  @AI助手      │         │  AI客服页面   │
└──────┬───────┘         └──────┬───────┘
       │ Webhook POST            │ SSE 流式
       ▼                        ▼
┌─────────────────────────────────────────┐
│           Backend (Express)              │
│                                          │
│  POST /api/dingtalk-bot/webhook ← 钉钉  │
│  POST /api/admin/assistant/chat ← 后台  │
│  GET  /api/admin/assistant/history      │
│                                          │
└──────────────────┬──────────────────────┘
                   │ HTTP 调用 Agent
                   ▼
┌─────────────────────────────────────────┐
│           Agent 服务                      │
│                                          │
│  POST /api/agent/assistant/chat          │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │       Assistant Agent (Qwen-Plus)   │ │
│  │  - System Prompt (产品客服角色)      │ │
│  │  - 知识库上下文注入                  │ │
│  │  - 对话历史维护                      │ │
│  └──────────────┬──────────────────────┘ │
│                 │                         │
│                 ▼                         │
│  ┌─────────────────────────────────────┐ │
│  │  知识检索 (MySQL 关键词 + 分类匹配)  │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## 四、钉钉机器人

### 4.1 创建方式

- 在钉钉开放平台创建**企业内部应用** → 添加机器人能力
- 配置消息接收地址（HTTP POST）：`https://域名/api/dingtalk-bot/webhook`
- 配置签名校验 Token + 加签密钥（AES Key）
- 这是一个**全新的机器人**，与原有的通知机器人独立

### 4.2 工作流程

1. 老师在群里 @AI助手 或私聊发消息
2. 钉钉服务器 POST 到我们的 Webhook 端点
3. 后端验证签名 → 解析消息 → 调 Agent 服务
4. Agent 基于知识库生成回答
5. 后端通过钉钉 API 回复（支持 Markdown 富文本）
6. 记录对话到数据库

### 4.3 环境变量

```env
# 新的 AI 客服钉钉机器人（与通知机器人独立）
DINGTALK_BOT_APP_KEY=xxx
DINGTALK_BOT_APP_SECRET=xxx
DINGTALK_BOT_TOKEN=xxx        # Webhook 验证 Token
DINGTALK_BOT_AES_KEY=xxx      # 消息加解密密钥
```

## 五、Admin 后台 AI 客服页面

### 5.1 功能

- 在线对话界面（SSE 流式响应）
- 对话历史列表
- 快捷问题推荐（根据页面动态显示）
- 管理员可查看所有老师的提问记录（发现高频问题 → 补充知识库）

### 5.2 路由

Admin 前端新增页面：`/assistant`

## 六、数据模型

知识库完全使用 LanceDB 向量数据库（不依赖 MySQL），数据目录：`backend/data/lancedb/knowledge.lance/`

每条知识条目包含：`id`, `category`, `title`, `content`, `keywords`, `text`(embedding 拼接文本), `vector`(1024维向量)

```prisma
// 对话记录（仅对话记录存 MySQL）
model AssistantConversation {
  id         Int      @id @default(autoincrement())
  teacherId  Int?     @map("teacher_id")     // 关联老师（后台渠道时有值）
  channel    String   @db.VarChar(20)        // "dingtalk" | "admin_web"
  externalId String?  @map("external_id") @db.VarChar(100) // 钉钉 staffId
  title      String?  @db.VarChar(200)       // 对话标题（取第一条问题）
  messages   Json                            // [{role, content, timestamp}]
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  teacher Teacher? @relation(fields: [teacherId], references: [id], onDelete: SetNull)

  @@index([teacherId])
  @@index([channel])
  @@index([createdAt])
  @@map("assistant_conversations")
}
```

## 七、知识库方案

### Phase 1（MVP）：MySQL 关键词匹配，不需要向量数据库

**理由**：
- 知识库规模小（30~80 条操作指引），全部灌进 Qwen 的 context window（128K）绰绰有余
- 内容结构化程度高，关键词匹配已经足够
- 零额外基础设施，复用现有 MySQL

**检索策略**：
1. 从用户问题中提取关键词
2. MySQL LIKE + category 匹配，取相关条目
3. 如果条目少于 15 条，全部注入 system prompt
4. LLM 基于知识库内容回答

### Phase 2（未来按需升级）：Qdrant 向量数据库

当知识库超过 200 条或需要模糊语义检索时：
- Docker Compose 加 Qdrant 容器
- 使用阿里云 text-embedding-v3 做 Embedding
- LangChain QdrantVectorStore 集成

## 八、知识库内容规划

| 分类 | 示例条目 | 优先级 |
|------|---------|--------|
| 学生管理 | 怎么筛选学生 / 怎么导入学生 / 怎么重置密码 | P0 |
| 班级管理 | 怎么创建班级 / 怎么分配老师 | P0 |
| 场景管理 | 怎么创建对话场景 / 怎么设置难度和轮次 | P0 |
| 词包管理 | 怎么导入单词 / 怎么给游戏分配词包 | P1 |
| 数据查看 | 怎么看学习进度 / 数据面板各指标含义 | P1 |
| 跟读管理 | 怎么创建跟读场景 / 评分标准是什么 | P1 |
| 常见问题 | 学生忘记密码 / 录音没评分 / 封面图怎么换 | P2 |

## 九、API 设计

### Agent 服务

```
POST /api/agent/assistant/chat
Body: { question: string, history?: {role, content}[], channel: string }
Response: 流式 SSE 或 JSON { answer: string }
```

### Backend

```
POST /api/dingtalk-bot/webhook          — 钉钉消息回调（无需认证）
POST /api/admin/assistant/chat          — 后台 AI 问答（教师认证）
GET  /api/admin/assistant/conversations — 对话历史列表
GET  /api/admin/assistant/conversations/:id — 单个对话详情
POST /api/admin/assistant/knowledge     — 新增知识条目（管理员）
GET  /api/admin/assistant/knowledge     — 知识库列表
PUT  /api/admin/assistant/knowledge/:id — 更新知识条目
DELETE /api/admin/assistant/knowledge/:id — 删除知识条目
```

## 十、工作量估算

| 模块 | 工时 |
|------|------|
| Prisma schema + migration | 0.5h |
| Agent assistant 模块 (RAG + Qwen) | 3h |
| Backend 钉钉 Webhook 路由 | 3h |
| Backend Admin 助手 API (chat + knowledge CRUD) | 2h |
| Admin 前端 AI 客服对话页 | 3h |
| Admin 前端知识库管理页 | 3h |
| 知识库内容编写 (30~50条) | 4h |
| **总计** | **~18h** |

## 十一、实施顺序

1. 数据库表（Prisma schema + migrate）
2. Agent assistant 模块（核心 AI 能力）
3. Backend assistant API（Admin 后台 + 知识库 CRUD）
4. Admin 前端 AI 客服页 + 知识库管理页
5. Backend 钉钉机器人 Webhook
6. 知识库内容编写
7. 联调测试
