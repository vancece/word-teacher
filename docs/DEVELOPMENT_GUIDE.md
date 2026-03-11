# Word Teacher 开发指南

## 项目架构

```
word-teacher/
├── frontend/          # 学生端 React 应用
├── admin/             # 管理后台 React 应用
├── backend/           # Express.js API 服务
├── agent/             # AI Agent 服务 (Qwen-Omni)
└── deploy/            # 部署配置
```

## 技术栈

- **Frontend/Admin**: React + TypeScript + Vite + Ant Design
- **Backend**: Express.js + TypeScript + Prisma + MySQL
- **Agent**: Node.js + TypeScript + LangChain + Qwen-Omni
- **部署**: Docker + Docker Compose + Nginx

## 本地开发

### 1. 环境准备

```bash
# 安装依赖
cd frontend && pnpm install
cd admin && pnpm install
cd backend && pnpm install
cd agent && pnpm install
```

### 2. 配置环境变量

```bash
# Backend
cp backend/.env.example backend/.env
# 修改 DATABASE_URL, JWT_SECRET, DASHSCOPE_API_KEY

# Agent
cp agent/.env.example agent/.env
# 修改 DASHSCOPE_API_KEY, AGENT_API_KEY
```

### 3. 启动数据库

```bash
docker run -d --name mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=word_teacher \
  -p 3306:3306 mysql:8
```

### 4. 初始化数据库

```bash
cd backend
pnpm db:push   # 同步 schema
pnpm db:seed   # 填充测试数据
```

### 5. 启动服务

```bash
# 终端 1: Backend
cd backend && pnpm dev

# 终端 2: Agent
cd agent && pnpm dev

# 终端 3: Frontend
cd frontend && pnpm dev

# 终端 4: Admin
cd admin && pnpm dev
```

## 关键功能实现

### AI 对话流程

```
学生语音 → Frontend → Backend → Agent (Qwen-Omni)
                               ↓
学生 ← Frontend ← Backend ← AI 回复 (文本+音频)
                               ↓
                          翻译 (Qwen-Plus)
```

### 评分机制

对话分为两个阶段：
1. **对话阶段** (Round 1-5): `modalities: ['text', 'audio']`
2. **评分阶段** (Round 6): `modalities: ['text']` 只输出评分 JSON

Qwen-Omni 全程"听"了学生的语音，所以能准确评分。

### 场景管理

场景创建时会自动关联创建者（`creatorId`），只有创建者或管理员可以编辑/删除。

## 部署流程

### 1. 构建镜像

```bash
# 构建所有镜像
docker buildx build --platform linux/amd64 -t word-teacher-nginx:amd64 -f Dockerfile.nginx . --load
docker buildx build --platform linux/amd64 -t word-teacher-backend:amd64 -f Dockerfile.backend . --load
docker buildx build --platform linux/amd64 -t word-teacher-agent:amd64 -f Dockerfile.agent . --load
```

### 2. 上传到服务器

```bash
docker save word-teacher-nginx:amd64 word-teacher-backend:amd64 word-teacher-agent:amd64 \
  -o /tmp/word-teacher-all.tar
scp /tmp/word-teacher-all.tar root@SERVER_IP:~/word-teacher/
```

### 3. 部署

```bash
# 在服务器上
cd ~/word-teacher
docker load -i word-teacher-all.tar
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

## 环境变量说明

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | MySQL 连接字符串 | `mysql://user:pass@host:3306/db` |
| `JWT_SECRET` | JWT 签名密钥 | 至少 32 字符 |
| `DASHSCOPE_API_KEY` | 阿里云 DashScope API Key | `sk-xxx` |
| `AGENT_API_KEY` | Agent 服务间通信密钥 | 任意字符串 |
| `CORS_ORIGINS` | 允许的跨域来源 | `https://example.com` |

## API 路由

### Backend API

- `POST /api/auth/login` - 用户登录
- `GET /api/scenes` - 获取场景列表
- `POST /api/dialogue/workflow/stream` - 对话流 (SSE)
- `GET /api/admin/*` - 管理后台 API

### Agent API

- `POST /api/agent/dialogue/stream` - AI 对话 (SSE)
- `POST /api/agent/scene/supplement` - AI 补充场景

## 常见开发问题

### Prisma 类型不更新
```bash
cd backend && pnpm db:generate
```

### 前端环境变量不生效
确保变量名以 `VITE_` 开头，修改后重启 dev server。

### Agent 音频格式问题
Qwen-Omni 返回的是 WAV 格式，确保前端使用正确的 MIME 类型。

