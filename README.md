# Word Teacher AI 英语口语训练

**AI 英语口语训练 | AI English Speaking Practice**

[English](README_EN.md) | 中文

通过 **AI 对话 + 跟读练习 + 单词游戏 + 语音识别 + 智能评分**，让英语口语练习更轻松高效。

Practice English speaking with **AI conversations + read-aloud + word games + speech recognition + smart scoring**.

## 📸 产品截图

学生登录
![登录](docs/images/login.png)

场景选择
![场景](docs/images/scenes.png)

AI 对话
![对话](docs/images/dialogue.png)

跟读练习
![对话](docs/images/readAndAloud.png)

评分反馈
![对话](docs/images/exam.png)

钉钉反馈通知
![对话](docs/images/dingding.png)

学生个人主页
![对话](docs/images/user.png)

管理后台
![对话](docs/images/admin.png)

管理场景
![对话](docs/images/adminScene.png)

管理班级
![对话](docs/images/adminClassroom.png)

管理教师
![对话](docs/images/adminTeacher.png)

管理学生进度
![对话](docs/images/adminProgress.png)

查看学生记录
![对话](docs/images/adminRecords.png)

学生进度分析
![对话](docs/images/adminAnalyze.png)

有趣的单词游戏
![对话](docs/images/playground.png)

保卫城堡
![对话](docs/images/protectCastle.png)

美食餐车
![对话](docs/images/deliciousFoodCar.png)

魔法配对
![对话](docs/images/magicMatch.png)

钉钉游戏通知
![对话](docs/images/dingdingGameNotification.png)

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

#### 🎮 单词游戏
通过 4 种趣味小游戏帮助学生记忆单词，寓教于乐：

- **🎯 单词射击 (Word Shooter)**：射击飞行的单词气泡，锻炼反应和词汇辨识
- **🍳 美食餐车 (Spell)**：NPC 顾客点单，学生拼写单词"出餐"，答对开心答错生气
- **⛏️ 黄金矿工 (Miner)**：控制矿工挖取单词宝石，在游戏中积累词汇
- **🃏 魔法配对 (Match)**：4×3 记忆配对游戏，匹配英文单词和中文释义

**游戏特色**：
- 每种游戏都有专属背景音乐（Web Audio API 程序化生成）
- 支持连击计分、错误追踪
- 游戏结果自动保存 + 钉钉通知老师
- 教师可在后台管理词包、查看游戏记录

### 👩‍🏫 教师管理后台

#### 🤖 AI 智能助手
- **自然语言查数据**：直接用中文提问，如"查看各班学生数量"、"哪些学生最近没练习？"
- **Excel 导出**：对话式导出，如"导出本月学习记录"，AI 自动生成 Excel 并提供下载链接
- **数据可视化**：AI 自动将查询结果用图表（柱状图、折线图、饼图）展示
- **系统使用问答**：不知道怎么操作？直接问 AI，如"怎么创建跟读场景？"、"怎么批量导入学生？"
- **知识库驱动**：基于向量搜索的知识库系统，管理员可维护操作指引和 FAQ
- **MCP 工具集成**：内置数据库查询、知识搜索、班级分析、密码重置等 10+ 个智能工具

#### 📊 数据仪表盘
- 学生总数、教师总数、班级总数统计
- 今日/本周练习数量统计
- 跟读完成情况和平均分
- 快速操作入口（含 AI 助手入口）

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

#### 🎮 词包与游戏管理
- **词包管理**：创建/编辑/删除单词包，按游戏类型分类
- **单词编辑**：为词包添加英文、中文、音标、难度等级
- **游戏记录**：查看学生各游戏的完成记录和得分
- **错题追踪**：查看学生拼错的单词列表

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
│   └── src/games/     # 单词游戏模块 (shooter/spell/miner/match)
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
- **Web Audio API** 录音功能 + 游戏音效/BGM 程序化生成
- **SSE (Server-Sent Events)** 流式响应
- **Canvas 2D** 游戏渲染（射击、矿工）

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
```

**必须修改的变量**：

| 文件 | 变量 | 说明 |
|------|------|------|
| `agent/.env` | `DASHSCOPE_API_KEY` | 阿里云百炼 API Key（AI 对话核心） |
| `backend/.env` | `AI_API_KEY` | 同上，用于 AI 助手知识库向量化 |

**可选变量**（按需启用）：

| 文件 | 变量 | 说明 |
|------|------|------|
| `agent/.env` | `XFYUN_APP_ID` / `XFYUN_API_KEY` / `XFYUN_API_SECRET` | 科大讯飞语音评测（跟读评分） |
| `agent/.env` | `ALIYUN_STT_APPKEY` / `ALIYUN_AK_ID` / `ALIYUN_AK_SECRET` | 阿里云语音识别（对话输入） |
| `backend/.env` | `DINGTALK_BOT_APP_KEY` / `DINGTALK_BOT_APP_SECRET` | 钉钉 AI 客服机器人 |
| `backend/.env` | `DINGTALK_ACCESS_TOKEN` / `DINGTALK_SECRET` | 钉钉通知机器人 |

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
| GET | /api/word-packs | 获取单词包列表 |
| GET | /api/word-packs/:id | 获取单词包详情 |
| POST | /api/word-game/result | 上报游戏结果 |

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
| GET | /api/admin/word-packs | 获取词包列表 |
| POST | /api/admin/word-packs | 创建词包 |
| PUT | /api/admin/word-packs/:id | 更新词包 |
| DELETE | /api/admin/word-packs/:id | 删除词包 |
| GET | /api/admin/word-game-records | 获取游戏记录 |

## 🎨 界面预览

### 学生端
- **首页**：场景选择卡片，展示各种对话和跟读场景
- **对话页**：聊天界面 + 可爱的动物助手动画
- **跟读页**：句子朗读练习 + 语音评分反馈
- **评分页**：星级评分 + 分项得分 + 鼓励评语

### 管理后台
- **仪表盘**：数据统计卡片 + 快速操作入口 + AI 助手入口
- **AI 助手**：自然语言对话 + 数据查询 + Excel 导出 + 图表可视化
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

本项目支持通过 GitHub Actions 实现**推送即部署**，镜像通过腾讯云 TCR（容器镜像服务）分发，国内服务器拉取秒级完成：

```
GitHub Actions 构建镜像 → 推送到腾讯云 TCR → 服务器内网拉取（秒级） → 蓝绿部署
```

1. Fork 本仓库
2. 在 **Settings → Secrets and variables → Actions** 中配置以下 Secrets：

| Secret | 说明 | 必须 |
|--------|------|------|
| `SERVER_HOST` | 服务器 IP | ✅ |
| `SERVER_SSH_KEY` | SSH 私钥 | ✅ |
| `TCR_USERNAME` | 腾讯云 TCR 用户名（腾讯云账号 ID） | ✅ |
| `TCR_PASSWORD` | 腾讯云 TCR 密码 | ✅ |
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码 | ✅ |
| `MYSQL_PASSWORD` | MySQL 应用密码 | ✅ |
| `JWT_SECRET` | JWT 签名密钥 | ✅ |
| `AGENT_API_KEY` | Agent API 密钥 | ✅ |
| `DASHSCOPE_API_KEY` | 阿里云 AI API Key（对话 + Embedding） | ✅ |
| `MINIO_ROOT_PASSWORD` | MinIO 管理员密码 | ✅ |
| `ALIYUN_AK_ID` | 阿里云 AccessKey ID（语音识别） | 可选 |
| `ALIYUN_AK_SECRET` | 阿里云 AccessKey Secret | 可选 |
| `XFYUN_API_KEY` | 科大讯飞 API Key（语音评测） | 可选 |
| `XFYUN_API_SECRET` | 科大讯飞 API Secret | 可选 |
| `DINGTALK_ACCESS_TOKEN` | 钉钉通知机器人 Token | 可选 |
| `DINGTALK_SECRET` | 钉钉通知机器人签名密钥 | 可选 |

3. 在 **Variables** 中添加：

| Variable | 说明 |
|----------|------|
| `DOCKER_USERNAME` | Docker Hub 用户名 |
| `TCR_NAMESPACE` | 腾讯云 TCR 命名空间（默认 `word-teacher`） |
| `ALIYUN_STT_APPKEY` | 阿里云语音识别 AppKey |
| `XFYUN_APP_ID` | 科大讯飞应用 ID |

4. 推送代码到 `master` 分支即可自动部署 🚀

👉 **完整配置指南**：[deploy/DEPLOYMENT.md](deploy/DEPLOYMENT.md#-github-actions-自动部署cicd)

## 📖 文档

- [⚡ 快速上手](QUICK_START.md) - **新人必看！5 分钟跑起来**
- [测试指南](docs/TESTING_GUIDE.md) - 功能测试清单和常见问题排查
- [开发指南](docs/DEVELOPMENT_GUIDE.md) - 本地开发和部署流程
- [部署指南](deploy/DEPLOYMENT.md) - 详细的生产部署说明
- [CVM 部署指南](deploy/CVM-DEPLOYMENT.md) - 腾讯云 CVM Docker 部署

## 📋 更新日志

### 2026-06-23
- 🚀 **CI/CD 全面升级**
  - 蓝绿部署：新增 canary 容器验证机制，新镜像先冒烟测试再切换，失败自动回退保留旧容器
  - 镜像分发迁移至腾讯云 TCR，服务器内网拉取秒级完成（去掉 Docker Hub 公网推送）
  - 部署脚本新增分步耗时统计，每次部署自动打印各阶段耗时（初始化、SSL、拉镜像、蓝绿部署、DB 同步等）
  - Docker pull 添加重试机制，应对国内网络波动
  - 部署超时从 10 分钟调整到 20 分钟
  - workflow/compose 文件变更时自动触发全量构建
- 📊 **管理后台仪表盘增强**
  - 新增 AI 服务连通性检查面板（DashScope、阿里云语音识别、讯飞语音评测、MinIO 一目了然）
  - 新增服务器指标监控（CPU、内存、磁盘）
  - 新增更新日志页面（自动从 Git 提交历史读取）
  - 新增在线人数实时统计
- 🎙️ **讯飞 ISE 账号池管理**
  - 支持多账号轮转（`XFYUN_ISE_ACCOUNTS` 环境变量配置多组凭证）
  - 仪表盘展示各账号实时状态和用量
- 🛠️ **AI 助手工具增强**
  - 新增 `modifyExcel` 工具：支持修改已导出的 Excel（改列名、删列、排序、筛选、合并 Sheet 等 10 种操作）
  - 完整测试覆盖（18 个测试用例）
- 📝 **日志系统优化**
  - Backend/Agent 日志模块化分类
  - Admin 后台新增日志查询页面
- 🐛 **Bug 修复**
  - 修复 Nginx rewrite break 导致 backend upstream 未初始化返回 500
  - 修复 backend 容器缺少 AI 服务凭证导致健康检查面板全红
  - 修复 canary 容器缺少硬编码环境变量（AGENT_URL、MINIO_ENDPOINT 等）
  - 修复 Dockerfile.backend 缺少 openssl + /app/tmp 目录
  - 修复 agent health 端点认证拦截问题
  - 添加 husky pre-commit hook（tsc 类型检查）

### 2026-06-22
- 🤖 **AI 智能助手**：管理后台新增 AI 助手功能
  - 自然语言查数据（AI 自动生成 SQL 查询）
  - 对话式 Excel 导出（一句话生成报表并提供下载链接）
  - ECharts 数据可视化（AI 自动选择合适的图表类型）
  - 系统使用问答（基于向量知识库的智能检索）
  - MCP 工具测试台（管理员可调试 AI 工具调用）
  - 10+ 内置工具：数据库查询、知识搜索、班级分析、密码重置等

### 2026-05-28
- 🎮 **单词游戏系统**：全新上线 4 种单词小游戏
  - 🎯 单词射击 (Word Shooter) - Canvas 射击游戏
  - 🍳 美食餐车 (Spell) - NPC 互动拼写游戏
  - ⛏️ 黄金矿工 (Miner) - 矿洞冒险挖词
  - 🃏 魔法配对 (Match) - 4×3 记忆配对
- 🎵 各游戏专属背景音乐（Web Audio API 程序化生成，无需音频文件）
- 📦 词包管理系统（后台 CRUD + 按游戏类型分类）
- 📊 游戏记录追踪 + 错题统计
- 🔔 钉钉通知集成游戏结果
- 🗄️ CI/CD 流水线自动同步数据库结构

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
