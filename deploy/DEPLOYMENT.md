# Word Teacher 生产部署指南

## 🌐 域名规划

| 服务 | 路径 | 说明 |
|------|------|------|
| 学生端 | `/teacher-test` | 学生使用 |
| 管理后台 | `/teacher-admin` | 教师/管理员使用 |
| API | `/api` | Nginx 代理到 Backend |
| Agent | 内网 :3002 | 不对外暴露 |

---

## 🐳 Docker 部署（推荐）

### 快速开始

```bash
# 1. 在服务器上安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 2. 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 3. 克隆代码
git clone https://github.com/YOUR_USERNAME/word-teacher.git
cd word-teacher

# 4. 配置环境变量
cp .env.production.example .env
vim .env  # 填写实际的密钥

# 5. 构建并启动
./scripts/deploy.sh build
./scripts/deploy.sh up

# 6. 初始化数据库（首次部署）
./scripts/deploy.sh db-init

# 7. 配置 SSL 证书
# 方式一：使用 Let's Encrypt
./scripts/deploy.sh ssl

# 方式二：手动上传证书到 deploy/ssl/
# - fullchain.pem
# - privkey.pem
```

### Docker 命令速查

| 命令 | 说明 |
|------|------|
| `./scripts/deploy.sh build` | 构建所有镜像 |
| `./scripts/deploy.sh up` | 启动所有服务 |
| `./scripts/deploy.sh down` | 停止所有服务 |
| `./scripts/deploy.sh logs` | 查看日志 |
| `./scripts/deploy.sh db-init` | 初始化数据库 |
| `docker compose ps` | 查看服务状态 |
| `docker compose restart backend` | 重启单个服务 |

---

## ✅ 传统部署清单 (无 Docker)

### 第一阶段：服务器准备

- [ ] **购买/准备服务器**
  - 推荐配置：2核4G 以上
  - 系统：Ubuntu 22.04 LTS
  - 开放端口：22 (SSH), 80, 443

- [ ] **DNS 解析配置**（如有域名）
  - [ ] `your-domain.com` → 服务器 IP
  - [ ] `www.your-domain.com` → 服务器 IP

- [ ] **安装基础软件**
  ```bash
  # 更新系统
  sudo apt update && sudo apt upgrade -y

  # 安装 Node.js 20.x
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs

  # 安装 pnpm
  sudo npm install -g pnpm

  # 安装 PM2
  sudo npm install -g pm2

  # 安装 Nginx
  sudo apt install -y nginx

  # 安装 MySQL 8.0
  sudo apt install -y mysql-server

  # 安装 Git
  sudo apt install -y git

  # 安装 Certbot (SSL 证书)
  sudo apt install -y certbot python3-certbot-nginx
  ```

---

### 第二阶段：数据库配置

- [ ] **初始化 MySQL**
  ```bash
  # 安全配置
  sudo mysql_secure_installation
  ```

- [ ] **创建数据库和用户**
  ```bash
  sudo mysql -u root -p
  ```
  ```sql
  -- 创建数据库
  CREATE DATABASE word_teacher CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

  -- 创建专用用户（不要用 root！）
  CREATE USER 'wordteacher'@'localhost' IDENTIFIED BY '你的强密码';
  GRANT ALL PRIVILEGES ON word_teacher.* TO 'wordteacher'@'localhost';
  FLUSH PRIVILEGES;
  EXIT;
  ```

- [ ] **记录数据库连接信息**
  ```
  DATABASE_URL="mysql://wordteacher:你的强密码@localhost:3306/word_teacher"
  ```

---

### 第三阶段：生成密钥

- [ ] **生成 JWT Secret (64+ 字符)**
  ```bash
  openssl rand -base64 48
  # 示例输出: K7xYz9Abc123...共64字符
  ```
  ⚠️ **记录下来，丢失后所有用户需要重新登录**

- [ ] **生成 Agent API Key**
  ```bash
  openssl rand -hex 32
  # 示例输出: a1b2c3d4e5f6...共64字符
  ```
  ⚠️ **Backend 和 Agent 必须使用相同的值**

- [ ] **准备阿里云 Dashscope API Key**
  - 登录 [阿里云 Dashscope](https://dashscope.console.aliyun.com/)
  - 创建 API Key
  - 记录 `sk-xxxx` 格式的密钥

---

### 第四阶段：部署代码

- [ ] **克隆代码**
  ```bash
  cd /var/www
  sudo git clone https://github.com/YOUR_USERNAME/word-teacher.git
  sudo chown -R $USER:$USER word-teacher
  cd word-teacher
  ```

- [ ] **安装依赖**
  ```bash
  pnpm install
  ```

- [ ] **配置 Backend 环境变量**
  ```bash
  cp backend/.env.example backend/.env
  nano backend/.env
  ```
  ```env
  # ===== 必须修改 =====
  NODE_ENV=production
  DATABASE_URL="mysql://wordteacher:你的强密码@localhost:3306/word_teacher"
  JWT_SECRET="你生成的64字符密钥"
  AGENT_API_KEY="你生成的Agent密钥"
  CORS_ORIGINS="*"  # 或者填写你的域名

  # ===== 可选修改 =====
  PORT=3001
  JWT_EXPIRES_IN=7d
  AGENT_URL="http://localhost:8000/api/agent"
  ```

- [ ] **配置 Agent 环境变量**
  ```bash
  cp agent/.env.example agent/.env
  nano agent/.env
  ```
  ```env
  # ===== 必须修改 =====
  NODE_ENV=production
  DASHSCOPE_API_KEY="sk-你的阿里云API密钥"
  OPENAI_API_KEY="sk-你的阿里云API密钥"
  AGENT_API_KEY="与Backend相同的Agent密钥"
  CORS_ORIGINS="*"  # 或者填写你的域名

  # ===== 可选修改 =====
  PORT=8000
  BACKEND_API_URL="http://localhost:3001/api"
  ```

- [ ] **初始化数据库**
  ```bash
  cd backend
  pnpm db:push      # 同步数据库结构
  pnpm db:seed      # 填充初始数据（管理员账号等）
  ```

- [ ] **构建所有项目**
  ```bash
  cd /var/www/word-teacher

  # 构建 Backend
  cd backend && pnpm build && cd ..

  # 构建 Agent
  cd agent && pnpm build && cd ..

  # 构建前端（学生端）
  cd frontend && pnpm build && cd ..

  # 构建管理后台
  cd admin && pnpm build && cd ..
  ```

---

### 第五阶段：启动服务

- [ ] **使用 PM2 启动 Backend**
  ```bash
  cd /var/www/word-teacher/backend
  pm2 start dist/index.js --name word-teacher-backend
  ```

- [ ] **使用 PM2 启动 Agent**
  ```bash
  cd /var/www/word-teacher/agent
  pm2 start dist/index.js --name word-teacher-agent
  ```

- [ ] **保存 PM2 配置（开机自启）**
  ```bash
  pm2 save
  pm2 startup
  # 按提示执行输出的命令
  ```

- [ ] **验证服务运行**
  ```bash
  pm2 status
  # 应该看到两个服务都是 online 状态

  # 测试健康检查
  curl http://localhost:3001/api/health
  # 应该返回 {"status":"ok"}
  ```

---

### 第六阶段：配置 Nginx

- [ ] **复制 Nginx 配置**
  ```bash
  sudo cp /var/www/word-teacher/deploy/nginx.conf.example /etc/nginx/sites-available/word-teacher
  ```

- [ ] **编辑配置（修改路径）**
  ```bash
  sudo nano /etc/nginx/sites-available/word-teacher
  ```
  确认以下路径正确：
  - 前端静态文件: `/var/www/word-teacher/frontend/dist`
  - 管理后台静态文件: `/var/www/word-teacher/admin/dist`

- [ ] **启用站点**
  ```bash
  sudo ln -s /etc/nginx/sites-available/word-teacher /etc/nginx/sites-enabled/
  sudo nginx -t  # 测试配置
  sudo systemctl reload nginx
  ```

- [ ] **申请 SSL 证书**（如有域名）
  ```bash
  sudo certbot --nginx -d your-domain.com -d www.your-domain.com
  # 按提示操作，选择自动重定向 HTTP 到 HTTPS
  ```

- [ ] **验证访问**
  - 访问 `http://YOUR_SERVER_IP/teacher-test` 应该能看到学生端
  - 访问 `http://YOUR_SERVER_IP/teacher-admin` 应该能看到管理后台

---

### 第七阶段：安全加固

- [ ] **配置防火墙**
  ```bash
  sudo ufw allow 22/tcp   # SSH
  sudo ufw allow 80/tcp   # HTTP
  sudo ufw allow 443/tcp  # HTTPS
  sudo ufw enable
  ```

- [ ] **禁止 root 登录 SSH（可选）**
  ```bash
  sudo nano /etc/ssh/sshd_config
  # 设置 PermitRootLogin no
  sudo systemctl restart sshd
  ```

- [ ] **设置自动更新 SSL 证书**
  ```bash
  # Certbot 默认已配置自动续期，测试一下
  sudo certbot renew --dry-run
  ```

---

### 第八阶段：监控和备份

- [ ] **查看日志**
  ```bash
  # PM2 日志
  pm2 logs word-teacher-backend
  pm2 logs word-teacher-agent

  # Nginx 日志
  sudo tail -f /var/log/nginx/access.log
  sudo tail -f /var/log/nginx/error.log
  ```

- [ ] **配置数据库备份（可选但推荐）**
  ```bash
  # 创建备份脚本
  sudo nano /var/www/word-teacher/backup.sh
  ```
  ```bash
  #!/bin/bash
  DATE=$(date +%Y%m%d_%H%M%S)
  mysqldump -u wordteacher -p'你的密码' word_teacher > /var/backups/word_teacher_$DATE.sql
  # 保留最近 7 天备份
  find /var/backups -name "word_teacher_*.sql" -mtime +7 -delete
  ```
  ```bash
  chmod +x /var/www/word-teacher/backup.sh

  # 添加定时任务（每天凌晨 3 点备份）
  sudo crontab -e
  # 添加: 0 3 * * * /var/www/word-teacher/backup.sh
  ```

---

## 🔄 GitHub Actions 自动部署（CI/CD）

如果你想通过 GitHub Actions 实现推送代码后自动部署，需要配置以下 Secrets。

### 配置步骤

1. 进入你的 GitHub 仓库
2. 点击 **Settings** → **Secrets and variables** → **Actions**
3. 点击 **New repository secret** 逐个添加以下变量

### 必需的 Secrets

| Secret 名称 | 说明 | 示例值 |
|------------|------|--------|
| `SERVER_HOST` | 服务器 IP 地址 | `123.45.67.89` |
| `SERVER_SSH_KEY` | SSH 私钥（完整内容） | `-----BEGIN RSA PRIVATE KEY-----...` |
| `DOCKER_PASSWORD` | Docker Hub 密码或 Access Token | `dckr_pat_xxx` |
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码 | `YourSecureRootPassword123!` |
| `MYSQL_PASSWORD` | MySQL 应用用户密码 | `YourSecureAppPassword456!` |
| `JWT_SECRET` | JWT 签名密钥（64+ 字符） | `openssl rand -base64 48` 生成 |
| `AGENT_API_KEY` | Agent 服务 API 密钥 | `openssl rand -hex 32` 生成 |
| `DASHSCOPE_API_KEY` | 阿里云百炼 API Key | `sk-xxxxxxxxxxxxxxxx` |

### 可选的 Secrets

| Secret 名称 | 说明 | 默认值 |
|------------|------|--------|
| `ALIYUN_STT_APPKEY` | 阿里云语音识别 AppKey | 无（语音功能不可用） |
| `ALIYUN_AK_ID` | 阿里云 AccessKey ID | 无 |
| `ALIYUN_AK_SECRET` | 阿里云 AccessKey Secret | 无 |
| `MINIO_ROOT_PASSWORD` | MinIO 管理员密码 | `minio123456` |
| `SSL_FULLCHAIN` | SSL 证书（fullchain.pem 内容） | 无（使用 HTTP） |
| `SSL_PRIVKEY` | SSL 私钥（privkey.pem 内容） | 无（使用 HTTP） |

### 必需的 Variables

除了 Secrets，还需要配置一个 Repository Variable：

1. 在 **Settings** → **Secrets and variables** → **Actions** 页面
2. 切换到 **Variables** 标签
3. 点击 **New repository variable**

| Variable 名称 | 说明 | 示例值 |
|--------------|------|--------|
| `DOCKER_USERNAME` | Docker Hub 用户名 | `your-dockerhub-username` |

### 获取各项密钥的方法

#### 1. SSH 私钥
```bash
# 生成新的 SSH 密钥对
ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github_actions

# 将公钥添加到服务器
ssh-copy-id -i ~/.ssh/github_actions.pub root@YOUR_SERVER_IP

# 复制私钥内容到 GitHub Secrets
cat ~/.ssh/github_actions
```

#### 2. Docker Hub Access Token
1. 登录 [Docker Hub](https://hub.docker.com/)
2. 点击头像 → **Account Settings** → **Security**
3. 点击 **New Access Token**
4. 复制生成的 Token

#### 3. JWT Secret 和 Agent API Key
```bash
# JWT Secret（64 字符）
openssl rand -base64 48

# Agent API Key
openssl rand -hex 32
```

#### 4. 阿里云 Dashscope API Key
1. 登录 [阿里云百炼控制台](https://bailian.console.aliyun.com/)
2. 点击右上角 **API-KEY 管理**
3. 创建新的 API Key

### 首次部署前的服务器准备

在 GitHub Actions 能够部署之前，服务器需要做一些初始化：

```bash
# 1. 安装 Docker
curl -fsSL https://get.docker.com | sh

# 2. 创建项目目录
mkdir -p /root/word-teacher

# 3. 创建 .env 文件（Actions 会更新它）
cat > /root/word-teacher/.env << 'EOF'
IMAGE_TAG=latest
DOCKER_USERNAME=your-dockerhub-username
EOF

# 4. 登录 Docker Hub（拉取镜像需要）
docker login
```

### 触发部署

配置完成后，每次推送到 `main` 分支都会自动触发部署：

```bash
git add .
git commit -m "feat: 新功能"
git push origin main
```

可以在 GitHub 仓库的 **Actions** 标签页查看部署进度。

---

## 🔧 常用运维命令

```bash
# 查看服务状态
pm2 status

# 重启服务
pm2 restart word-teacher-backend
pm2 restart word-teacher-agent
pm2 restart all

# 查看日志
pm2 logs word-teacher-backend --lines 100

# 更新代码后重新部署
cd /var/www/word-teacher
git pull
pnpm install
cd backend && pnpm build && pm2 restart word-teacher-backend && cd ..
cd agent && pnpm build && pm2 restart word-teacher-agent && cd ..
cd frontend && pnpm build && cd ..
cd admin && pnpm build && cd ..

# 健康检查
curl http://localhost:3001/api/health/detail
```

---

## ⚠️ 故障排查

| 问题 | 排查方法 |
|------|----------|
| 页面显示 502 | `pm2 status` 检查服务是否运行 |
| API 返回 500 | `pm2 logs word-teacher-backend` 查看错误 |
| 数据库连接失败 | 检查 DATABASE_URL 和 MySQL 服务状态 |
| AI 功能不工作 | 检查 DASHSCOPE_API_KEY 和 Agent 日志 |
| CORS 错误 | 检查 CORS_ORIGINS 配置是否包含前端域名 |

---

## 📞 部署完成检查

- [ ] `/teacher-test` 学生端能正常访问
- [ ] `/teacher-admin` 管理后台能正常访问
- [ ] 学生端能正常登录
- [ ] 管理后台能正常登录
- [ ] 对话练习 AI 功能正常
- [ ] 跟读练习评分功能正常
- [ ] PM2 已设置开机自启
- [ ] SSL 证书已配置（如有域名）
- [ ] 数据库备份已配置（可选）

