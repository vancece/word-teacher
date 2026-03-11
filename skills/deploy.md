# 部署指南

## 🚀 自动部署 (GitHub Actions)

**推送到 `main` 分支会自动触发部署！**

```bash
git add .
git commit -m "feat: your changes"
git push origin main
# 自动触发: 构建 → 推送 Docker Hub → 部署到服务器
```

### 配置 GitHub Secrets

在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加：

| Secret 名称 | 说明 |
|------------|------|
| `DOCKER_PASSWORD` | Docker Hub Token |
| `SERVER_HOST` | 服务器 IP (你的服务器地址) |
| `SERVER_SSH_KEY` | SSH 私钥内容（word-teacher.pem 的内容） |

### 查看部署状态

- GitHub → Actions 标签页查看部署日志
- 绿色 ✅ = 部署成功
- 红色 ❌ = 部署失败，查看日志排查

---

## ⭐ 手动部署脚本 (备用)

使用 `scripts/deploy-remote.sh` 脚本，一条命令完成部署！

```bash
# 部署 Backend
./scripts/deploy-remote.sh backend

# 强制无缓存重新构建 (解决缓存问题)
./scripts/deploy-remote.sh backend-clean

# 部署所有服务
./scripts/deploy-remote.sh all

# 数据库迁移
./scripts/deploy-remote.sh db-push

# 健康检查
./scripts/deploy-remote.sh health

# 查看状态
./scripts/deploy-remote.sh status
```

---

## 🔥 常见问题故障排除

### 问题 1: 部署后代码没更新

**症状**: 部署完成，但服务器上的代码还是旧的
**原因**: Docker 构建使用了缓存，或者 IMAGE_TAG 没有更新

**解决**:
```bash
# 使用无缓存构建
./scripts/deploy-remote.sh backend-clean
```

### 问题 2: 图片 404 (反复出现)

**症状**: `/minio/covers/xxx.png` 返回 404
**原因**: Nginx 8080 端口缺少 `/minio/` 代理配置

**检查**:
```bash
# 检查 nginx 配置是否有两个 /minio/ 块 (443 和 8080)
./scripts/deploy-remote.sh ssh
docker exec word-teacher-nginx cat /etc/nginx/nginx.conf | grep -c '/minio/'
# 应该返回 2
```

**解决**: 确保 `deploy/nginx-docker.conf` 在 HTTP 8080 块中有 `/minio/` 代理

### 问题 3: 数据库表没创建/没更新

**症状**: API 报错 "table doesn't exist"
**原因**: Prisma 迁移没有运行，或者 schema 没有更新

**解决**:
```bash
# 运行数据库迁移
./scripts/deploy-remote.sh db-push

# 如果表结构不对，重置数据库 (会清空数据!)
./scripts/deploy-remote.sh db-reset
./scripts/deploy-remote.sh seed
```

### 问题 4: 登录失败 "密码错误"

**症状**: 输入正确密码但无法登录
**原因**: 数据库中的密码 hash 无效

**解决**:
```bash
# 重新创建种子数据
./scripts/deploy-remote.sh seed
```

---

## 配置管理原则

⚠️ **所有配置都在服务器的 `.env` 文件中管理，不要在代码或命令中硬编码！**

### 服务器配置文件位置

| 文件 | 路径 | 说明 |
|------|------|------|
| docker-compose | `/root/word-teacher/docker-compose.prod.yml` | 服务定义 |
| 环境变量 | `/root/word-teacher/.env` | ⭐ 所有配置 |
| nginx 配置 | `/root/word-teacher/nginx.conf` | Nginx 配置 |
| SSL 证书 | `/root/word-teacher/ssl/` | HTTPS 证书 |

### 重要 .env 变量

```bash
# 必须设置为 latest，否则会使用旧镜像
IMAGE_TAG=latest

# MinIO 公开路径 (必须是相对路径)
MINIO_PUBLIC_PATH=/minio
```

### 修改配置

```bash
# SSH 到服务器
./scripts/deploy-remote.sh ssh

# 编辑配置
vim /root/word-teacher/.env

# 重启服务
cd /root/word-teacher && IMAGE_TAG=latest docker compose -f docker-compose.prod.yml up -d
```

---

## 部署 Checklist

在部署前，确保以下检查项通过：

- [ ] 本地 `npx tsc --noEmit` 编译通过
- [ ] 如果改了 schema，本地 `npx prisma generate` 成功
- [ ] 如果改了 nginx 配置，检查 8080 端口是否有 `/minio/` 代理
- [ ] 部署后运行 `./scripts/deploy-remote.sh health` 验证

---

## 为什么用 docker-compose？

| 手动 docker run | docker-compose |
|----------------|----------------|
| ❌ 需要记住所有环境变量 | ✅ 配置在 .env 文件中 |
| ❌ 容易遗漏 AGENT_URL | ✅ 自动从配置读取 |
| ❌ 网络/服务名容易错 | ✅ 服务名自动解析 |
| ❌ 每次输入长命令 | ✅ 一条命令部署 |

---

## 查看日志

```bash
# 使用部署脚本
./scripts/deploy-remote.sh logs backend
./scripts/deploy-remote.sh logs nginx
./scripts/deploy-remote.sh logs agent

# 或者手动
ssh -i ~/.ssh/word-teacher.pem root@YOUR_SERVER_IP "docker logs --tail 50 word-teacher-backend"
```

