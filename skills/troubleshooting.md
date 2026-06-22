# Word Teacher 问题排查 Skill

> 本文档是基于日志排查问题的标准操作手册（SOP）。原则：先看日志，用数据定位，不靠猜。

---

## 快速命令参考

| 场景 | 命令 |
|------|------|
| **查看 Backend 实时日志** | 终端里直接看 `pnpm dev` 输出（开发环境 pino-pretty） |
| **查看 Agent 实时日志** | 同上，`[agent]` 前缀的输出 |
| **查看 Agent 日志文件** | `cat agent/logs/agent.$(date +%Y-%m-%d).1.log \| jq .` |
| **查看 AI 助手日志** | `cat agent/logs/agent.$(date +%Y-%m-%d).1.log \| jq 'select(.module == "assistant")'` |
| **查看 AI 助手工具调用** | `cat agent/logs/agent.$(date +%Y-%m-%d).1.log \| jq 'select(.module == "assistant" and .tool)'` |
| **查看生产 Backend 日志** | `ssh root@服务器 "docker logs word-teacher-backend --tail 200"` |
| **查看生产 Agent 日志** | `ssh root@服务器 "docker logs word-teacher-agent --tail 200"` |
| **查看 MySQL 日志** | `docker logs word-teacher-mysql-dev --tail 50` |
| **查看 Docker 全部状态** | `docker compose -f docker-compose.dev.yml ps` |
| **查看端口占用** | `lsof -i:3001 -i:8000 -i:5173 -i:5174 -i:3306` |
| **检查 MySQL 连通性** | `docker exec word-teacher-mysql-dev mysqladmin ping -h localhost -u root -proot123456` |
| **查看数据库表数据量** | `docker exec word-teacher-mysql-dev mysql -u root -proot123456 word_teacher -e "SELECT 'teachers' as t, COUNT(*) as c FROM teachers UNION ALL SELECT 'students', COUNT(*) FROM students UNION ALL SELECT 'classes', COUNT(*) FROM classes;"` |

---

## 日志系统架构

### 开发环境

```
pnpm dev 终端输出
├── [backend]  ← pino-pretty 彩色输出（debug 级别）
├── [agent]    ← pino-pretty 彩色输出（debug 级别）
├── [frontend] ← Vite HMR 日志
└── [admin]    ← Vite HMR 日志
```

- Backend 开发环境**不写日志文件**，仅输出到 console
- Agent 开发环境**同时写文件**到 `agent/logs/agent.YYYY-MM-DD.1.log`（JSON 格式，pino-roll 按天切割）
- 日志级别：`debug` > `info` > `warn` > `error` > `fatal`
- AI 助手模块（`assistant`）的日志包含：工具调用详情（tool、resultLen、preview）、最终流式调用的 messages 构成（msgCount、roles）

### 生产环境

```
Docker 容器日志
├── word-teacher-backend  → stdout (JSON) + /app/logs/backend-YYYY-MM-DD.log
├── word-teacher-agent    → stdout (JSON) + /app/logs/agent-YYYY-MM-DD.log
├── word-teacher-mysql    → Docker 内置日志
└── word-teacher-nginx    → /var/log/nginx/access.log + error.log
```

- 宿主机路径：`/root/word-teacher/logs/backend/` 和 `/root/word-teacher/logs/agent/`
- 容器以 UID 1001 运行，日志目录需要正确权限

---

## 排查流程（SOP）

### Step 1: 确认故障现象

先明确问题类型：

| 现象 | 可能层级 |
|------|----------|
| 页面白屏 / 404 | Frontend / Nginx 配置 |
| API 返回 502 | Backend 进程挂了 |
| API 返回 500 | Backend 代码异常 |
| API 返回 401/403 | JWT 过期 / API Key 错误 |
| AI 对话无响应 | Agent 服务 / LLM API |
| 数据库错误 | MySQL 连接 / Schema 不一致 |
| 上传失败 | MinIO 服务 |
| 评测无结果 | 讯飞 ISE / 阿里云 STT |

### Step 2: 定位服务 → 看日志

```bash
# 开发环境：直接看终端
# 找 ERROR 级别的日志，关注 module 字段

# 生产环境：
docker logs word-teacher-backend --tail 100 --since 5m 2>&1 | grep -i error
docker logs word-teacher-agent --tail 100 --since 5m 2>&1 | grep -i error
```

### Step 3: 根据错误分类处理

按下方「常见错误速查表」定位具体原因和修复方法。

---

## 常见错误速查表

### 🔴 Backend 错误

#### `Database connection failed`

**日志特征**:
```
ERROR: Database connection failed after all retries
  attempt: 5, maxRetries: 5
```

**排查**:
```bash
# 1. MySQL 容器是否在运行？
docker ps | grep mysql

# 2. 端口是否冲突？（最常见：本地 Homebrew MySQL 抢占 3306）
lsof -i:3306

# 3. 如果有非 Docker 的 mysqld：
brew services stop mysql
# 或
lsof -ti:3306 | xargs kill -9

# 4. 验证连接
mysql -u root -proot123456 -h 127.0.0.1 -P 3306 -e "SELECT 1;"
```

**根因排序**:
1. 本地 Homebrew MySQL 占用 3306（最常见）
2. Docker 容器未启动
3. Docker 容器启动中，Backend 启动太快（已加重试机制）

---

#### `MinIO initialization failed` / 上传 500

**日志特征**:
```
[MinIO] ERROR: Failed to initialize MinIO
```

**排查**:
```bash
# 1. MinIO 容器是否在运行？
docker ps | grep minio

# 2. 端口 9000 是否可达？
curl -s http://localhost:9000/minio/health/live

# 3. 检查 .env 中的凭据
grep MINIO backend/.env
```

---

#### `Prisma P2002` (唯一约束冲突)

**日志特征**:
```
error: { statusCode: 409, message: "记录已存在" }
```

**含义**: 插入了重复的唯一键数据（如重复学号、重复账号）

**处理**: 这是正常业务错误，检查前端是否正确处理了 409 响应

---

#### `Prisma P2025` (记录未找到)

**日志特征**:
```
error: { statusCode: 404, message: "记录不存在" }
```

**含义**: 尝试更新/删除的记录不存在

**处理**: 检查请求的 ID 是否正确，是否已被删除

---

#### `ZodError` (参数验证失败)

**日志特征**:
```
error: { statusCode: 400, message: "请求参数错误", details: [...] }
```

**处理**: 查看 `details` 数组了解哪些字段不合规，修改请求参数

---

### 🟡 Agent 错误

#### AI 助手问题排查

AI 助手（管理后台的智能对话功能）日志模块为 `assistant`，写入 `agent/logs/` 日志文件。

**查看日志**:
```bash
# 开发环境：查看今天的 assistant 模块日志
cat agent/logs/agent.$(date +%Y-%m-%d).1.log | jq 'select(.module == "assistant")'

# 只看工具调用记录（含工具名、结果长度、结果预览）
cat agent/logs/agent.$(date +%Y-%m-%d).1.log | jq 'select(.module == "assistant" and .tool)'

# 查看最终流式调用前的 messages 构成（确认 tool role 是否在列）
cat agent/logs/agent.$(date +%Y-%m-%d).1.log | jq 'select(.module == "assistant" and .msg == "final stream start")'

# 生产环境
ssh root@服务器 "docker logs word-teacher-agent --tail 200 2>&1 | grep assistant"
```

**常见问题**:

| 日志特征 | 含义 | 处理 |
|----------|------|------|
| `tool=queryDatabase, preview="禁止使用关键字: XXX"` | AI 生成了非 SELECT 的 SQL | prompt 或 AI 理解问题，换个问法 |
| `tool=queryDatabase, resultLen>0, preview 含 downloadUrl` | 工具正常返回了下载链接 | 若 AI 仍编造链接，检查 messages 中 tool role 是否正确 |
| `final stream start, roles=...` 中无 `tool` | 工具结果没传给 LLM | 检查 chatStream 中 messages.push 逻辑 |
| `final stream start, roles=...` 中有 `tool` | 工具结果已传给 LLM，AI 仍幻觉 | prompt 问题或模型能力限制 |

---

#### `Agent API request failed` / LLM 无响应

**日志特征**:
```
[agent] Agent request failed: 429 Too Many Requests
[agent] Agent request failed: 401 Unauthorized
[agent] Agent request failed: timeout
```

**排查**:
```bash
# 1. 检查 API Key
grep OPENAI_API_KEY agent/.env
grep OPENAI_BASE_URL agent/.env

# 2. 直接测试 LLM 连通性
curl -s https://api.deepseek.com/v1/models \
  -H "Authorization: Bearer $(grep OPENAI_API_KEY agent/.env | cut -d= -f2)"

# 3. 429 = 限流，等一下重试即可
# 4. 401 = Key 过期/无效，更换 API Key
```

---

#### `讯飞 ISE 评测失败`

**日志特征**:
```
[xfyun-ise] ERROR: WebSocket timeout after 30s
[xfyun-ise] ERROR: Server error code: xxxxx
[xfyun-ise] ERROR: XML parse error
```

**排查**:
```bash
# 1. 检查讯飞凭据
grep XFYUN agent/.env

# 2. WebSocket 超时 → 网络问题或音频数据过大
# 3. 错误码查询：https://www.xfyun.cn/doc/Ise/IseAPI.html#错误码

# 4. 如果 ISE 完全不可用，Agent 会降级为纯 LLM 评分
```

---

#### `阿里云 STT 失败`

**日志特征**:
```
[aliyun-stt] Token fetch failed
[aliyun-stt] STT error: ...
```

**排查**:
```bash
# 检查阿里云凭据
grep ALIBABA agent/.env
```

---

#### `Tool execution failed`

**日志特征**:
```
[ToolRegistry] Tool execution failed: toolName
  error: "..."
```

**排查**:
1. 确认 Backend 是否在运行（工具依赖 Backend API）
2. 检查 `INTERNAL_API_KEY` 是否一致（agent/.env 和 backend/.env）
3. 查看 Backend 日志对应时间段是否有 500 错误

---

### 🟠 Docker / 基础设施错误

#### 容器反复重启

```bash
# 查看容器状态
docker compose -f docker-compose.dev.yml ps

# 查看重启原因
docker logs word-teacher-mysql-dev --tail 30

# 常见原因：
# - 内存不足（docker stats 查看）
# - 端口被占用
# - volume 权限问题
```

#### 端口已被占用

```bash
# 查看谁占了端口
lsof -i:3001  # backend
lsof -i:8000  # agent
lsof -i:5173  # frontend
lsof -i:5174  # admin
lsof -i:3306  # mysql
lsof -i:9000  # minio api
lsof -i:9001  # minio console

# 一键释放应用端口
lsof -ti:3001 -ti:8000 -ti:5173 -ti:5174 | xargs kill -9
```

---

## 生产环境排查

### SSH 连接

```bash
ssh -i github.pem root@1.14.201.123
cd /root/word-teacher
```

### 常用命令

```bash
# 查看所有容器状态
docker compose -f docker-compose.prod.yml ps

# 实时追踪 Backend 日志
docker logs -f word-teacher-backend --since 1m

# 实时追踪 Agent 日志
docker logs -f word-teacher-agent --since 1m

# 查看 Nginx 访问日志（最近的请求）
docker exec word-teacher-nginx tail -50 /var/log/nginx/access.log

# 查看 Nginx 错误日志
docker exec word-teacher-nginx tail -50 /var/log/nginx/error.log

# 检查 MySQL 连接数
docker exec word-teacher-mysql mysql -u root -proot123456 -e "SHOW STATUS LIKE 'Threads_connected';"

# 检查磁盘空间
df -h

# 检查 Docker 占用空间
docker system df

# 重启单个服务
docker compose -f docker-compose.prod.yml restart backend

# 重启所有服务
docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d
```

### 日志文件位置（宿主机）

```
/root/word-teacher/
├── logs/
│   ├── backend/backend-2026-06-22.log   ← Backend 结构化日志
│   └── agent/agent-2026-06-22.log       ← Agent 结构化日志
└── data/
    └── lancedb/                          ← 向量数据库持久化
```

### 分析 JSON 日志

```bash
# 查看最近的 ERROR 级别日志
cat logs/backend/backend-$(date +%Y-%m-%d).log | jq 'select(.level >= 50)' | tail -20

# 按模块过滤
cat logs/backend/backend-$(date +%Y-%m-%d).log | jq 'select(.module == "database")'

# 查看某时间段的日志
cat logs/agent/agent-$(date +%Y-%m-%d).log | jq 'select(.time > 1719043200000)'

# 统计错误类型
cat logs/backend/backend-$(date +%Y-%m-%d).log | jq -r 'select(.level >= 50) | .module' | sort | uniq -c | sort -rn
```

---

## 错误模块速查

### Backend 模块标识

| module 字段 | 含义 | 关注点 |
|-------------|------|--------|
| `database` | 数据库连接/查询 | 连接失败、慢查询 |
| `auth` | 认证鉴权 | JWT 过期、权限不足 |
| `api` | API 请求处理 | 全局错误中间件捕获的 |
| `agent` | Agent 调用相关 | Backend 调 Agent 失败 |
| `[MinIO]` | 对象存储 | 上传/初始化失败 |
| `[VectorDB]` | 向量搜索 | LanceDB 初始化/搜索失败 |
| `[DingTalkBot]` | 钉钉机器人 | 消息处理/回复失败 |
| `[Internal]` | 内部API | Agent 通过 internal API 操作 |
| `[Upload]` | 文件上传 | 图片/封面上传失败 |

### Agent 模块标识

| module 字段 | 含义 | 关注点 |
|-------------|------|--------|
| `assistant` | AI 助手（管理后台） | 工具调用、LLM 回复、导出 Excel |
| `xfyun-ise` | 讯飞语音评测 | WebSocket超时、错误码 |
| `aliyun-stt` | 阿里云语音转文字 | Token过期、转写失败 |
| `read-aloud` | 跟读评分 | ISE 调用失败降级 |
| `dialogue` | AI 对话 | LLM 调用失败/超时 |
| `[ToolRegistry]` | MCP 工具注册执行 | 工具执行失败 |
| `[Workflow]` | 对话工作流 | 流程编排错误 |

---

## pino 日志级别对照

| level 数值 | 名称 | 含义 |
|-----------|------|------|
| 10 | trace | 最详细的跟踪 |
| 20 | debug | 调试信息 |
| 30 | info | 正常运行信息 |
| 40 | warn | 警告（可降级运行） |
| 50 | error | 错误（功能受损） |
| 60 | fatal | 致命（服务退出） |

---

## 排查决策树

```
问题发生
│
├── 页面能打开吗？
│   ├── 不能 → 检查 Nginx/Vite 日志，确认端口
│   └── 能 → 继续
│
├── API 返回什么状态码？
│   ├── 502 → Backend 进程挂了，查 docker ps + 重启
│   ├── 500 → Backend 异常，查 backend 日志
│   ├── 401 → JWT 过期，重新登录
│   ├── 400 → 参数格式错误，查 details 字段
│   └── 正常 → 继续
│
├── AI 功能正常吗？
│   ├── 无响应 → Agent 是否运行？→ 查 agent 日志
│   ├── 响应慢 → 查 LLM API 延迟（DeepSeek 限流?）
│   └── 评分异常 → 查讯飞 ISE 日志
│
└── 数据异常？
    ├── 数据丢失 → 检查 MySQL volume，查 migration 历史
    └── 数据错误 → 用 pnpm seed 重置，或手动 SQL 修复
```

---

## 加诊断日志的方法

当以上信息不足以定位问题时，在关键路径加临时诊断日志：

### Backend

```typescript
import { createLogger } from '../utils/logger.js'
const log = createLogger('debug-xxx')

// 在可疑位置加
log.info({ data: someVar }, '进入了这个分支')
log.error({ err, requestBody: req.body }, '这里出错了')
```

### Agent

```typescript
import { createLogger } from '../utils/logger.js'
const log = createLogger('debug-xxx')

log.info({ toolInput, result }, 'Tool 执行结果')
```

### 关键原则

1. **不要猜，看日志** — 不确定原因时，先看日志、加日志，用数据定位，不靠猜测。猜是最差的排查方式
2. **先日志后改代码** — 日志不够就加日志复现，确认根因后再修复
3. **结构化日志** — 用 `logger.info({ key: value }, 'message')` 而不是 `console.log`（console.log 不写文件）
4. **带上下文** — 日志里包含 requestId、userId、关键参数
5. **修完删日志** — 诊断日志用完记得清理

### 踩坑记录

> 遇到新坑时追加到这里，避免重复踩坑。

#### `created_at` 被 `CREATE` 关键字误拦（2026-06-22）

**现象**: AI 助手导出 Excel 时，工具返回 `"禁止使用关键字: CREATE"`，但 AI 生成的 SQL 是纯 SELECT 语句。

**根因**: `internal.query-db.routes.ts` 的安全校验用 `upperSql.includes('CREATE')` 做子串匹配，而 SQL 中的 `created_at` 转大写后是 `CREATED_AT`，包含 `CREATE` 子串，被误拦。

**修复**: 改用单词边界正则 `new RegExp('\\bCREATE\\b').test(upperSql)`，避免字段名子串误匹配。

**教训**: 工具报错后 AI 会在下一轮编造假数据（如虚构 S3 下载链接）。排查时先看日志确认工具实际返回了什么，不要被 AI 的输出误导。

---

## 健康检查 API

```bash
# Backend
curl -s http://localhost:3001/api/health | jq .

# Agent
curl -s http://localhost:8000/api/agent/health | jq .
```

返回值包含服务状态、连接状态等信息，生产环境也可用于监控。
