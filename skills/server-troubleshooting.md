# Word Teacher 服务器问题排查 Skill

> 本文档是线上服务器问题排查的标准操作手册（SOP）。涵盖 Docker 容器管理、流水线调试、蓝绿部署验证、Nginx 排查等生产环境场景。

---

## 连接信息

| 项目 | 值 |
|------|-----|
| 服务器 IP | `1.14.201.123` |
| SSH 用户 | `root` |
| SSH 密钥 | `./github.pem`（项目根目录） |
| 项目路径 | `/root/word-teacher/` |
| 连接命令 | `ssh -i github.pem root@1.14.201.123` |

**原则**: 优先通过 GitHub Actions 流水线修复（push 代码触发自动部署），不直接 SSH 手动操作。只有紧急救火才用 SSH。

---

## 快速命令参考

### 容器状态

```bash
SSH="ssh -i github.pem root@1.14.201.123"

# 查看所有容器状态
$SSH "cd /root/word-teacher && docker compose -f docker-compose.prod.yml ps"

# 查看容器资源占用
$SSH "docker stats --no-stream"

# 检查磁盘空间
$SSH "df -h && docker system df"
```

### 日志查看

```bash
# Backend 最近日志
$SSH "docker logs word-teacher-backend --tail 100 --since 5m"

# Agent 最近日志
$SSH "docker logs word-teacher-agent --tail 100 --since 5m"

# Nginx 访问日志
$SSH "docker exec word-teacher-nginx tail -50 /var/log/nginx/access.log"

# Nginx 错误日志
$SSH "docker exec word-teacher-nginx tail -50 /var/log/nginx/error.log"

# 实时跟踪
$SSH "docker logs -f word-teacher-backend --since 1m"

# 结构化日志分析（宿主机文件）
$SSH "cat /root/word-teacher/logs/backend/backend-\$(date +%Y-%m-%d).log | jq 'select(.level >= 50)' | tail -20"
```

### 服务重启

```bash
# 重启单个服务（不影响其他服务）
$SSH "cd /root/word-teacher && docker compose -f docker-compose.prod.yml restart backend"

# 重启全部
$SSH "cd /root/word-teacher && docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d"

# 强制重建单个服务（用新镜像）
$SSH "cd /root/word-teacher && docker compose -f docker-compose.prod.yml up -d --force-recreate backend"
```

### 环境变量检查

```bash
# 查看容器内环境变量（脱敏显示）
$SSH "docker exec word-teacher-backend printenv | grep -iE 'DASHSCOPE|ALIYUN|XFYUN|MINIO|JWT|AGENT' | sed 's/=\(.\{10\}\).*/=\1.../'"

# 查看 .env 文件
$SSH "cat /root/word-teacher/.env"
```

---

## 排查场景 SOP

### 场景 1: 容器异常（unhealthy / 反复重启）

```
docker compose ps 显示某服务 unhealthy 或 restarting
```

**排查步骤**:

1. 确认容器状态和退出原因：
```bash
$SSH "docker inspect word-teacher-backend --format='{{.State.Status}} {{.State.ExitCode}} {{.State.Error}}'"
```

2. 查看容器日志（看最后 50 行）：
```bash
$SSH "docker logs word-teacher-backend --tail 50 2>&1"
```

3. 检查健康检查配置：
```bash
$SSH "docker inspect word-teacher-backend --format='{{json .Config.Healthcheck}}' | jq ."
```

4. 手动执行健康检查命令：
```bash
$SSH "docker exec word-teacher-backend wget -q -O /dev/null http://localhost:3001/api/health"
```

5. 检查资源：
```bash
$SSH "docker stats --no-stream word-teacher-backend"
$SSH "df -h"
```

**常见根因**:
- 日志目录权限问题 → `chown -R 1001:1001 logs/`
- 环境变量缺失 → 对比 docker-compose.prod.yml 和 .env
- 端口冲突 → `lsof -i:3001`
- 内存不足 → `free -h`

---

### 场景 2: 流水线（GitHub Actions）失败

```
GitHub Actions 红色 ❌
```

**排查步骤**:

1. 先看 GHA 日志，定位失败步骤

2. 常见失败原因速查：

| 失败步骤 | 常见原因 | 解决 |
|----------|---------|------|
| Docker build | 依赖安装失败（网络） | 重跑流水线 |
| Push to TCR | TCR 认证失败/超时 | 检查 TCR_USERNAME/TCR_PASSWORD |
| SSH deploy | SSH 连接超时 | 检查服务器防火墙 |
| Canary health | 新镜像启动失败 | 看 canary 日志，检查代码/配置 |
| Prisma db push | 数据库连接失败 | 检查 MySQL 容器 |
| 全局超时 | 构建/拉镜像太慢 | 当前超时 20 分钟 |

3. 检查耗时瓶颈（部署脚本已有分步计时）：
```
⏱️  [初始化+生成.env] 耗时 2s
⏱️  [SSL证书处理] 耗时 1s
⏱️  [拉取镜像] 耗时 15s
⏱️  [基础设施启动(MySQL+MinIO)] 耗时 8s
⏱️  [backend 蓝绿部署] 耗时 14s
⏱️  [数据库同步(prisma db push)] 耗时 8s
⏱️  [知识库同步(LanceDB)] 耗时 12s
⏱️  部署总耗时: 88s (1m28s)
```

4. 如果流水线本身有 bug，需要紧急修复可以 SSH 手动部署：
```bash
# 紧急手动部署流程
$SSH "cd /root/word-teacher && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d"
```

---

### 场景 3: Nginx 502 / 404 / 500

```
用户访问返回 502、404 或 500
```

**排查步骤**:

1. 确认 Nginx 本身是否运行：
```bash
$SSH "docker ps | grep nginx"
```

2. 检查 upstream 是否可达：
```bash
# 从 nginx 容器内部测试 backend
$SSH "docker exec word-teacher-nginx curl -s http://backend:3001/api/health"

# 测试 agent
$SSH "docker exec word-teacher-nginx curl -s http://agent:3002/api/agent/health"
```

3. 查看 Nginx 错误日志：
```bash
$SSH "docker exec word-teacher-nginx tail -30 /var/log/nginx/error.log"
```

4. 检查 Nginx 配置语法：
```bash
$SSH "docker exec word-teacher-nginx nginx -t"
```

**常见根因**:
- 502: backend/agent 容器挂了或还在启动
- 404: 路由配置不匹配，检查 location 块
- 500: Nginx 配置错误（如 rewrite break 导致 upstream 未初始化）

---

### 场景 4: 蓝绿部署 canary 验证失败

```
GHA 日志: ❌ [backend] canary 健康检查失败！保留旧容器，跳过部署
```

**排查步骤**:

1. 看 GHA 日志中 canary 的日志输出（脚本会自动打印 `docker logs --tail 30`）

2. 常见原因：

| canary 日志特征 | 原因 | 解决 |
|----------------|------|------|
| `Error: Cannot find module` | 构建产物不完整 | 检查 Dockerfile 的 COPY 和构建步骤 |
| `ECONNREFUSED mysql:3306` | canary 没加入正确的 Docker network | 检查 --network 参数 |
| `Missing env: JWT_SECRET` | canary 缺少环境变量 | 补到 deploy_with_canary 的 ENV_ARGS |
| `port already in use` | 容器端口冲突 | canary 不映射宿主机端口，正常不应该出现 |
| 无日志输出 | 容器立即退出 | `docker inspect` 看退出码 |

3. canary 环境变量注意事项：
   - `--env-file .env` 提供大部分变量
   - 但 docker-compose 中硬编码的值（如 `AGENT_URL=http://agent:3002/api/agent`）需要手动 `-e` 传递
   - 已知需要额外传递的：`AGENT_URL`、`MINIO_ENDPOINT`、`MINIO_PORT`、`OPENAI_API_KEY`

---

### 场景 5: AI 服务健康检查面板全红

```
Admin 仪表盘 → AI 服务连通性 → DashScope/阿里云/讯飞 显示"异常"
```

**排查步骤**:

1. 健康检查在 **backend** 容器中执行，需要 backend 有这些环境变量：

| 服务 | 需要的环境变量 |
|------|--------------|
| DashScope LLM | `DASHSCOPE_API_KEY` |
| 阿里云语音识别 | `ALIYUN_AK_ID` + `ALIYUN_AK_SECRET` |
| 讯飞语音评测 | `XFYUN_APP_ID` + `XFYUN_API_KEY` + `XFYUN_API_SECRET` |
| Agent 服务 | backend 能访问 `http://agent:3002/api/agent/health` |
| MinIO 存储 | backend 能访问 `http://minio:9000` |

2. 检查 backend 容器环境变量：
```bash
$SSH "docker exec word-teacher-backend printenv | grep -iE 'DASHSCOPE|ALIYUN|XFYUN'"
```

3. 如果缺失，检查 `docker-compose.prod.yml` 中 backend 的 environment 配置是否声明了这些变量

---

### 场景 6: 数据库问题

```
API 报 500，日志中有 Prisma 错误
```

**排查步骤**:

1. 检查 MySQL 容器状态：
```bash
$SSH "docker ps | grep mysql"
$SSH "docker exec word-teacher-mysql mysqladmin ping -h localhost -u root -p\$(grep MYSQL_ROOT_PASSWORD /root/word-teacher/.env | cut -d= -f2)"
```

2. 检查 Schema 是否同步：
```bash
$SSH "docker exec word-teacher-backend npx prisma db push --accept-data-loss 2>&1 | tail -5"
```

3. 检查数据库连接数：
```bash
$SSH "docker exec word-teacher-mysql mysql -u root -proot123456 -e \"SHOW STATUS LIKE 'Threads_connected';\""
```

---

### 场景 7: SSL 证书问题

```
浏览器提示证书过期/无效
```

**排查步骤**:

1. 检查证书有效期：
```bash
$SSH "openssl x509 -in /root/word-teacher/ssl/fullchain.pem -noout -dates 2>/dev/null || echo '无证书文件'"
```

2. 检查 Let's Encrypt 自动续签：
```bash
$SSH "ls -la /etc/letsencrypt/live/"
```

3. 部署脚本会自动优先使用 Let's Encrypt 有效证书，fallback 到 self-signed

---

## Docker 清理

```bash
# 清理无用镜像（释放磁盘空间）
$SSH "docker image prune -af --filter 'until=72h'"

# 清理构建缓存
$SSH "docker builder prune -af"

# 查看空间占用
$SSH "docker system df"
```

---

## 部署架构速览

```
GitHub Actions
  ├── build-backend  → 构建 backend 镜像 → push TCR
  ├── build-frontend → 构建 nginx 镜像 → push TCR
  └── build-agent    → 构建 agent 镜像 → push TCR
         ↓
deploy (SSH 到服务器):
  1. 生成 .env（从 GHA Secrets）
  2. SSL 证书处理
  3. TCR 内网拉取镜像（秒级）
  4. 启动基础设施（MySQL + MinIO）
  5. 蓝绿部署（canary 验证 → 切换）
  6. Prisma db push
  7. 知识库同步（LanceDB）
  8. 最终健康检查
```

### 关键文件位置

| 文件 | 位置 | 用途 |
|------|------|------|
| docker-compose.prod.yml | `/root/word-teacher/` | 生产容器编排 |
| .env | `/root/word-teacher/` | 环境变量（GHA Secrets 生成） |
| nginx.conf | 容器内 `/etc/nginx/nginx.conf` | Nginx 配置 |
| SSL 证书 | `/root/word-teacher/ssl/` | HTTPS |
| Backend 日志 | `/root/word-teacher/logs/backend/` | 结构化 JSON 日志 |
| Agent 日志 | `/root/word-teacher/logs/agent/` | 结构化 JSON 日志 |
| LanceDB 数据 | `/root/word-teacher/data/lancedb/` | 向量数据库 |

---

## 排查决策树

```
线上问题
│
├── 用户能访问页面吗？
│   ├── 完全打不开 → 检查 Nginx 容器 + SSL + DNS
│   ├── 能打开但白屏 → 前端构建问题，检查 nginx 静态文件
│   └── 能打开 → 继续
│
├── API 返回什么？
│   ├── 502 → upstream 容器挂了，docker ps 看状态
│   ├── 500 → 看 backend 日志定位代码异常
│   ├── 404 → Nginx 路由配置问题
│   ├── 401 → JWT 过期/密钥不匹配
│   └── 正常 → 继续
│
├── AI 功能正常吗？
│   ├── 对话无响应 → 检查 agent 容器 + DashScope API Key
│   ├── 评分异常 → 检查讯飞 ISE 凭据 + 日志
│   └── 知识库搜索不到 → 检查 LanceDB 数据同步
│
├── 流水线相关？
│   ├── 构建失败 → 看 GHA build 日志
│   ├── 部署失败 → 看 canary 日志 + 耗时统计
│   └── 部署慢 → 看分步耗时，定位瓶颈
│
└── 性能/资源问题？
    ├── 响应慢 → docker stats 看 CPU/内存
    ├── 磁盘满 → df -h + docker system df + 清理
    └── 容器 OOM → 增加内存限制或优化代码
```

---

## 踩坑记录

> 遇到新坑时追加到这里

### backend 容器缺少 AI 服务凭证（2026-06-23）

**现象**: Admin 仪表盘 AI 服务连通性检查全红（DashScope、阿里云、讯飞都显示异常）。

**根因**: `docker-compose.prod.yml` 中 backend 容器的 environment 没有声明 `DASHSCOPE_API_KEY`、`ALIYUN_AK_ID` 等变量。这些凭证只在 agent 容器里，但健康检查代码在 backend 里跑。

**修复**: 在 docker-compose.prod.yml 的 backend service 中补上 6 个环境变量声明。

### canary 容器缺少硬编码的环境变量（2026-06-23）

**现象**: 蓝绿部署 canary 容器使用 `--env-file .env`，但 `AGENT_URL`、`MINIO_ENDPOINT` 等值是在 docker-compose.yml 中硬编码的，.env 里没有。

**修复**: 在 deploy_with_canary 调用时用 `-e` 补上这些变量。

### Nginx rewrite break 导致 500（2026-06-23）

**现象**: 某些路径返回 500，Nginx error log 显示 `upstream not initialized`。

**根因**: `rewrite ... break` 在 location 块中阻止了后续 proxy_pass 找到 upstream。

**修复**: 调整 rewrite 规则。
