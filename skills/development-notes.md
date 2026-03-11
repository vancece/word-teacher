# 开发经验与注意事项

## 图片/文件 URL 处理

### ⚠️ 重要：不要使用绝对 URL

MinIO 返回的文件 URL 必须是**相对路径**，不能包含硬编码的域名。

**错误示例**:
```
http://YOUR_SERVER_IP/minio/covers/xxx.png
```

**正确示例**:
```
/minio/covers/xxx.png
```

### 原因

服务可能通过 Cloudflare Tunnel 或其他方式暴露，域名可能是动态的。
如果 URL 包含硬编码域名，在不同域名访问时图片会加载失败。

### 相关代码

`backend/src/common/minio/minio.service.ts` 中的 `getFileUrl()` 方法应返回相对路径：

```typescript
getFileUrl(objectName: string): string {
  const publicPath = this.configService.get('MINIO_PUBLIC_PATH') || '/minio';
  const bucket = this.configService.get('MINIO_BUCKET');
  return `${publicPath}/${bucket}/${objectName}`;
}
```

---

## Prisma 多数据库支持

项目同时支持 MySQL 和 PostgreSQL。

### 本地开发 (PostgreSQL)

```bash
DATABASE_URL=postgresql://word_teacher:abc771219@localhost:5432/word_teacher?schema=public
```

### 生产环境 (MySQL)

```bash
DATABASE_URL=mysql://wordteacher:change_this_app_password_456@mysql:3306/word_teacher
```

### 切换数据库

修改 `backend/prisma/schema.prisma`:

```prisma
datasource db {
  provider = "mysql"  // 或 "postgresql"
  url      = env("DATABASE_URL")
}
```

然后重新生成 Prisma Client:

```bash
cd backend && pnpm db:generate
```

---

## 常见问题

### 1. 图片显示损坏/404

**可能原因 1**: MinIO URL 使用了错误的域名
**解决**: 检查 `minio.service.ts` 返回相对路径

**可能原因 2**: Nginx 8080 端口缺少 `/minio/` 代理配置
**解决**: 确保 `deploy/nginx-docker.conf` 中的 HTTP 8080 default_server 块包含：
```nginx
location /minio/ {
    rewrite ^/minio/(.*)$ /$1 break;
    proxy_pass http://minio;
    ...
}
```
⚠️ 注意：Cloudflare Tunnel 使用 8080 端口，必须在这个端口配置 MinIO 代理！

### 2. Docker 镜像在服务器无法运行

**原因**: Mac M 系列芯片构建的是 arm64 架构
**解决**: 构建时指定 `--platform linux/amd64`

### 3. 数据库连接失败

**原因**: Docker 网络不正确
**解决**: 使用 `docker-compose` 部署，不要手动 `docker run`

### 4. SSH 连接失败

**原因**: 未指定密钥文件
**解决**: 使用 `-i julian.pem` 参数

### 5. 跟读评分 500 错误 ⭐

**原因**: `AGENT_URL` 环境变量未设置或错误
**解决**: 使用 `docker-compose` 部署！它会自动设置 `AGENT_URL=http://agent:3002/api/agent`

如果手动部署，必须设置：
```bash
-e AGENT_URL="http://word-teacher-agent:3002/api/agent"
```

### 6. 服务之间无法通信

**原因**: 容器不在同一网络
**解决**: 使用 `docker-compose` 部署，所有服务自动在 `word-teacher-network` 中

### 7. Docker 构建使用了缓存，代码没更新 ⭐

**原因**: Docker 层缓存导致新代码没有被包含
**解决**:
```bash
# 使用无缓存构建
./scripts/deploy-remote.sh backend-clean

# 或手动
docker build --no-cache --platform linux/amd64 -t YOUR_DOCKERHUB/word-teacher-backend:latest -f Dockerfile.backend .
```

### 8. docker compose 使用了旧镜像 ⭐

**原因**: 服务器上 `.env` 文件中 `IMAGE_TAG` 写死了旧的 tag
**解决**:
```bash
# 检查并修复
./scripts/deploy-remote.sh ssh
vim /root/word-teacher/.env
# 确保 IMAGE_TAG=latest
```

---

## 本地开发

### 前置条件

1. Node.js 18+
2. 本地 PostgreSQL 或 MySQL
3. 本地 MinIO (可选，如果需要测试图片上传)

### 配置文件

确保以下配置文件存在：

```bash
# Backend 配置
backend/.env

# 内容示例:
DATABASE_URL="postgresql://word_teacher:abc771219@localhost:5432/word_teacher?schema=public"
JWT_SECRET="local-dev-secret-key"
MINIO_PUBLIC_PATH=/minio
```

### 启动服务

```bash
# 方式 1: 使用 Docker Compose (推荐)
docker-compose up -d

# 方式 2: 单独启动各服务
# 终端 1 - Backend
cd backend && pnpm install && pnpm dev

# 终端 2 - Frontend (学生端)
cd frontend && pnpm install && pnpm dev

# 终端 3 - Admin (教师端)
cd admin && pnpm install && pnpm dev
```

### 本地开发代理配置

`frontend/vite.config.js` 已配置代理：
- `/api` → `http://localhost:3001` (Backend)
- `/minio` → `http://localhost:9000` (MinIO)

### 数据库初始化

```bash
cd backend

# 生成 Prisma Client
npx prisma generate

# 推送 Schema 到数据库
npx prisma db push

# 查看数据库 (可选)
npx prisma studio
```

---

## API 接口

### 健康检查

```
GET /api/health
```

### 场景列表

```
GET /api/scenes
```

### 创建场景

```
POST /api/scenes
Content-Type: application/json

{
  "name": "场景名称",
  "description": "描述",
  "coverUrl": "/minio/covers/xxx.png"
}
```

---

## 日志格式

Backend 使用 Pino 日志，JSON 格式：

```json
{"level":30,"time":1772693454020,"env":"production","module":"database","msg":"Database connected successfully"}
```

日志级别: 10=trace, 20=debug, 30=info, 40=warn, 50=error

