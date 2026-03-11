#!/bin/bash

# Word Teacher - Docker 部署脚本
# 使用方法: ./scripts/deploy.sh [command]
# 命令: build | up | down | logs | db-init | db-migrate | ssl | help

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 项目根目录
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════╗"
echo "║     🐳 Word Teacher - Docker 部署工具      ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"

# 检查 .env 文件
check_env() {
    if [ ! -f ".env" ]; then
        echo -e "${YELLOW}⚠️  .env 文件不存在，从模板创建...${NC}"
        cp .env.production.example .env
        echo -e "${RED}❌ 请编辑 .env 文件，填写实际的密钥和密码！${NC}"
        echo -e "   vim .env"
        exit 1
    fi
}

# 命令: 构建镜像
cmd_build() {
    echo -e "${BLUE}🔨 构建 Docker 镜像...${NC}"
    docker compose build --no-cache
    echo -e "${GREEN}✅ 镜像构建完成！${NC}"
}

# 命令: 启动服务
cmd_up() {
    check_env
    echo -e "${BLUE}🚀 启动所有服务...${NC}"
    docker compose up -d
    echo ""
    echo -e "${GREEN}✅ 服务启动完成！${NC}"
    echo ""
    echo -e "   ${CYAN}Backend${NC}  → http://localhost:3001/api/health"
    echo -e "   ${CYAN}Agent${NC}    → http://localhost:3002/health"
    echo -e "   ${CYAN}Frontend${NC} → http://localhost (需配置 SSL)"
    echo ""
    echo -e "${YELLOW}💡 查看日志: ./scripts/deploy.sh logs${NC}"
}

# 命令: 停止服务
cmd_down() {
    echo -e "${BLUE}🛑 停止所有服务...${NC}"
    docker compose down
    echo -e "${GREEN}✅ 服务已停止！${NC}"
}

# 命令: 查看日志
cmd_logs() {
    echo -e "${BLUE}📋 查看服务日志...${NC}"
    docker compose logs -f --tail=100
}

# 命令: 初始化数据库
cmd_db_init() {
    echo -e "${BLUE}🗄️  初始化数据库...${NC}"
    
    echo -e "${YELLOW}等待 MySQL 启动...${NC}"
    sleep 5
    
    echo -e "${YELLOW}推送数据库结构...${NC}"
    docker compose exec backend npx prisma db push
    
    echo -e "${YELLOW}运行数据种子...${NC}"
    docker compose exec backend npx tsx prisma/seed.ts
    
    echo -e "${GREEN}✅ 数据库初始化完成！${NC}"
}

# 命令: 数据库迁移
cmd_db_migrate() {
    echo -e "${BLUE}🔄 运行数据库迁移...${NC}"
    docker compose exec backend npx prisma migrate deploy
    echo -e "${GREEN}✅ 迁移完成！${NC}"
}

# 命令: 申请 SSL 证书
cmd_ssl() {
    echo -e "${BLUE}🔐 申请 SSL 证书...${NC}"
    
    # 创建目录
    mkdir -p deploy/ssl deploy/certbot/www
    
    # 先用 HTTP 模式启动 nginx
    echo -e "${YELLOW}启动临时 HTTP 服务...${NC}"
    docker compose up -d nginx
    
    # 使用 certbot 申请证书
    echo -e "${YELLOW}申请证书...${NC}"
    docker run --rm \
        -v "$ROOT_DIR/deploy/certbot/www:/var/www/certbot" \
        -v "$ROOT_DIR/deploy/ssl:/etc/letsencrypt/live/workly.cloud" \
        certbot/certbot certonly \
        --webroot -w /var/www/certbot \
        -d workly.cloud -d www.workly.cloud -d admin.workly.cloud \
        --email your-email@example.com \
        --agree-tos --no-eff-email
    
    echo -e "${GREEN}✅ SSL 证书申请完成！${NC}"
    echo -e "${YELLOW}💡 重启 nginx: docker compose restart nginx${NC}"
}

# 命令: 帮助
cmd_help() {
    echo "使用方法: ./scripts/deploy.sh [command]"
    echo ""
    echo "命令:"
    echo "  build      构建所有 Docker 镜像"
    echo "  up         启动所有服务"
    echo "  down       停止所有服务"
    echo "  logs       查看服务日志"
    echo "  db-init    初始化数据库（首次部署）"
    echo "  db-migrate 运行数据库迁移"
    echo "  ssl        申请 SSL 证书"
    echo "  help       显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  ./scripts/deploy.sh build    # 构建镜像"
    echo "  ./scripts/deploy.sh up       # 启动服务"
    echo "  ./scripts/deploy.sh logs     # 查看日志"
}

# 主逻辑
case "${1:-help}" in
    build)     cmd_build ;;
    up)        cmd_up ;;
    down)      cmd_down ;;
    logs)      cmd_logs ;;
    db-init)   cmd_db_init ;;
    db-migrate) cmd_db_migrate ;;
    ssl)       cmd_ssl ;;
    help|*)    cmd_help ;;
esac

