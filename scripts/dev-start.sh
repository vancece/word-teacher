#!/bin/bash
# Word Teacher 一键开发启动脚本
#
# 用法:
#   ./scripts/dev-start.sh        完整启动（Docker + 服务）
#   ./scripts/dev-start.sh --stop 停止所有服务
#   ./scripts/dev-start.sh --seed 仅重置测试数据
#
# 原则: 统一 Docker 开发，一条命令搞定，新电脑也能跑
# 前提: 安装了 Docker Desktop / OrbStack（会自动检测并提示）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}✓${NC} $1"; }
log_step()  { echo -e "${CYAN}→${NC} $1"; }
log_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

DB_HOST="127.0.0.1"
DB_PORT="3306"
DB_NAME="word_teacher"
DB_USER="root"
DB_PASS="root123456"

# 检查前置依赖
check_prerequisites() {
  log_step "检查依赖..."

  # Node.js
  if ! command -v node &>/dev/null; then
    log_error "未找到 Node.js！请安装 Node.js 18+"
    echo "  推荐: brew install node"
    exit 1
  fi
  local node_ver
  node_ver=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$node_ver" -lt 18 ]; then
    log_error "Node.js 版本过低（需要 18+，当前 $(node -v)）"
    exit 1
  fi
  log_info "Node.js $(node -v)"

  # pnpm
  if ! command -v pnpm &>/dev/null; then
    log_warn "未找到 pnpm，自动安装..."
    npm install -g pnpm
  fi
  log_info "pnpm $(pnpm -v)"

  # Docker
  if ! command -v docker &>/dev/null; then
    log_error "未找到 Docker！请安装 OrbStack 或 Docker Desktop"
    echo ""
    echo "  推荐 OrbStack（轻量快速）:"
    echo "    brew install orbstack"
    echo ""
    echo "  或 Docker Desktop:"
    echo "    brew install --cask docker"
    echo ""
    exit 1
  fi

  # 检查 Docker 守护进程是否运行
  if ! docker info &>/dev/null 2>&1; then
    log_error "Docker 守护进程未启动！"
    echo ""
    echo "  请启动 OrbStack 或 Docker Desktop，然后重新运行此脚本"
    echo ""
    # 尝试自动启动 OrbStack
    if command -v orb &>/dev/null; then
      log_step "尝试自动启动 OrbStack..."
      open -a OrbStack
      echo "  等待 Docker 就绪..."
      for i in {1..30}; do
        if docker info &>/dev/null 2>&1; then
          log_info "OrbStack 已启动"
          break
        fi
        sleep 1
        if [ $i -eq 30 ]; then
          log_error "等待超时，请手动启动 Docker"
          exit 1
        fi
      done
    else
      exit 1
    fi
  fi
  log_info "Docker 已就绪"
}

# 启动 Docker 基础服务（MySQL + MinIO）
start_docker_services() {
  log_step "启动 Docker 服务（MySQL + MinIO）..."
  cd "$PROJECT_DIR"

  docker compose -f docker-compose.dev.yml up -d 2>/dev/null

  # 等待 MySQL 就绪
  log_step "等待 MySQL 就绪..."
  local retries=0
  while ! docker exec word-teacher-mysql-dev mysqladmin ping -h localhost -u root -p${DB_PASS} &>/dev/null 2>&1; do
    retries=$((retries + 1))
    if [ $retries -gt 60 ]; then
      log_error "MySQL 启动超时！请检查 Docker 日志: docker logs word-teacher-mysql-dev"
      exit 1
    fi
    sleep 1
  done
  log_info "MySQL 就绪 (${DB_HOST}:${DB_PORT})"

  # 确保数据库存在
  docker exec word-teacher-mysql-dev mysql -u root -p${DB_PASS} -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
  log_info "MinIO 就绪 (localhost:9000, Console: localhost:9001)"
}

# 配置环境变量
setup_env() {
  log_step "配置环境变量..."

  local backend_env="$PROJECT_DIR/backend/.env"
  local agent_env="$PROJECT_DIR/agent/.env"

  # Backend .env
  if [ ! -f "$backend_env" ]; then
    if [ -f "$PROJECT_DIR/backend/.env.example" ]; then
      cp "$PROJECT_DIR/backend/.env.example" "$backend_env"
      log_info "backend/.env 已从 .env.example 创建"
    else
      cat > "$backend_env" << 'EOF'
DATABASE_URL="mysql://root:root123456@127.0.0.1:3306/word_teacher"
JWT_SECRET="word-teacher-jwt-secret-dev"
INTERNAL_API_KEY="word-teacher-internal-key"
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=covers
MINIO_PUBLIC_PATH=/minio
AGENT_URL="http://localhost:8000/api/agent"
NODE_ENV=development
EOF
      log_info "backend/.env 已创建"
    fi
  fi

  # 强制同步 DATABASE_URL（防止手动改过后不一致）
  local db_url="mysql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"${db_url}\"|" "$backend_env"
  else
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${db_url}\"|" "$backend_env"
  fi

  # Agent .env
  if [ ! -f "$agent_env" ]; then
    if [ -f "$PROJECT_DIR/agent/.env.example" ]; then
      cp "$PROJECT_DIR/agent/.env.example" "$agent_env"
    else
      cat > "$agent_env" << 'EOF'
PORT=8000
BACKEND_URL=http://localhost:3001
INTERNAL_API_KEY=word-teacher-internal-key
OPENAI_API_KEY=your-key-here
OPENAI_BASE_URL=https://api.deepseek.com
NODE_ENV=development
EOF
    fi
    log_info "agent/.env 已创建"
  fi

  log_info "环境变量就绪"
}

# 安装依赖
install_deps() {
  cd "$PROJECT_DIR"
  if [ ! -d "node_modules" ] || [ ! -d "backend/node_modules" ] || [ ! -d "agent/node_modules" ]; then
    log_step "安装依赖（首次可能需要 1-2 分钟）..."
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
    log_info "依赖安装完成"
  else
    log_info "依赖已就绪"
  fi
}

# Prisma 同步
setup_prisma() {
  log_step "同步数据库 Schema..."
  cd "$PROJECT_DIR/backend"
  npx prisma generate --no-hints 2>/dev/null
  npx prisma db push --accept-data-loss --skip-generate 2>/dev/null || {
    log_warn "db push 遇到问题，尝试关闭外键约束重试..."
    docker exec word-teacher-mysql-dev mysql -u root -p${DB_PASS} ${DB_NAME} -e "SET FOREIGN_KEY_CHECKS=0;" 2>/dev/null
    npx prisma db push --accept-data-loss --skip-generate 2>/dev/null || true
    docker exec word-teacher-mysql-dev mysql -u root -p${DB_PASS} ${DB_NAME} -e "SET FOREIGN_KEY_CHECKS=1;" 2>/dev/null
  }
  log_info "数据库 Schema 已同步"
}

# 检查是否有测试数据
check_seed() {
  local count
  count=$(docker exec word-teacher-mysql-dev mysql -u root -p${DB_PASS} ${DB_NAME} -N -e "SELECT COUNT(*) FROM teachers;" 2>/dev/null || echo "0")
  if [ "$count" = "0" ] || [ -z "$count" ]; then
    log_step "检测到空数据库，自动填充测试数据..."
    bash "$SCRIPT_DIR/seed-dev.sh"
  else
    log_info "数据库已有数据 (teachers: $count)"
  fi
}

# 停止服务
stop_services() {
  log_step "停止所有服务..."
  # 停应用进程
  lsof -ti:3001 2>/dev/null | xargs kill -9 2>/dev/null || true
  lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null || true
  lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null || true
  lsof -ti:5174 2>/dev/null | xargs kill -9 2>/dev/null || true
  # 停 Docker
  cd "$PROJECT_DIR"
  docker compose -f docker-compose.dev.yml down 2>/dev/null || true
  log_info "所有服务已停止"
}

# 清理被占用的端口
clear_ports() {
  local ports=(3001 8000 5173 5174)
  local killed=false

  for port in "${ports[@]}"; do
    local pids
    pids=$(lsof -ti:"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      if [ "$killed" = false ]; then
        log_step "清理被占用的端口..."
        killed=true
      fi
      echo "$pids" | xargs kill -9 2>/dev/null || true
      log_warn "端口 $port 已释放（杀掉了占用进程）"
    fi
  done

  if [ "$killed" = true ]; then
    sleep 1  # 等端口完全释放
  fi
}

# 停止本地 MySQL 服务（避免与 Docker MySQL 冲突）
stop_local_mysql() {
  # 检查 brew services 管理的 MySQL
  if command -v brew &>/dev/null; then
    local mysql_status
    mysql_status=$(brew services list 2>/dev/null | grep -i "^mysql" | awk '{print $2}' || true)
    if [ "$mysql_status" = "started" ]; then
      log_warn "检测到本地 Homebrew MySQL 在运行，正在停止（避免端口冲突）..."
      brew services stop mysql 2>/dev/null || true
      sleep 2
      log_info "本地 MySQL 已停止"
    fi
  fi

  # 如果还有非 Docker 的 mysqld 进程占用 3306，直接杀掉
  local pids
  pids=$(lsof -ti:3306 2>/dev/null || true)
  if [ -n "$pids" ]; then
    while IFS= read -r line; do
      local cmd pid
      cmd=$(echo "$line" | awk '{print $1}')
      pid=$(echo "$line" | awk '{print $2}')
      if [[ "$cmd" == "COMMAND" ]] || [[ "$cmd" =~ ^(OrbStack|docker|com\.docke)$ ]]; then
        continue
      fi
      log_warn "杀掉占用 3306 的进程: $cmd (PID $pid)"
      kill -9 "$pid" 2>/dev/null || true
    done < <(lsof -i:3306 2>/dev/null)
    sleep 1
  fi
}

# 检查 Docker 端口（9000/9001）冲突
check_docker_ports() {
  local ports=(9000 9001)
  for port in "${ports[@]}"; do
    local pids
    pids=$(lsof -ti:"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      while IFS= read -r line; do
        local cmd pid
        cmd=$(echo "$line" | awk '{print $1}')
        pid=$(echo "$line" | awk '{print $2}')
        if [[ "$cmd" == "COMMAND" ]] || [[ "$cmd" =~ ^(OrbStack|docker|com\.docke)$ ]]; then
          continue
        fi
        log_warn "端口 $port 被 $cmd (PID $pid) 占用，正在释放..."
        kill -9 "$pid" 2>/dev/null || true
      done < <(lsof -i:"$port" 2>/dev/null)
    fi
  done
}

# 启动应用服务
start_services() {
  cd "$PROJECT_DIR"

  echo ""
  echo -e "${CYAN}╭──────────────────────────────────────────────────╮${NC}"
  echo -e "${CYAN}│${NC}  ${GREEN}🎓 Word Teacher 开发环境已就绪${NC}                  ${CYAN}│${NC}"
  echo -e "${CYAN}├──────────────────────────────────────────────────┤${NC}"
  echo -e "${CYAN}│${NC}                                                  ${CYAN}│${NC}"
  echo -e "${CYAN}│${NC}  Backend:  ${BLUE}http://localhost:3001/api${NC}              ${CYAN}│${NC}"
  echo -e "${CYAN}│${NC}  Agent:    ${BLUE}http://localhost:8000${NC}                  ${CYAN}│${NC}"
  echo -e "${CYAN}│${NC}  学生端:   ${BLUE}http://localhost:5173${NC}                  ${CYAN}│${NC}"
  echo -e "${CYAN}│${NC}  管理后台: ${MAGENTA}http://localhost:5174/teacher-admin${NC}  ${CYAN}│${NC}"
  echo -e "${CYAN}│${NC}  MinIO:    ${BLUE}http://localhost:9001${NC}                  ${CYAN}│${NC}"
  echo -e "${CYAN}│${NC}                                                  ${CYAN}│${NC}"
  echo -e "${CYAN}├──────────────────────────────────────────────────┤${NC}"
  echo -e "${CYAN}│${NC}  ${YELLOW}测试账号:${NC}                                        ${CYAN}│${NC}"
  echo -e "${CYAN}│${NC}    管理员  admin / 123456                         ${CYAN}│${NC}"
  echo -e "${CYAN}│${NC}    教师    xiaomei / 123456                       ${CYAN}│${NC}"
  echo -e "${CYAN}│${NC}    学生    2026050101 / 123456                    ${CYAN}│${NC}"
  echo -e "${CYAN}│${NC}                                                  ${CYAN}│${NC}"
  echo -e "${CYAN}├──────────────────────────────────────────────────┤${NC}"
  echo -e "${CYAN}│${NC}  ${YELLOW}Ctrl+C${NC} 停止所有服务                              ${CYAN}│${NC}"
  echo -e "${CYAN}╰──────────────────────────────────────────────────╯${NC}"
  echo ""

  # 并行启动所有服务
  npx concurrently \
    --names "backend,agent,frontend,admin" \
    --prefix-colors "blue,yellow,green,magenta" \
    --kill-others-on-fail \
    "cd backend && pnpm dev" \
    "cd agent && pnpm dev" \
    "cd frontend && pnpm dev" \
    "cd admin && pnpm dev"
}

# 主入口
main() {
  echo ""
  echo -e "${CYAN}🎓 Word Teacher Dev Launcher${NC}"
  echo ""

  case "${1:-}" in
    --stop|-s)
      stop_services
      exit 0
      ;;
    --seed)
      bash "$SCRIPT_DIR/seed-dev.sh"
      exit 0
      ;;
    *)
      check_prerequisites
      install_deps
      stop_local_mysql
      check_docker_ports
      start_docker_services
      setup_env
      setup_prisma
      check_seed
      clear_ports
      start_services
      ;;
  esac
}

main "$@"
