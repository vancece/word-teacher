# 🚀 5 分钟快速上手指南

本指南帮助你在 5 分钟内运行起这个项目。

## 📋 前置条件

在开始之前，请确保你的电脑已安装：

| 软件 | 版本要求 | 检查命令 | 安装方式 |
|------|----------|----------|----------|
| Node.js | >= 18 | `node -v` | [nodejs.org](https://nodejs.org/) |
| pnpm | >= 8 | `pnpm -v` | `npm install -g pnpm` |
| Docker | 最新版 | `docker -v` | [docker.com](https://www.docker.com/) |

## 🔑 第一步：申请阿里云 API Key（必须）

项目使用阿里云通义千问大模型，需要先申请 API Key。

### 1. 申请 DashScope API Key

1. 访问 [阿里云百炼控制台](https://bailian.console.aliyun.com/)
2. 登录/注册阿里云账号
3. 点击右上角头像 → **API-KEY 管理**
4. 点击 **创建新的 API-KEY**
5. 复制保存，格式类似：`sk-xxxxxxxxxxxxxxxx`

> 💡 **新用户福利**：阿里云提供免费额度，足够开发测试使用

### 2.（可选）申请语音识别 AppKey

如果需要更低成本的语音识别，可以申请阿里云智能语音交互：

1. 访问 [智能语音控制台](https://nls-portal.console.aliyun.com/)
2. 创建项目 → 获取 AppKey
3. 不申请也可以，系统会 fallback 到 Qwen-Omni

## 📦 第二步：克隆并安装

```bash
# 1. 克隆项目
git clone https://github.com/YOUR_USERNAME/word-teacher.git
cd word-teacher

# 2. 安装所有依赖（约 2 分钟）
pnpm install
```

## ⚙️ 第三步：配置环境变量

```bash
# 1. 复制配置模板
cp backend/.env.example backend/.env
cp agent/.env.example agent/.env

# 2. 编辑 agent/.env，填入你的 API Key
# 找到这一行，替换为你的真实 Key：
# DASHSCOPE_API_KEY=your-dashscope-api-key
```

**最小配置**（只需改这一个）：

```bash
# agent/.env
DASHSCOPE_API_KEY=sk-你的真实apikey
```

## 🐳 第四步：启动数据库

```bash
# 使用 Docker 一键启动 MySQL
docker compose -f docker-compose.dev.yml up -d mysql

# 等待 10 秒让数据库完全启动
sleep 10

# 初始化数据库结构和测试数据
cd backend
pnpm db:push
pnpm db:seed
cd ..
```

## 🎉 第五步：启动项目

```bash
# 一键启动所有服务
pnpm dev
```

启动成功后，打开浏览器访问：

| 服务 | 地址 | 说明 |
|------|------|------|
| 🎓 学生端 | http://localhost:5173 | 学生练习界面 |
| 👩‍🏫 管理后台 | http://localhost:5174/teacher-admin | 教师管理界面 |

## 🔐 测试账号

| 角色 | 账号 | 密码 |
|------|------|------|
| 管理员 | `admin` | `123456` |
| 教师 | `xiaomei` | `123456` |
| 学生 | `2026050101` | `123456` |

## ✅ 验证是否成功

1. 打开 http://localhost:5173
2. 用学生账号 `2026050101` / `123456` 登录
3. 选择一个对话场景
4. 点击麦克风说英语，AI 会回复你

如果 AI 能正常回复，恭喜你，项目运行成功！🎉

---

## ❓ 常见问题

### Q: 启动时报错 "DASHSCOPE_API_KEY is required"
**A:** 你没有配置 API Key。编辑 `agent/.env`，填入你的阿里云 API Key。

### Q: 数据库连接失败
**A:** 确保 Docker 已启动，运行 `docker ps` 检查 MySQL 容器是否在运行。

### Q: AI 对话没有声音
**A:** 检查浏览器是否允许自动播放音频。点击页面任意位置后再试。

### Q: 端口被占用
**A:** 修改对应服务的端口配置，或关闭占用端口的程序。

### Q: pnpm install 很慢
**A:** 使用国内镜像：
```bash
pnpm config set registry https://registry.npmmirror.com
```

### Q: Mac M1/M2 芯片 Docker 问题
**A:** 确保 Docker Desktop 已开启 Rosetta 模拟，或使用 `--platform linux/amd64`。

---

## 📚 下一步

- 阅读 [README.md](README.md) 了解完整功能
- 阅读 [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) 了解开发细节
- 阅读 [deploy/DEPLOYMENT.md](deploy/DEPLOYMENT.md) 了解生产部署

## 🤝 遇到问题？

如果按照本指南操作仍有问题，请：
1. 检查 Node.js 版本是否 >= 18
2. 检查 API Key 是否正确配置
3. 查看终端报错信息
4. 提交 Issue 并附上报错截图

