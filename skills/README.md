# Word Teacher 项目技能文档

## 📚 Skill 索引

| Skill 文件 | 用途 |
|------------|------|
| [word-teacher-dev.md](./word-teacher-dev.md) | **项目开发 SOP**（快速命令、结构、工作流） |
| [troubleshooting.md](./troubleshooting.md) | **问题排查 SOP**（日志定位、错误速查、决策树） |
| [server-troubleshooting.md](./server-troubleshooting.md) | **服务器排查 SOP**（容器管理、流水线调试、蓝绿部署） |
| [local-dev.md](./local-dev.md) | 本地开发详细指南 |
| [deploy.md](./deploy.md) | 部署流程 |
| [online-test.md](./online-test.md) | 线上测试 |
| [development-notes.md](./development-notes.md) | 开发经验备忘 |

---

## 项目简介

Word Teacher 是一个儿童英语口语训练平台，支持 AI 对话、跟读练习、单词游戏三种模式。

### 核心功能

- **AI 对话练习**: 与 AI 老师进行情景对话，实时评分
- **跟读练习 (Read Aloud)**: 教师创建跟读场景，AI 评估发音
- **单词游戏**: 射击/配对/拼写三种游戏模式
- **教师管理后台**: 管理场景、学生、班级、查看数据分析
- **AI 教师助手**: MCP 工具驱动的智能助手，支持数据查询和内容管理

### 技术栈

| 层级 | 技术 |
|------|------|
| Frontend | React 19 + TypeScript + Vite 7 + Phaser (游戏) |
| Admin | React 19 + Ant Design 6 + ECharts |
| Backend | Express 5 + TypeScript + Prisma |
| Agent | Vercel AI SDK + LangChain + OpenAI |
| Database | MySQL 8.0 |
| Object Storage | MinIO |
| AI 服务 | DeepSeek (文本), Azure Speech (TTS), 讯飞 (评测) |
| 部署 | Docker + GitHub Actions + Cloudflare Tunnel |

---

## 快速开始

```bash
# 一键启动开发环境
./scripts/dev-start.sh

# 重置测试数据
./scripts/seed-dev.sh

# 停止
./scripts/dev-start.sh --stop
```

详细开发指南见 [word-teacher-dev.md](./word-teacher-dev.md)

---

## 部署流程

详见 [deploy.md](./deploy.md)

---

## 开发经验与注意事项

详见 [development-notes.md](./development-notes.md)

