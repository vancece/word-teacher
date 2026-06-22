# Word Teacher 项目开发 Skill

> 本文档是 AI 助手开发此项目的标准操作手册（SOP）。

## 项目概览

Word Teacher 是一个儿童英语口语训练平台，支持跟读练习、AI 对话、单词游戏三种模式。

**技术栈**: Express 5 + Prisma (MySQL) + React 19 + Vite 7 + LangChain + Vercel AI SDK

---

## 快速命令参考

| 场景 | 命令 |
|------|------|
| **一键启动开发环境** | `pnpm dev` |
| **停止所有服务** | `pnpm stop` |
| **重置测试数据** | `pnpm seed` |
| **数据库可视化** | `pnpm db:studio` |
| **同步 Schema** | `cd backend && npx prisma db push` |
| **生成 Prisma Client** | `cd backend && npx prisma generate` |
| **跑测试** | `cd agent && pnpm test` |
| **部署到线上** | `git push origin main && git checkout master && git merge main --no-edit && git push origin master && git checkout main` |

---

## 项目结构

```
word-teacher/
├── backend/          # Express API 服务 (:3001)
│   ├── prisma/       # schema.prisma + seed
│   └── src/
│       ├── routes/       # API 路由
│       │   ├── admin/    # 管理后台路由
│       │   ├── student/  # 学生认证
│       │   ├── teacher/  # 教师认证
│       │   ├── internal.routes.ts     # Agent 调用的内部 API
│       │   └── internal.export.routes.ts
│       └── config/
├── agent/            # AI Agent 服务 (:8000)
│   └── src/
│       ├── agents/       # 9 个 AI Agent
│       ├── tools/        # 13 个 MCP 工具
│       │   ├── index.ts      # 工具注册
│       │   └── registry.ts   # 工具执行引擎
│       └── routes/       # Agent 路由
├── frontend/         # 学生端 React (:5173)
├── admin/            # 管理后台 React (:5174)
├── scripts/
│   ├── dev-start.sh      # 一键启动
│   └── seed-dev.sh       # 测试数据重置
├── docker-compose.dev.yml   # 开发环境 MySQL+MinIO
└── docker-compose.prod.yml  # 生产环境
```

---

## 开发工作流 SOP

### 1. 环境启动

```bash
# 一键启动（自动检测 Docker、建库、sync schema、填充数据、启动所有服务）
pnpm dev
```

启动后访问：
- 学生端: http://localhost:5173/
- 管理后台: http://localhost:5174/teacher-admin/
- Backend API: http://localhost:3001/api
- Agent: http://localhost:8000

### 2. 测试数据

```bash
# 重置全部测试数据（幂等，每次清空重建）
pnpm seed
```

测试账号：
| 角色 | 账号 | 密码 |
|------|------|------|
| 管理员 | `admin` | `123456` |
| 教师 | `xiaomei` | `123456` |
| 学生 | `2026050101` | `123456` |

### 3. 数据库变更

```bash
# 修改 backend/prisma/schema.prisma 后
cd backend
npx prisma db push        # 同步到数据库
npx prisma generate       # 重新生成 Client
../scripts/seed-dev.sh    # 重置测试数据
```

### 4. 新增 MCP 工具

1. 在 `agent/src/tools/` 下新建 `xxx.tool.ts`
2. 导出 tool 定义（name、description、parameters、execute）
3. 在 `agent/src/tools/index.ts` 中注册到对应分类（READ/SAFE_WRITE/EXPORT）
4. 对应后端接口在 `backend/src/routes/internal.routes.ts`

### 5. 新增 Agent

1. 在 `agent/src/agents/` 下新建 `xxx.agent.ts`
2. 在 `agent/src/routes/` 下新增路由
3. Agent 使用 Vercel AI SDK 的 `streamText` 或 `generateText`

### 6. 新增管理后台页面

1. 在 `admin/src/pages/` 新建 `XxxPage.tsx` + `XxxPage.scss`
2. 在 `admin/src/App.tsx` 添加路由
3. 在 `admin/src/components/Layout.tsx` 添加菜单项

### 7. 部署

```bash
# 日常开发推到 main
git add -A && git commit -m "feat: xxx"
git push origin main

# 需要部署时合并到 master 触发流水线
git checkout master && git merge main --no-edit && git push origin master
git checkout main
```

---

## 服务间调用关系

```
Admin/Frontend  →  Backend (:3001)  →  Agent (:8000)
                       │                    │
                       ├── MySQL (:3306)    ├── OpenAI API (DeepSeek)
                       ├── MinIO (:9000)    ├── Azure Speech (TTS)
                       └── Agent内部API     └── 讯飞语音评测
```

- Agent 通过 `http://localhost:3001/internal/*` 调用 Backend 内部 API
- Backend 通过 `http://localhost:8000/api/agent/*` 调用 Agent
- 工具执行时携带 `X-Internal-Key` 头部认证

---

## MCP 工具清单 (15个)

| 工具名 | 类型 | 功能 |
|--------|------|------|
| `queryStudents` | 只读 | 查询学生列表/详情（支持 filter=inactive） |
| `class` | 只读 | 班级信息查询 |
| `records` | 只读 | 练习记录（支持 recordId 查详情） |
| `stats` | 只读 | 统计数据 |
| `scenes` | 只读 | 场景列表 |
| `wordPack` | 只读 | 词包查询 |
| `studentSummary` | 只读 | 学生学习总结 |
| `teacher` | 只读 | 教师信息 |
| `classAnalysis` | 只读 | 班级分析（mode: ranking/report/progress/stats） |
| `knowledge` | 只读 | 知识库查询 |
| `resetPassword` | 写入 | 重置学生密码 |
| `contentManage` | 写入 | 内容管理（场景/词包可见性） |
| `createStudent` | 写入 | 创建学生（强制学号格式：8-12位纯数字） |
| `createTeacher` | 写入 | 创建教师（强制账号格式：小写字母开头，3-20位） |
| `exportRecords` | 导出 | 导出练习记录 Excel |

### 格式规范

- **学号**: 8-12 位纯数字，推荐格式 `入学年份(4) + 班级号(2) + 学生序号(2~4)`，如 `2026050101`
- **教师账号**: 小写字母开头，3-20 位，仅允许小写字母/数字/下划线，如 `wang_li`

---

## 关键文件速查

| 文件 | 说明 |
|------|------|
| `backend/prisma/schema.prisma` | 数据库模型定义 |
| `backend/src/routes/internal.routes.ts` | Agent 调用的内部 API（最核心） |
| `agent/src/tools/index.ts` | 工具注册中心 |
| `agent/src/tools/registry.ts` | 工具执行引擎 |
| `agent/src/agents/assistant.agent.ts` | 教师助手 Agent |
| `agent/src/agents/dialogue.agent.ts` | 对话练习 Agent |
| `docker-compose.dev.yml` | 开发环境 Docker 配置 |
| `docker-compose.prod.yml` | 生产环境配置 |
| `.github/workflows/` | CI/CD 流水线 |

---

## 常见问题排查

### 端口被占用
```bash
lsof -ti:3001,8000,5173,5174 | xargs kill -9
```

### MySQL 连不上
```bash
# 检查 Docker
docker ps | grep mysql
# 没跑就启动
docker compose -f docker-compose.dev.yml up -d mysql
# 或者用 Homebrew
brew services start mysql
```

### Prisma Client 过期
```bash
cd backend && npx prisma generate
```

### Agent 工具报 500
```bash
# 直接 curl 测试内部 API
curl http://localhost:3001/internal/students \
  -H "X-Internal-Key: word-teacher-internal-key" \
  -H "Content-Type: application/json" \
  -d '{"teacherId": 2}'
```

### 登录失败
```bash
# 重置测试数据
./scripts/seed-dev.sh
```

---

## 环境变量

Backend (`backend/.env`):
```
DATABASE_URL="mysql://root:password@127.0.0.1:3306/word_teacher"
JWT_SECRET="word-teacher-jwt-secret-key-2024"
INTERNAL_API_KEY="word-teacher-internal-key"
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=admin
MINIO_SECRET_KEY=minio123456
MINIO_BUCKET=covers
MINIO_PUBLIC_PATH=/minio
AZURE_SPEECH_KEY=<your-key>
AZURE_SPEECH_REGION=eastasia
DEEPSEEK_API_KEY=<your-key>
AGENT_URL="http://localhost:8000/api/agent"
```

Agent (`agent/.env`):
```
PORT=8000
BACKEND_URL=http://localhost:3001
INTERNAL_API_KEY=word-teacher-internal-key
OPENAI_API_KEY=<deepseek-key>
OPENAI_BASE_URL=https://api.deepseek.com
```

---

## 分支策略

- `main`: 日常开发分支，所有代码推这里
- `master`: 部署分支，push 后触发 GitHub Actions 自动部署
- **除非用户说"部署/发布"，否则只推 main**

---

## 注意事项

1. **不要手动 SSH 到服务器**，通过流水线部署
2. **不要运行 pnpm build 验证**，除非用户明确要求
3. **不要加 `// ====` 风格的分隔线注释**
4. **修改数据库 schema 后记得重新 seed**
5. **Agent 端口是 8000 不是 3002**（生产环境容器内才是 3002）
6. **内部 API 需要 X-Internal-Key 头部**
