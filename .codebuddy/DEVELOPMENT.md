# Word Teacher (Echo Kid) 开发指南

## 项目概述

小学英语 AI 家教应用，包含 AI 对话练习和跟读评测两大核心功能。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React + TypeScript + Vite + SCSS |
| 后端 | Express + Prisma + MySQL |
| AI Agent | Express + LangChain + 腾讯云 SOE + 阿里云 Dashscope |
| 管理后台 | React + TypeScript |
| 基础设施 | Docker (MySQL + MinIO)、pnpm workspace monorepo |

## 目录结构

```
word-teacher/
├── frontend/       # 学生端前端 (Vite + React, port 5174)
├── admin/          # 管理后台 (Vite + React, port 5175)
├── backend/        # 后端 API (Express, port 3001)
├── agent/          # AI Agent 服务 (Express, port 8000)
├── docs/           # 技术方案文档
├── scripts/        # 部署脚本
└── deploy/         # 部署配置 (nginx, MySQL)
```

## 本地开发环境启动

### 1. 启动基础设施

```bash
docker compose -f docker-compose.dev.yml up -d
```

启动 MySQL (port 3306, root/root123456) 和 MinIO (port 9000/9001)。

### 2. 数据库同步

```bash
cd backend && npx prisma db push
```

### 3. 启动服务

```bash
# 终端 1 - Backend
cd backend && pnpm dev

# 终端 2 - Agent
cd agent && pnpm dev

# 终端 3 - Frontend
cd frontend && pnpm dev

# 终端 4 - Admin (可选)
cd admin && pnpm dev
```

### 4. 访问地址

- 学生端: http://localhost:5174
- 管理后台: http://localhost:5175
- Backend API: http://localhost:3001/api
- Agent API: http://localhost:8000/api/agent

## 核心服务间调用关系

```
Frontend → Backend (认证 + 代理) → Agent (AI 逻辑)
                                      ↓
                            ┌─────────┴──────────┐
                            │                    │
                     腾讯云 SOE            阿里云 Dashscope
                     (口语评测)           (LLM + STT + TTS)
```

- Frontend 所有请求经 Backend 代理转发给 Agent
- Backend → Agent 通过 `X-Agent-Api-Key` header 认证
- Agent 持有所有第三方 API 密钥

## 环境变量

### agent/.env

| 变量 | 用途 |
|------|------|
| OPENAI_API_KEY / DASHSCOPE_API_KEY | 阿里云 Dashscope 模型 API |
| TENCENT_SECRET_ID | 腾讯云 SOE 口语评测 |
| TENCENT_SECRET_KEY | 腾讯云 SOE 口语评测 |
| ALIYUN_STT_APPKEY | 阿里云一句话识别 |
| ALIYUN_AK_ID / ALIYUN_AK_SECRET | 阿里云 AccessKey |

### backend/.env

| 变量 | 用途 |
|------|------|
| DATABASE_URL | MySQL 连接串 |
| AGENT_URL | Agent 服务地址 (http://localhost:8000/api/agent) |
| AGENT_API_KEY | Agent 认证密钥 |

## 跟读评测架构 (SOE)

### 调用链

```
前端录音(WAV 16kHz) → POST /api/read-aloud/evaluate → Agent
  → 腾讯云 SOE TransmitOralProcessWithInit (HTTP REST)
  → 返回: 音素级评分 + 词级 matchTag
  → 前端展示: 词级颜色映射 (绿≥80/橙60-79/红<60)
```

### SOE 关键参数

```typescript
{
  VoiceFileType: 3,          // wav
  VoiceEncodeType: 1,        // pcm
  EvalMode: 1,               // 句子模式
  ScoreCoeff: 3.5,           // 儿童宽松评分 (1.0=标准, 越大越宽松)
  ServerEngineType: '16k_en' // 英文 16kHz
}
```

### SOE 返回 matchTag 含义

| matchTag | 含义 | 前端展示 |
|----------|------|---------|
| 0 | 正确 | 绿色 (accuracy≥80) / 橙色 (60-79) / 红色 (<60) |
| 1 | 多读 | 紫色斜体 |
| 2 | 漏读 | 灰色删除线 |
| 3 | 错读 | 红色波浪下划线 |

### Fallback 机制

SOE 不可用时自动降级为: 阿里云 STT 识别 → 文本对比评分。

## AI 对话架构

### 模型配置 (agent/src/config.ts)

| 模型标识 | 默认值 | 用途 |
|---------|--------|------|
| models.omni | qwen-omni-turbo | 多模态对话 (音频输入输出) |
| models.plus | qwen-plus | 评分、总评 (高质量输出) |
| models.turbo | qwen-plus | 翻译等 (速度优先) |

### 对话流程

```
Omni-Dialogue Agent (qwen-omni-turbo)
  → 支持音频输入: 学生语音
  → 支持音频输出: AI 老师回复语音
  → System Prompt 控制回复长度 (≤2句, ≤15词)
  → temperature: 0.5
```

## 开发约定

1. **不要手写 fetch 调接口** - 使用项目已有的公共请求方法
2. **不加装饰性分隔线注释** - 如 `// ====== xxx ======`
3. **不自动运行全量构建** - 除非用户明确要求 pnpm build
4. **前端组件** 放 `frontend/src/components/`，页面放 `pages/`
5. **Agent 新服务** 放 `agent/src/services/`，业务逻辑放 `agents/`
6. **数据库改动** 通过 Prisma schema → `npx prisma db push`

## 常用命令

```bash
# 数据库
cd backend && npx prisma studio          # 打开 DB 管理界面
cd backend && npx prisma db push         # 同步 schema 到数据库
cd backend && npx prisma db seed         # 填充种子数据

# 类型检查
cd agent && npx tsc --noEmit
cd frontend && npx tsc --noEmit

# Docker
docker compose -f docker-compose.dev.yml up -d    # 启动
docker compose -f docker-compose.dev.yml down      # 停止
docker compose -f docker-compose.dev.yml logs -f   # 查看日志
```

## 第三方服务

| 服务 | 用途 | 计费 |
|------|------|------|
| 腾讯云 SOE | 口语评测 (音素级) | ~0.001元/次 |
| 阿里云 Dashscope | LLM 对话 + STT | ~0.01元/次 |
| 阿里云 STT | 一句话识别 (fallback) | 很便宜 |
| MinIO (本地) | 文件存储 (音频等) | 免费 |
