# Echo Kid 本地开发指南

> 📅 更新时间: 2026-03-05

## 🚀 核心原则

**简单！一个命令搞定一切。**

---

## 📋 标准开发流程

```
┌─────────────────────────────────────────────────────────────────┐
│  1. 开发完成        编写代码，完成功能开发                        │
│         ↓                                                        │
│  2. 本地验证        pnpm dev-docker 启动服务                      │
│         ↓           使用 Chrome DevTools 或手动测试功能           │
│         ↓                                                        │
│  3. 提交代码        git add -A && git commit -m "feat: xxx"      │
│         ↓                                                        │
│  4. 推送 master     git push origin main                         │
│         ↓           git checkout master && git merge main        │
│         ↓           git push origin master                       │
│         ↓                                                        │
│  5. 等待流水线      GitHub Actions 自动构建 Docker 镜像           │
│         ↓           自动部署到服务器                              │
│         ↓           通常需要 5-10 分钟                            │
│         ↓                                                        │
│  6. 验证线上        打开 Cloudflare Tunnel 地址测试功能            │
│         ↓           确认功能正常后删除测试数据                     │
│         ↓                                                        │
│  7. 完成 ✅                                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 快速命令

```bash
# 本地开发
pnpm dev-docker              # 启动所有服务

# 提交并部署
git add -A && git commit -m "feat: 功能描述"
git push origin main
git checkout master && git merge main --no-edit && git push origin master
git checkout main

# 等待流水线完成后测试线上
# 线上地址: https://{动态域名}.trycloudflare.com/teacher-test
#          https://{动态域名}.trycloudflare.com/teacher-admin
```

### 流水线说明

- **触发条件**: 推送到 `master` 分支
- **构建内容**: Backend、Agent、Nginx (Frontend + Admin) Docker 镜像
- **部署方式**: SSH 到服务器执行 `docker compose pull && up -d`
- **耗时**: 约 5-10 分钟

### 流水线失败排查

1. **Docker Hub 认证失败**
   ```
   Error: unauthorized: incorrect username or password
   ```
   **解决**: 去 GitHub 仓库 Settings → Secrets → 更新 `DOCKER_PASSWORD`
   - 推荐使用 Docker Hub Access Token 而不是密码
   - 获取 Token: Docker Hub → Account Settings → Security → New Access Token

2. **部署 SSH 失败**
   - 检查服务器是否在线
   - 检查 `SSH_PRIVATE_KEY` secret 是否正确

---

## 🌐 浏览器自动化测试 (Chrome DevTools MCP)

开发时可以使用 Chrome DevTools MCP 进行浏览器自动化测试，支持：
- 自动填写表单、点击按钮
- 截图和页面快照
- 网络请求监控
- 多标签页管理

### 安装

```bash
npx -y chrome-devtools-mcp@latest
```

### 使用方式

1. 启动 Chrome DevTools MCP 后，会自动打开 Chrome 浏览器
2. AI 助手可以通过 MCP 协议控制浏览器进行自动化测试
3. 支持的操作：导航、点击、填写表单、截图、读取页面内容等

### 常用测试地址

| 页面 | 本地地址 | 线上地址 |
|------|----------|----------|
| 学生端 | http://localhost:5173/ | https://{域名}.trycloudflare.com/teacher-test/ |
| 管理后台 | http://localhost:5174/teacher-admin/ | https://{域名}.trycloudflare.com/teacher-admin/ |

---

## 📦 开发命令

```bash
pnpm dev-docker   # 一键启动所有服务
pnpm dev-web      # 只启动前端（后端已在运行时用）
pnpm stop         # 停止 Docker 服务
pnpm db:seed      # 重新填充测试数据
pnpm db:studio    # 打开数据库管理界面
```

---

## 🔗 服务地址

| 服务 | 端口 | 地址 |
|------|------|------|
| 学生端 (Frontend) | 5173 | http://localhost:5173/ |
| 管理后台 (Admin) | 5174 | http://localhost:5174/teacher-admin/ |
| 后端 API (Backend) | 3001 | http://localhost:3001/api |
| AI Agent | 8000 | http://localhost:8000/api/agent |
| MySQL | 3306 | localhost:3306 |
| MinIO Console | 9001 | http://localhost:9001 |

---

## 🔑 测试账号

| 角色 | 账号 | 密码 |
|------|------|------|
| 管理员 | `admin` | `123456` |
| 教师 | `xiaomei` | `123456` |
| 学生 | `2026050101` | `123456` |

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker 容器                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ MySQL (3306)    │  │ MinIO (9000)    │                   │
│  │ 数据库存储       │  │ 文件存储         │                   │
│  └─────────────────┘  └─────────────────┘                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   本地服务 (热重载)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Backend     │  │ Agent       │  │ Frontend    │         │
│  │ (3001)      │─▶│ (8000)      │  │ (5173)      │         │
│  │ Express+    │  │ AI 服务      │  │ Vite+React  │         │
│  │ Prisma      │  │ LangChain   │  │ 学生端      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│        │                                    │               │
│        │          ┌─────────────┐          │               │
│        └─────────▶│ Admin       │◀─────────┘               │
│                   │ (5174)      │                           │
│                   │ 管理后台     │                           │
│                   └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

---

## ⚙️ 首次使用

```bash
# 1. 确保已安装 Docker Desktop
# 2. 克隆项目并安装依赖
git clone <repo>
cd word-teacher
pnpm install

# 3. 启动开发环境
pnpm dev-docker
```

启动后会自动：
1. ✅ 启动 Docker (MySQL + MinIO)
2. ✅ 初始化数据库表
3. ✅ 复制环境变量
4. ✅ 启动 Backend + Agent + Frontend + Admin

---

## 🐛 常见问题排查

### 1. 端口被占用

```bash
# 清理占用端口
lsof -ti:5173,5174,3001,8000 | xargs kill -9
```

### 2. 数据库是空的 / 登录失败

```bash
# 重新填充测试数据
pnpm db:seed
```

### 3. Agent 服务 500 错误 (SSL 证书问题)

**现象**: 跟读评估报 `fetch failed` 或 `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`

**原因**: Node.js 调用阿里云 API 时 SSL 证书验证失败

**解决**: 已在 `agent/src/index.ts` 添加开发环境跳过 SSL 验证：
```typescript
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}
```

### 4. Agent 端口不匹配

**注意**: Agent 默认端口是 `8000`，不是 `3002`

确保 `.env.development` 中配置正确：
```
AGENT_URL="http://localhost:8000/api/agent"
```

### 5. Docker 服务未启动

```bash
# 检查 Docker 状态
docker ps

# 手动启动
docker compose -f docker-compose.dev.yml up -d
```

### 6. Prisma 客户端未生成

```bash
cd backend && npx prisma generate
```

---

## 📂 关键文件

| 文件 | 说明 |
|------|------|
| `docker-compose.dev.yml` | Docker 开发环境配置 |
| `.env.development` | 开发环境变量 (git忽略) |
| `.env.development.example` | 环境变量模板 |
| `scripts/dev-start.sh` | 开发启动脚本 |
| `backend/prisma/seed.ts` | 测试数据填充脚本 |
| `backend/prisma/schema.prisma` | 数据库模型定义 |

---

## 🧪 功能测试

### 学生端 API (需要 Student Token)

```bash
# 登录获取 Token
curl -X POST http://localhost:3001/api/student/auth/login \
  -H "Content-Type: application/json" \
  -d '{"studentNo":"2026050101","password":"123456"}'

# 获取个人信息
curl http://localhost:3001/api/student/auth/me \
  -H "Authorization: Bearer <token>"

# 获取对话场景
curl http://localhost:3001/api/scenes \
  -H "Authorization: Bearer <token>"

# 获取跟读场景
curl http://localhost:3001/api/read-aloud/scenes \
  -H "Authorization: Bearer <token>"

# 开始对话练习
curl -X POST http://localhost:3001/api/dialogue/start \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"sceneId":"scene_demo"}'

# 开始跟读练习
curl -X POST http://localhost:3001/api/read-aloud/start \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"sceneId":"read_demo"}'
```

### 管理后台 API (需要 Teacher Token)

```bash
# 登录获取 Token
curl -X POST http://localhost:3001/api/teacher/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'

# 获取学生列表
curl http://localhost:3001/api/admin/students \
  -H "Authorization: Bearer <token>"

# 获取教师列表
curl http://localhost:3001/api/admin/teachers \
  -H "Authorization: Bearer <token>"

# 获取统计数据
curl http://localhost:3001/api/admin/stats \
  -H "Authorization: Bearer <token>"
```

### Agent 服务

```bash
# 健康检查
curl http://localhost:8000/api/agent/health
```

---

## 📋 已验证功能清单 (2026-03-05)

### 学生端 ✅ (浏览器 + API 双重验证)
- [x] 学生登录 (`POST /api/student/auth/login`)
- [x] 获取个人信息 (`GET /api/student/auth/me`)
- [x] 首页场景列表显示 (对话+跟读)
- [x] 跟读场景列表 (`GET /api/read-aloud/scenes`)
- [x] **跟读功能** - 进入场景，显示句子列表，录音按钮可用
- [x] 对话场景列表 (`GET /api/scenes`)
- [x] **AI 对话** - 进入场景，AI 主动打招呼 + 语音播放
- [x] **文字输入对话** - 发送消息，AI 实时回复 + 中文翻译
- [x] 开始跟读练习 (`POST /api/read-aloud/start`)
- [x] 开始对话练习 (`POST /api/dialogue/start`)
- [x] 跟读评估 (`POST /api/read-aloud/evaluate`)
- [x] 练习历史 (`GET /api/dialogue/history`)

### 管理后台 ✅ (浏览器 + API 双重验证)
- [x] 管理员登录 (`POST /api/teacher/auth/login`)
- [x] **仪表盘** - 统计数据显示 (学生数、练习次数等)
- [x] **教师管理** - 显示 xiaomei、admin
- [x] **班级管理** - 显示"示例班级"
- [x] **学生管理** - 显示学生列表、练习次数
- [x] **场景管理** - 跟读/对话场景切换
- [x] **添加场景** - 表单弹窗、输入句子
- [x] **AI 补充功能** - 自动生成封面图 + 翻译
- [x] 查看学生列表 (`GET /api/admin/students`)
- [x] 查看教师列表 (`GET /api/admin/teachers`)
- [x] 查看班级列表 (`GET /api/admin/classes`)
- [x] 添加场景 (`POST /api/admin/scenes`)
- [x] 仪表盘统计 (`GET /api/admin/stats`)

### Agent 服务 ✅
- [x] 健康检查 (`GET /api/agent/health`)
- [x] 跟读评估 (`POST /api/agent/read-aloud/evaluate`)
- [x] AI 对话 (通过 Backend 代理)
- [x] 自动翻译 (场景创建时)
- [x] 自动生成封面图 (场景创建时)

---

## 🖥️ 浏览器测试

### 方式一：Chrome DevTools 自动化测试 (AI Agent 使用)

使用 `chrome-devtools` MCP 工具可以让 AI 自动操作浏览器进行测试：

```bash
# 常用工具命令
list_pages_chrome-devtools          # 列出所有打开的页面
navigate_page_chrome-devtools       # 导航到指定 URL
take_snapshot_chrome-devtools       # 获取页面快照 (a11y tree)
take_screenshot_chrome-devtools     # 截图
click_chrome-devtools               # 点击元素
fill_chrome-devtools                # 填写输入框
fill_form_chrome-devtools           # 批量填写表单
wait_for_chrome-devtools            # 等待文本出现
```

**测试流程示例:**
1. `navigate_page` → 打开 http://localhost:5173/
2. `take_snapshot` → 获取页面元素 uid
3. `fill_form` → 填写登录表单 (学号 + 密码)
4. `click` → 点击登录按钮
5. `wait_for` → 等待页面跳转
6. `take_snapshot` → 验证登录成功

### 方式二：手动测试流程

#### 学生端测试流程
1. 打开 http://localhost:5173/
2. 输入 `2026050101` / `123456` 登录
3. 首页显示用户名"张小明"和场景列表
4. 点击 **英语跟读** → **日常问候** → 进入跟读页面
5. 看到 5 个句子，点击"🎙️ 请朗读第1句"按钮
6. 返回首页，点击 **打招呼** 对话场景
7. AI 老师自动打招呼并播放语音
8. 点击"切换到文字输入"，输入英文回复
9. AI 实时回复 + 显示中文翻译

#### 管理后台测试流程
1. 打开 http://localhost:5174/teacher-admin/
2. 输入 `admin` / `123456` 登录
3. 仪表盘显示统计数据
4. 点击 **教师管理** → 看到 xiaomei、admin
5. 点击 **班级管理** → 看到"示例班级"
6. 点击 **学生管理** → 看到"张小明"
7. 点击 **场景管理** → **添加场景**
8. 填写名称、描述、英文句子
9. 点击 **AI 补充** → 自动生成封面图和翻译

---

## 💡 开发技巧

1. **为什么用 Vite 本地跑前端？**
   - 热更新秒级生效
   - 启动快 (~100ms)
   - 调试方便

2. **为什么 MySQL/MinIO 用 Docker？**
   - 隔离环境，不污染本机
   - 配置统一，团队一致
   - 重置简单

3. **修改代码后服务自动重启**
   - tsx watch 监控后端代码
   - Vite HMR 监控前端代码

4. **数据库变更后**
   ```bash
   cd backend && npx prisma db push   # 同步表结构
   pnpm db:seed                       # 重新填充数据
   ```

