# Word Teacher 项目技能文档

## 项目简介

Word Teacher 是一个儿童英语学习平台，帮助孩子通过跟读练习学习英语。

### 核心功能

- **跟读场景 (Read Aloud Scenes)**: 教师创建跟读场景，包含封面图片和句子列表
- **教师管理后台 (teacher-admin)**: 教师管理场景、句子、班级、学生进度
- **学生端 (student-h5)**: 学生进行跟读练习，AI 评分
- **AI Agent**: 使用 AI 自动生成学习内容

### 技术栈

| 层级 | 技术 |
|------|------|
| Frontend | React + TypeScript + Vite + Ant Design |
| Backend | NestJS + TypeScript + Prisma |
| Database | MySQL 8.0 |
| Object Storage | MinIO |
| AI 服务 | Azure Speech (语音), DeepSeek API (文本生成) |
| 部署 | Docker + Cloudflare Tunnel |

---

## 服务器信息

| 项目 | 值 |
|------|-----|
| IP | `YOUR_SERVER_IP` |
| 用户 | `root` |
| SSH 密钥 | `~/.ssh/word-teacher.pem` (不要提交到 Git!) |
| Docker 网络 | `word-teacher_word-teacher-network` |

### SSH 密钥配置

⚠️ **SSH 密钥不要放在项目目录中，也不要提交到 Git！**

推荐放在 `~/.ssh/word-teacher.pem`，或者通过环境变量指定：

```bash
export DEPLOY_SSH_KEY=~/.ssh/your-key.pem
```

### SSH 连接

```bash
ssh -i ~/.ssh/word-teacher.pem root@YOUR_SERVER_IP
# 或使用部署脚本
./scripts/deploy-remote.sh ssh
```

---

## 服务器容器架构

| 容器名 | 镜像 | 端口 | 说明 |
|--------|------|------|------|
| word-teacher-backend | YOUR_DOCKERHUB/word-teacher-backend | 3001 内部 | 后端 API |
| word-teacher-nginx | YOUR_DOCKERHUB/word-teacher-nginx | 80, 443 | Nginx + 前端静态文件 |
| word-teacher-agent | YOUR_DOCKERHUB/word-teacher-agent | 3002 内部 | AI Agent 服务 |
| word-teacher-minio | minio/minio | 9000, 9001 | 对象存储 |
| word-teacher-mysql | mysql:8.0 | 3306 内部 | 数据库 |
| cloudflared | cloudflare/cloudflared | - | Cloudflare Tunnel |

### 查看容器状态

```bash
ssh -i ~/.ssh/word-teacher.pem root@YOUR_SERVER_IP "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
```

### 查看 Cloudflare Tunnel 域名

```bash
ssh -i ~/.ssh/word-teacher.pem root@YOUR_SERVER_IP "docker logs cloudflared 2>&1 | grep trycloudflare"
```

---

## Backend 环境变量

```bash
DATABASE_URL=mysql://wordteacher:change_this_app_password_456@mysql:3306/word_teacher
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=admin
MINIO_SECRET_KEY=minio123456
MINIO_BUCKET=covers
MINIO_PUBLIC_PATH=/minio
JWT_SECRET=word-teacher-jwt-secret-key-2024
AZURE_SPEECH_KEY=CPRTrXxP01AN8CdRgkSyedMSqkXKYdLFkcWAy2gL9GxepPjiJ8UKJQQJ99BEACHYHv6XJ3w3AAAYACOGwaNe
AZURE_SPEECH_REGION=eastasia
DEEPSEEK_API_KEY=sk-qpm7v1t3dvgmrhtqp9dccwh8hv2axqqw9ahnfjhc8ephgyla
```

---

## 部署流程

详见 [deploy.md](./deploy.md)

---

## 开发经验与注意事项

详见 [development-notes.md](./development-notes.md)

