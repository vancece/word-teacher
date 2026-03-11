#!/bin/bash
# Word Teacher 本地开发启动脚本
# 用法: pnpm docker:start
#
# 一键启动所有服务：Docker 基础设施 + 后端 + 前端 + 管理端

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 颜色
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# 检查 Docker
check_docker() {
    if ! docker --version &>/dev/null || ! docker compose version &>/dev/null; then
        echo -e "${YELLOW}❌ 请先安装 Docker Desktop: https://www.docker.com/products/docker-desktop/${NC}"
        exit 1
    fi
}

# 启动 Docker 基础服务
start_docker() {
    log_step "启动 Docker 基础服务 (MySQL + MinIO)..."
    cd "$PROJECT_DIR"
    docker compose -f docker-compose.dev.yml up -d
    
    log_info "等待 MySQL 启动..."
    sleep 5
    
    # 检查 MySQL 是否就绪
    for i in {1..30}; do
        if docker exec word-teacher-mysql-dev mysqladmin ping -h localhost -u root -proot123456 &>/dev/null; then
            log_info "✅ MySQL 已就绪"
            break
        fi
        echo -n "."
        sleep 1
    done
    echo ""
    
    log_info "✅ 基础服务已启动"
    echo ""
    echo "  MySQL:  localhost:3306 (wordteacher / dev123456)"
    echo "  MinIO:  http://localhost:9001 (minioadmin / minioadmin123)"
}

# 初始化数据库
init_db() {
    log_step "初始化数据库..."
    cd "$PROJECT_DIR/backend"

    # 确保 .env 存在（强制复制以确保配置正确）
    cp "$PROJECT_DIR/.env.development" .env
    log_info "已复制 .env.development 到 backend/.env"

    # 安装依赖（如果需要）
    if [ ! -d "node_modules" ] || [ ! -d "../node_modules" ]; then
        log_step "安装依赖..."
        cd "$PROJECT_DIR"
        pnpm install
        cd "$PROJECT_DIR/backend"
    fi

    # 运行 Prisma 迁移
    npx prisma db push
    log_info "✅ 数据库表已创建"
}

# 创建种子数据
seed_db() {
    log_step "创建测试数据..."
    cd "$PROJECT_DIR/backend"
    npx prisma db seed 2>/dev/null || {
        # 如果没有 seed 脚本，手动创建
        log_warn "没有找到 seed 脚本，跳过"
    }
}

# 初始化 Agent 服务
init_agent() {
    log_step "初始化 Agent 服务..."
    cd "$PROJECT_DIR/agent"

    # 确保 .env 存在
    cp "$PROJECT_DIR/.env.development" .env
    log_info "已复制 .env.development 到 agent/.env"
}

# 显示启动信息
show_startup_info() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║       📚 Word Teacher 本地开发环境启动中...               ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${GREEN}🌐 访问地址:${NC}"
    echo -e "     学生端:    ${BLUE}http://localhost:5173/${NC}"
    echo -e "     管理后台:  ${MAGENTA}http://localhost:5174/teacher-admin/${NC}"
    echo -e "     Agent API: http://localhost:8000"
    echo -e "     MinIO:     http://localhost:9001"
    echo ""
    echo -e "  ${GREEN}🔑 测试账号:${NC}"
    echo -e "     管理员: admin / 123456"
    echo -e "     教师:   xiaomei / 123456"
    echo -e "     学生:   2026050101 / 123456"
    echo ""
    echo -e "  ${YELLOW}💡 提示: 按 Ctrl+C 停止所有服务${NC}"
    echo ""
}

# 启动所有开发服务
start_all_services() {
    log_step "启动所有开发服务..."
    cd "$PROJECT_DIR"

    # 显示启动信息
    show_startup_info

    # 使用 concurrently 并行启动所有服务（包括 Agent）
    npx concurrently \
        --names "backend,agent,frontend,admin" \
        --prefix-colors "blue,yellow,green,magenta" \
        --kill-others-on-fail \
        "cd backend && pnpm dev" \
        "cd agent && pnpm dev" \
        "cd frontend && pnpm dev" \
        "cd admin && pnpm dev"
}

# 停止服务
stop_services() {
    log_step "停止 Docker 服务..."
    cd "$PROJECT_DIR"
    docker compose -f docker-compose.dev.yml down
    log_info "✅ 服务已停止"
}

# 重置数据库
reset_db() {
    log_warn "⚠️ 这将清空所有数据库数据!"
    read -p "确认重置? (y/N) " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        cd "$PROJECT_DIR"
        docker compose -f docker-compose.dev.yml down -v
        start_docker
        init_db
        log_info "✅ 数据库已重置"
    fi
}

# 主逻辑
case "${1:-}" in
    db)
        start_docker
        ;;
    stop)
        stop_services
        ;;
    reset)
        reset_db
        ;;
    *)
        # 默认: 启动所有服务
        check_docker
        start_docker
        init_db
        init_agent
        start_all_services
        ;;
esac

