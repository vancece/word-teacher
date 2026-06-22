# AI 助手实施 TODO

## Phase 1: 数据库

- [x] Prisma schema 新增 AssistantConversation 模型（知识库已迁移到 LanceDB，不再存 MySQL）
- [x] Teacher 模型添加 conversations 关联
- [ ] 部署时自动执行 prisma db push（已有流水线支持）

## Phase 2: Agent 服务

- [x] 新增 `agent/src/agents/assistant.agent.ts` — OpenAI 原生 SDK + Function Calling
  - [x] AI 自主决定何时搜索知识库（tool calling）
  - [x] 操作类问题 → AI 调 tool → 搜索知识库 → 注入 context → 生成回答
  - [x] 闲聊/打招呼 → AI 不调 tool，直接回复，省 token
  - [x] 非流式 `chat()` + 流式 `chatStream()` (AsyncGenerator)
  - [x] 本地测试通过（Qwen-Plus function calling 参数正确传递）
- [x] 新增 `agent/src/routes/assistant.routes.ts` — 路由（适配 AsyncGenerator）
- [x] 注册路由到 `agent/src/index.ts`
- [x] 安装 openai + zod 依赖

## Phase 3: Backend API

- [x] 新增 `backend/src/routes/admin/assistant.routes.ts`
  - [x] GET /knowledge/search — Agent 回调的知识搜索接口（向量搜索）
  - [x] POST /chat — SSE 流式对话
  - [x] GET /conversations — 对话历史列表
  - [x] CRUD /knowledge — 知识库管理
  - [x] POST /test — 检索测试
  - [x] POST /knowledge/sync-vectors — 全量重建向量索引
  - [x] GET /knowledge/vector-status — 索引状态查询
- [x] 新增 `backend/src/routes/dingtalk-bot.routes.ts` — 钉钉 Webhook
- [x] 新增 `backend/src/services/dingtalk-bot.service.ts` — 钉钉机器人服务
- [x] 注册路由到 backend
- [x] 超时配置

## Phase 4: 向量搜索

- [x] 新增 `backend/src/services/knowledge-vector.service.ts` — LanceDB 向量搜索服务
  - [x] DashScope text-embedding-v3 生成向量
  - [x] LanceDB 嵌入式向量数据库（零额外服务）
  - [x] 搜索：纯 LanceDB 向量搜索（已移除 MySQL 兜底）
  - [x] 增删改自动同步向量索引
  - [x] 全量重建接口
- [x] backend 依赖：`@lancedb/lancedb` + `openai` + `apache-arrow@18`
- [x] Docker 部署：volume 持久化 `./data/lancedb`
- [x] 本地测试通过（7/7 语义搜索 case 全通过）

## Phase 5: Admin 前端

- [x] 新增 `admin/src/pages/AssistantPage.tsx` — AI 客服对话页面（SSE 流式）
- [x] 新增 `admin/src/pages/AssistantPage.scss`
- [x] ~~新增 `admin/src/pages/KnowledgePage.tsx`~~ — 已移除，知识库管理改为直接操作 LanceDB
- [x] 注册路由 + 菜单入口（含权限过滤）

## Phase 6: 知识库内容

知识库完全使用 LanceDB 向量数据库，通过 `knowledgeVectorService.syncAll()` 或 `upsertItem()` 直接写入。

- [x] 初始知识库已通过 LanceDB 导入（20 条，覆盖学生管理、班级管理、场景管理、词包管理、数据查看、常见问题、平台介绍等）
- [ ] 根据使用反馈持续补充

## Phase 7: 钉钉配置（需手动操作）

- [ ] 钉钉开放平台创建企业内部应用 + 机器人能力
- [ ] 配置 Webhook 地址：`https://域名/api/dingtalk-bot/webhook`
- [ ] 获取凭证，配环境变量到 docker-compose:
  ```
  DINGTALK_BOT_APP_KEY=xxx
  DINGTALK_BOT_APP_SECRET=xxx
  ```
- [ ] 联调测试

## Phase 8: 环境变量与文档

- [x] 更新 `backend/.env.example` — 补充 AI_API_KEY、LanceDB、钉钉机器人变量
- [x] 更新 `README.md` — 环境变量配置表格、GitHub Actions Secrets 表格
- [ ] 更新 `deploy/DEPLOYMENT.md` — 补充 LanceDB 部署说明
- [ ] 更新 `QUICK_START.md` — 补充 AI_API_KEY 配置说明

## Phase 9: E2E 测试 & Skill

- [ ] 写一个 CodeBuddy Skill：用于自动化端到端测试整个 AI 助手链路
- [ ] 集成浏览器自动化测试工具（见下方选型）

### 浏览器自动化测试工具选型

| 工具 | 类型 | 优势 | 适合场景 |
|------|------|------|---------|
| **Playwright MCP** | MCP Server | 最推荐，Playwright 官方出品 | 完整 E2E 流程测试 |
| **chrome-devtools MCP** | MCP Server | 直接操作 Chrome DevTools Protocol | 调试、性能分析 |

## 技术决策记录

### 方案演进

1. ~~预注入全部知识到 prompt~~ → token 浪费
2. ~~Vercel AI SDK + Tool Calling~~ → Qwen 不兼容（params 为空 `{}`，multi-step 不工作）
3. ~~Smart RAG 关键词意图判断~~ → 不够灵活
4. **✅ OpenAI 原生 SDK + Function Calling** → 最终方案，AI 自主决策

### 搜索方案演进

1. ~~MySQL LIKE 关键词搜索~~ → 语义不匹配问题（"孩子们学习情况" 匹配不到 "查看学习进度"）
2. **✅ LanceDB 纯向量搜索** → 语义匹配，零额外服务，已移除 MySQL 兜底

### 省 token 效果
- 打招呼/闲聊：AI 不调 tool，只消耗 system prompt ~300 token
- 操作类问题：AI 调 tool → 搜索 → 只注入 top 5 匹配结果 ~500 token
- 对比旧方案：每次全量注入知识库 ~3000+ token

## 文件清单

```
新增文件：
├── agent/src/agents/assistant.agent.ts       (OpenAI SDK + Function Calling)
├── agent/src/routes/assistant.routes.ts      (AsyncGenerator 流式路由)
├── backend/src/routes/admin/assistant.routes.ts  (向量搜索 + CRUD)
├── backend/src/routes/dingtalk-bot.routes.ts
├── backend/src/services/dingtalk-bot.service.ts
├── backend/src/services/knowledge-vector.service.ts  (LanceDB 向量服务)
├── admin/src/pages/AssistantPage.tsx
├── admin/src/pages/AssistantPage.scss
└── docs/tech-proposals/ai-assistant.md

修改文件：
├── backend/.env.example                     (新增 AI/LanceDB/钉钉变量)
├── backend/prisma/schema.prisma             (新增 AssistantConversation model)
├── backend/src/app.ts                       (超时配置)
├── backend/src/routes/index.ts              (注册钉钉路由)
├── backend/src/routes/admin/index.ts        (注册 assistant 路由)
├── backend/package.json                     (新增 lancedb/openai/arrow)
├── backend/.gitignore                       (忽略 data/)
├── agent/src/index.ts                       (注册 assistant 路由)
├── agent/package.json                       (新增 openai/zod)
├── admin/src/App.tsx                        (注册前端路由)
├── admin/src/components/Layout.tsx          (菜单入口)
├── docker-compose.prod.yml                  (LanceDB volume + 环境变量)
├── Dockerfile.backend                       (data 目录)
└── README.md                                (环境变量文档更新)
```
