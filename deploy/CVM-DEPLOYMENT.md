# Word Teacher CVM 部署清单

> 服务器 IP: `YOUR_SERVER_IP`
> 部署方式: Docker Compose
> 镜像仓库: Docker Hub (`your-dockerhub-username/word-teacher-*`)

---

## 📋 部署前准备

### 1. 服务器要求

- [x] 腾讯云 CVM (推荐 2核4G 以上)
- [x] Ubuntu 20.04+ 或 CentOS 7+
- [x] 开放端口: **80** (学生端), **8888** (管理后台)

### 2. 安全组配置

在腾讯云控制台 → 安全组 → 添加入站规则:

| 协议 | 端口 | 来源 | 说明 |
|------|------|------|------|
| TCP | 80 | 0.0.0.0/0 | 学生端前端 |
| TCP | 8888 | 0.0.0.0/0 | 管理后台 |

---

## 🚀 部署步骤

### 步骤 0: 服务器优化（小内存服务器推荐）

对于 2GB 内存的服务器，建议添加 Swap 防止内存不足：

```bash
# 创建 2GB Swap 文件
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 永久生效
echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab

# 优化 swap 使用策略（只在内存紧张时使用）
echo "vm.swappiness=10" | sudo tee /etc/sysctl.d/99-swap.conf
sudo sysctl -p /etc/sysctl.d/99-swap.conf

# 验证
free -h
```

> 💡 MySQL 优化配置已内置于 `deploy/mysql-optimize.cnf`，会自动挂载到容器中。

### 步骤 1: 安装 Docker

```bash
# Ubuntu
curl -fsSL https://get.docker.com | sh
sudo systemctl enable docker
sudo systemctl start docker

# 将当前用户加入 docker 组（可选，避免每次用 sudo）
sudo usermod -aG docker $USER
# 重新登录 SSH 生效
```

### 步骤 2: 创建部署目录

```bash
mkdir -p ~/word-teacher && cd ~/word-teacher
```

### 步骤 3: 下载配置文件

```bash
# 克隆仓库或下载 docker-compose 配置
git clone https://github.com/YOUR_USERNAME/word-teacher.git
cd word-teacher

# 复制环境变量模板
cp .env.production.example .env
```

### 步骤 4: 配置环境变量

```bash
vim .env
```

**必须修改的配置:**

```bash
# ============ 数据库 ============
MYSQL_ROOT_PASSWORD=<设置一个强密码>

# ============ JWT ============
JWT_SECRET=<至少32位的随机字符串>

# ============ AI 服务 ============
DASHSCOPE_API_KEY=<你的阿里云 DashScope API Key>

# ============ CORS ============
CORS_ORIGINS=http://YOUR_SERVER_IP,http://YOUR_SERVER_IP:8888

# ============ Agent 认证 ============
AGENT_API_KEY=<设置一个随机字符串>
```

> 💡 生成随机密钥: `openssl rand -base64 32`

### 步骤 5: 启动服务

```bash
# 拉取并启动所有服务
docker compose -f docker-compose.prod.yml up -d

# 查看启动状态
docker compose -f docker-compose.prod.yml ps
```

### 步骤 6: 初始化数据库 (首次部署)

```bash
# 等待 MySQL 健康检查通过 (约 10-30 秒)
docker compose -f docker-compose.prod.yml logs -f mysql

# 同步数据库结构
docker compose -f docker-compose.prod.yml exec backend npx prisma db push

# 创建初始数据
docker compose -f docker-compose.prod.yml exec backend npx tsx prisma/seed.ts
```

---

## ✅ 验证部署

### 测试访问

| 服务 | 地址 | 预期结果 |
|------|------|----------|
| 学生端 | http://YOUR_SERVER_IP | 显示登录页面 |
| 管理后台 | http://YOUR_SERVER_IP:8888 | 显示管理后台登录页 |
| API 健康检查 | http://YOUR_SERVER_IP/api/health | 返回 `{"status":"ok"}` |

### 测试账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | admin | 123456 |
| 学生 | student | 123456 |

---

## 🔧 常用运维命令

```bash
cd ~/word-teacher

# 查看服务状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs -f              # 所有服务
docker compose -f docker-compose.prod.yml logs -f backend      # 后端日志
docker compose -f docker-compose.prod.yml logs -f agent        # Agent 日志

# 重启服务
docker compose -f docker-compose.prod.yml restart

# 更新镜像并重启
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 停止服务
docker compose -f docker-compose.prod.yml down

# 停止并删除数据 (⚠️ 危险!)
docker compose -f docker-compose.prod.yml down -v
```

---

## 📦 镜像版本

| 镜像 | 说明 |
|------|------|
| `YOUR_DOCKERHUB/word-teacher-backend:latest` | 后端 API |
| `YOUR_DOCKERHUB/word-teacher-agent:latest` | AI Agent 服务 |
| `YOUR_DOCKERHUB/word-teacher-nginx:latest` | 前端 + Nginx 反向代理 |

---

## ❓ 常见问题

### Q: 端口被占用
```bash
# 查看端口占用
sudo lsof -i :80
sudo lsof -i :8888

# 停止占用进程或修改 docker-compose.prod.yml 端口映射
```

### Q: 数据库连接失败
```bash
# 检查 MySQL 容器状态
docker compose -f docker-compose.prod.yml logs mysql

# 重启 MySQL
docker compose -f docker-compose.prod.yml restart mysql
```

### Q: 忘记管理员密码
```bash
# 进入后端容器重新执行 seed
docker compose -f docker-compose.prod.yml exec backend npx tsx prisma/seed.ts
# 密码会重置为 123456
```

