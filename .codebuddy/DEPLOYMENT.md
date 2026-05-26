# 部署指南

## 部署方式

**GitHub Actions CI/CD** → 推送 master 分支自动触发部署

## CI/CD 流程

```
git push origin master
        │
        ▼
┌─────────────────────────────────────────────┐
│  GitHub Actions: .github/workflows/deploy.yml│
├─────────────────────────────────────────────┤
│                                              │
│  1. detect-changes (检测哪些服务有改动)       │
│     ├── backend/ 改了 → build-backend        │
│     ├── frontend/admin/nginx 改了 → build-frontend │
│     └── agent/ 改了 → build-agent            │
│                                              │
│  2. build-* (并行构建 Docker 镜像)            │
│     → docker buildx + GitHub Actions cache   │
│     → push 到 Docker Hub                     │
│                                              │
│  3. deploy (SSH 到服务器)                     │
│     → 同步 docker-compose.prod.yml           │
│     → 生成 .env (从 Secrets)                 │
│     → docker compose pull                    │
│     → 只重启有更新的服务                      │
│     → docker image prune                     │
│                                              │
│  4. notify (部署结果)                         │
└─────────────────────────────────────────────┘
```

## 触发条件

| 触发方式 | 说明 |
|---------|------|
| `push master` | 推送到 master 分支自动触发 |
| `workflow_dispatch` | GitHub UI 手动触发 |

## 增量构建

流水线会检测 git diff，只构建有改动的服务：

| 检测路径 | 触发构建 |
|---------|---------|
| `backend/`, `Dockerfile.backend`, `prisma/` | build-backend |
| `frontend/`, `admin/`, `homepage/`, `Dockerfile.nginx`, `deploy/nginx*` | build-frontend |
| `agent/`, `Dockerfile.agent` | build-agent |
| `docker-compose.prod.yml` | config 变更标记 |

## Docker 镜像

| 镜像 | Dockerfile | 内容 |
|------|-----------|------|
| `{DOCKER_USERNAME}/word-teacher-backend:latest` | Dockerfile.backend | Express + Prisma |
| `{DOCKER_USERNAME}/word-teacher-nginx:latest` | Dockerfile.nginx | Frontend + Admin + Nginx |
| `{DOCKER_USERNAME}/word-teacher-agent:latest` | Dockerfile.agent | AI Agent 服务 |

## GitHub Secrets 配置

在仓库 Settings → Secrets and variables → Actions 中配置：

### 服务器相关

| Secret | 说明 |
|--------|------|
| `SERVER_HOST` | 服务器 IP |
| `SERVER_SSH_KEY` | SSH 私钥 (root 用户) |

### Docker Hub

| Secret/Variable | 说明 |
|--------|------|
| `DOCKER_PASSWORD` | Docker Hub 密码/Token |
| `DOCKER_USERNAME` (variable) | Docker Hub 用户名 |

### 应用密钥

| Secret | 说明 |
|--------|------|
| `DASHSCOPE_API_KEY` | 阿里云 Dashscope API Key |
| `ALIYUN_STT_APPKEY` | 阿里云 STT AppKey |
| `ALIYUN_AK_ID` | 阿里云 AccessKey ID |
| `ALIYUN_AK_SECRET` | 阿里云 AccessKey Secret |
| `TENCENT_SECRET_ID` | 腾讯云 SOE SecretId |
| `TENCENT_SECRET_KEY` | 腾讯云 SOE SecretKey |
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码 |
| `MYSQL_PASSWORD` | MySQL 应用用户密码 |
| `JWT_SECRET` | JWT 签名密钥 |
| `AGENT_API_KEY` | Backend→Agent 认证密钥 |
| `MINIO_ROOT_PASSWORD` | MinIO 管理密码 |
| `SSL_FULLCHAIN` | SSL 证书全链 (PEM) |
| `SSL_PRIVKEY` | SSL 私钥 (PEM) |

## 服务器环境

- 腾讯云 CVM (推荐 2核4G+)
- Docker + Docker Compose
- 部署目录: `/root/word-teacher/`
- 开放端口: 80 (HTTPS), 8888 (管理后台)

## 服务器上的文件结构

```
/root/word-teacher/
├── docker-compose.prod.yml   # 由 CI/CD 自动同步
├── .env                      # 由 CI/CD 从 Secrets 自动生成
├── ssl/
│   ├── fullchain.pem         # SSL 证书
│   └── privkey.pem           # SSL 私钥
└── mysql-data/               # MySQL 数据卷 (持久化)
```

## 手动部署 / 运维

```bash
# SSH 到服务器
ssh root@<SERVER_HOST>
cd /root/word-teacher

# 查看服务状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs -f agent
docker compose -f docker-compose.prod.yml logs -f backend

# 手动重启某个服务
docker compose -f docker-compose.prod.yml restart agent

# 手动拉取并更新
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 数据库操作
docker compose -f docker-compose.prod.yml exec backend npx prisma db push
docker compose -f docker-compose.prod.yml exec backend npx prisma studio
```

## 部署新的腾讯云 SOE 密钥

SOE 密钥需要加到两个地方：

1. **GitHub Secrets**（CI/CD 部署时自动写入服务器 .env）:
   - 添加 `TENCENT_SECRET_ID` 和 `TENCENT_SECRET_KEY`

2. **deploy.yml 的 env 和 script**（需要修改流水线）:
   - 在 `Deploy via SSH` step 的 `env` 中添加
   - 在 `script` 的 .env 生成部分添加对应行

3. **docker-compose.prod.yml**（Agent 容器的环境变量）:
   - 确保 Agent 服务能读到这两个变量

## 本地脚本

```bash
./scripts/deploy.sh build      # 本地构建镜像
./scripts/deploy.sh up         # 本地启动生产环境
./scripts/deploy.sh down       # 停止
./scripts/deploy.sh logs       # 查看日志
./scripts/deploy.sh db-init    # 首次初始化数据库
./scripts/deploy.sh ssl        # 申请 SSL 证书
```

## 注意事项

1. **只有 master 分支触发部署** - 开发用 feature 分支，合并到 master 才会上线
2. **增量更新** - 只有改动的服务才会重新构建和重启，减少停机时间
3. **Secrets 安全** - 所有密钥通过 GitHub Secrets 管理，不进入代码仓库
4. **SSL 证书** - 通过 Secrets 写入，也可以用 certbot 自动续签
5. **数据库迁移** - Prisma schema 改动后，CI/CD 不会自动执行 db push，需要手动 SSH 执行
