# Word Teacher - AI 英语口语训练系统

AI 驱动的英语口语对话练习应用。通过**场景化 AI 对话 + 英语跟读 + 实时语音识别 + 智能评分反馈**，帮助学生在轻松的环境中高频开口练习英语。

## 📸 产品截图

<!-- 请将截图放到 docs/images/ 目录下，然后取消下面的注释 -->

| 学生登录 | 场景选择 | AI 对话 |
|:---:|:---:|:---:|
| ![登录](docs/images/login.png) | ![场景](docs/images/scenes.png) | ![对话](docs/images/dialogue.png) |

| 跟读练习 | 评分反馈 | 管理后台 |
|:---:|:---:|:---:|
| ![跟读](docs/images/read-aloud.png) | ![评分](docs/images/scoring.png) | ![后台](docs/images/admin.png) |

---

**线上地址**：
- 学生端: `http://YOUR_SERVER_IP/teacher-test`
- 管理后台: `http://YOUR_SERVER_IP/teacher-admin`

**测试账号**：
| 角色 | 账号 | 密码 |
|------|------|------|
| 管理员 | `admin` | `123456` |
| 教师 | `xiaomei` | `123456` |
| 学生 | `2026050101` | `123456` |

## 🎯 产品定位

- **目标用户**：英语学习者（学生、成人均适用）
- **核心场景**：课后口语练习、假期自主学习
- **教学理念**：沉浸式对话 + 即时反馈 + 鼓励式评价

## ✨ 核心功能

### 📱 学生端功能

#### 🎙️ 英语跟读练习
- **句子朗读**：跟读标准英语句子，练习发音
- **AI 语音评分**：实时分析发音质量，提供多维度评分
- **评分维度**（1-5 星制）：
  - 🎵 语音语调 - 发音准确性和语调自然度
  - 🌊 流利连贯 - 朗读流畅度和连贯性
  - ✓ 准确完整 - 内容的准确性和完整性
  - ❤️ 情感表现力 - 情感表达和感染力
- **逐句反馈**：每句话即时显示评分和发音对比
- **进步追踪**：记录每次跟读成绩，查看进步轨迹

#### 🎯 AI 对话练习
- **生活化场景**：问候打招呼、自我介绍、购物、餐厅点餐、数字颜色等贴近生活的对话场景
- **AI 对话伙伴**：友好的 AI 角色（Lily）与学生进行自然对话，每次练习 5 轮对话
- **语音 + 文字输入**：支持语音录入或键盘输入，适应不同使用场景
- **实时翻译**：AI 回复自动显示中文翻译，帮助理解
- **语音朗读**：AI 回复自动朗读，帮助学生学习正确发音

#### ⭐ 智能评分系统
- **多维度评分**：
  - 📖 语法准确度 (Grammar)
  - 🗣️ 表达流利度 (Fluency)
  - 💡 内容相关性 (Relevance)
  - 🎯 努力程度 (Effort)
- **鼓励式反馈**：每次练习结束后给出鼓励性评语和改进建议
- **1-5 星评级**：直观展示练习表现

#### 👤 个人中心
- **学习统计**：对话练习次数、跟读练习次数、平均成绩
- **学习历史**：按类型筛选查看所有练习记录
- **最佳成绩**：展示对话和跟读的最佳表现
- **AI 学习评价**：智能分析学习情况，给出个性化建议

### 👩‍🏫 教师管理后台

#### 📊 数据仪表盘
- 学生总数、教师总数、班级总数统计
- 今日/本周练习数量统计
- 跟读完成情况和平均分
- 快速操作入口

#### 👥 教师管理（仅管理员）
- 添加/编辑/删除教师账号
- 设置管理员权限
- 分配负责班级

#### 🏫 班级管理
- 创建/编辑/删除班级
- 分配班级所属教师（支持多选）
- 查看班级学生列表
- 班级学生数量统计

#### 👨‍🎓 学生管理
- 学生列表（按座位号排序）
- Excel 批量导入学生（支持座位号）
- 修改学生密码、编辑学生信息
- 查看学生详情和练习记录
- 删除学生（级联删除练习记录）

#### 🎙️ 跟读记录
- 查看所有学生跟读练习记录
- 按状态筛选（已完成/未完成）
- 查看评分详情（语音语调、流利连贯、准确完整、情感表现力）

#### 📚 场景管理
- **跟读场景**：创建包含多个句子的跟读练习
- **对话场景**：创建 AI 对话练习场景
- **AI 补充功能**：自动翻译句子、生成封面图
- 设置场景可见性（对学生隐藏/显示）
- 关键词(vocabulary)管理
- 自定义 AI 提示词(prompt)

#### 📈 进步追踪
- 班级整体学习趋势图表
- 学生个人进步追踪
- 优秀学员排行榜
- AI 学习总结报告
- 导出报告（Excel/PDF）

### 🔑 权限系统

| 角色 | 教师管理 | 班级管理 | 学生管理 | 跟读记录 | 场景管理 | 进步追踪 |
|------|---------|---------|---------|---------|---------|---------|
| 管理员 | ✅ 全部 | ✅ 全部 | ✅ 全部班级 | ✅ 全部记录 | ✅ 全部场景 | ✅ 全部班级 |
| 普通教师 | ❌ 不可见 | ✅ 负责班级 | ✅ 负责班级 | ✅ 负责班级 | ✅ 仅自己创建 | ✅ 负责班级 |

## 🛠️ 技术架构

```
word-teacher/
├── frontend/          # 学生端前端 (Vite + React + TypeScript + SCSS)
├── admin/             # 管理后台前端 (Vite + React + TypeScript + SCSS)
├── backend/           # Node.js 后端 (Express + Prisma + MySQL)
├── agent/             # AI Agent 服务 (Qwen + DashScope API)
└── pnpm-workspace.yaml
```

### 前端技术栈
- **React 19** + TypeScript
- **Vite** 构建工具
- **React Router** 路由管理
- **SCSS** 样式
- **Web Audio API** 录音功能
- **SSE (Server-Sent Events)** 流式响应

### 后端技术栈
- **Node.js** + Express 5
- **Prisma ORM** + MySQL
- **JWT** 身份认证
- **RESTful API** + SSE 流式接口
- **Pino** 结构化日志
- **express-rate-limit** 请求限流

### AI 服务
- **Qwen-Omni** 多模态对话 (支持语音输入+输出)
- **Qwen-Plus** 翻译和文本生成
- **Paraformer** 语音识别 (ASR)
- **CosyVoice** 语音合成 (TTS)
- **流式处理** 实时响应

### 安全特性
- **Rate Limiting**：全局限流 + 登录接口严格限流
- **Helmet**：HTTP 安全头
- **CORS**：跨域白名单控制
- **API Key 认证**：服务间通信加密
- **请求超时**：防止 AI 调用无限等待

## 🚀 本地开发环境

### 数据库配置 (MySQL)

| 配置项 | 值 |
|--------|-----|
| Host | localhost |
| Port | 3306 |
| Database | word_teacher |
| Username | root |
| Password | password |

连接字符串：
```
mysql://root:password@localhost:3306/word_teacher
```

### 测试账号

| 角色 | 用户名 | 密码 | 说明 |
|------|--------|------|------|
| 学生 | student001 | 123456 | 小明，三年级2班 |
| 老师 | teacher001 | 123456 | 王老师 |

### JWT 配置

| 配置项 | 开发环境值 |
|--------|-----------|
| JWT_SECRET | (至少32字符) |
| JWT_EXPIRES_IN | 7d |

## 🚀 快速启动

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动 MySQL

如果使用 Homebrew 安装的 MySQL：
```bash
brew services start mysql
```

如果使用 Docker：
```bash
docker compose up -d mysql
```

### 3. 初始化数据库

```bash
cd backend
pnpm db:push    # 同步数据库结构
pnpm db:seed    # 填充测试数据
```

### 4. 配置环境变量

```bash
# backend/.env (参考 backend/.env.example)
cp backend/.env.example backend/.env

# agent/.env (参考 agent/.env.example)
cp agent/.env.example agent/.env
# 修改 DASHSCOPE_API_KEY 为你的阿里云 API Key
```

### 5. 启动开发服务器

```bash
# 启动所有服务（前端 + 后端 + AI Agent）
pnpm dev

# 或分别启动
cd frontend && pnpm dev   # 学生端 http://localhost:5173
cd admin && pnpm dev      # 管理后台 http://localhost:5174
cd backend && pnpm dev    # 后端 http://localhost:3001
cd agent && pnpm dev      # Agent http://localhost:8000
```

## 📱 使用流程

1. **登录**：使用学号密码登录
2. **选择场景**：在首页选择想要练习的对话场景
3. **开始对话**：AI 会先打招呼，然后等待你的回复
4. **语音/文字输入**：点击麦克风录音或切换到键盘输入
5. **完成练习**：5 轮对话后自动进入评分页面
6. **查看评分**：查看本次练习的评分和反馈

## 📂 API 端点

### 学生端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 登录 |
| POST | /api/auth/register | 学生注册 |
| GET | /api/auth/me | 获取当前用户 |
| GET | /api/scenes | 获取场景列表 |
| POST | /api/dialogue/start/stream | 开始对话 (SSE) |
| POST | /api/dialogue/submit/workflow/stream | 提交回复 (SSE) |
| GET | /api/dialogue/history | 获取练习历史 |
| GET | /api/read-aloud/scenes | 获取跟读场景列表 |
| GET | /api/read-aloud/scenes/:id | 获取跟读场景详情 |
| POST | /api/read-aloud/submit | 提交跟读录音评分 |
| POST | /api/read-aloud/save-result | 保存评分结果 |

### 管理后台 API (需要 TEACHER/ADMIN 角色)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/admin/stats | 获取统计数据 |
| GET | /api/admin/students | 获取学生列表 |
| GET | /api/admin/students/:id | 获取学生详情及成绩 |
| GET | /api/admin/read-aloud-records | 获取跟读记录列表 |
| GET | /api/admin/read-aloud-scenes | 获取跟读场景列表 |
| POST | /api/admin/read-aloud-scenes | 创建跟读场景 |
| PUT | /api/admin/read-aloud-scenes/:id | 更新跟读场景 |
| DELETE | /api/admin/read-aloud-scenes/:id | 删除跟读场景 |
| GET | /api/admin/scenes | 获取对话场景列表 |
| POST | /api/admin/scenes | 创建对话场景 |
| PUT | /api/admin/scenes/:id | 更新对话场景 |
| DELETE | /api/admin/scenes/:id | 删除对话场景 |

## 🎨 界面预览

### 学生端
- **首页**：场景选择卡片，展示各种对话和跟读场景
- **对话页**：聊天界面 + 可爱的动物助手动画
- **跟读页**：句子朗读练习 + 语音评分反馈
- **评分页**：星级评分 + 分项得分 + 鼓励评语

### 管理后台
- **仪表盘**：数据统计卡片 + 快速操作入口
- **学生管理**：学生列表 + 详情弹窗 + 进步追踪
- **跟读记录**：练习记录表格 + 筛选过滤
- **场景管理**：跟读/对话场景卡片 + 编辑操作

## 🚀 生产部署

详细部署指南请参考：[deploy/DEPLOYMENT.md](deploy/DEPLOYMENT.md)

### 部署架构
```
                    ┌─────────────────┐
                    │     Nginx       │
                    │  (SSL/反向代理)  │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Frontend    │   │    Backend    │   │    Admin      │
│  (静态文件)    │   │  (Node.js)    │   │   (静态文件)   │
│  /teacher-test│   │ :3001 内网    │   │/teacher-admin │
└───────────────┘   └───────┬───────┘   └───────────────┘
                            │
                    ┌───────┴───────┐
                    │               │
                    ▼               ▼
            ┌───────────┐   ┌───────────┐
            │   MySQL   │   │   Agent   │
            │   :3306   │   │   :8000   │
            └───────────┘   └───────────┘
```

### 快速部署（手动）
```bash
# 1. 生成密钥
openssl rand -base64 48  # JWT_SECRET
openssl rand -hex 32     # AGENT_API_KEY

# 2. 构建
pnpm build

# 3. 使用 PM2 启动
pm2 start backend/dist/index.js --name backend
pm2 start agent/dist/index.js --name agent
```

### 🔄 GitHub Actions 自动部署（CI/CD）

本项目支持通过 GitHub Actions 实现**推送即部署**：

1. Fork 本仓库
2. 在 **Settings → Secrets and variables → Actions** 中配置以下 Secrets：

| Secret | 说明 |
|--------|------|
| `SERVER_HOST` | 服务器 IP |
| `SERVER_SSH_KEY` | SSH 私钥 |
| `DOCKER_PASSWORD` | Docker Hub Token |
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码 |
| `MYSQL_PASSWORD` | MySQL 应用密码 |
| `JWT_SECRET` | JWT 签名密钥 |
| `AGENT_API_KEY` | Agent API 密钥 |
| `DASHSCOPE_API_KEY` | 阿里云 AI API Key |

3. 在 **Variables** 中添加 `DOCKER_USERNAME`（你的 Docker Hub 用户名）
4. 推送代码到 `master` 分支即可自动部署 🚀

👉 **完整配置指南**：[deploy/DEPLOYMENT.md](deploy/DEPLOYMENT.md#-github-actions-自动部署cicd)

## 📖 文档

- [⚡ 快速上手](QUICK_START.md) - **新人必看！5 分钟跑起来**
- [测试指南](docs/TESTING_GUIDE.md) - 功能测试清单和常见问题排查
- [开发指南](docs/DEVELOPMENT_GUIDE.md) - 本地开发和部署流程
- [部署指南](deploy/DEPLOYMENT.md) - 详细的生产部署说明
- [CVM 部署指南](deploy/CVM-DEPLOYMENT.md) - 腾讯云 CVM Docker 部署

## 📋 更新日志

### 2026-03-03
- ✨ **朗读评分系统优化**：评分维度从 7 个简化为 4 个核心维度
  - 语音语调、流利连贯、准确完整、情感表现力
  - 评分标准从 100 分制改为 1-5 星制，更加直观
- 🔧 前端页面语言标签修正为 `zh-CN`
- 🔒 SSL 证书配置优化（Let's Encrypt）

### 2026-02-28
- ✨ 新增钉钉机器人通知功能
- 📊 管理后台进步追踪功能完善
- 🎨 学生端 UI/UX 优化

## 📝 License

MIT
