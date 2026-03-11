#!/bin/bash

# Word Teacher - Docker 镜像推送脚本
# 使用方法: ./scripts/docker-push.sh [version]
# 示例: ./scripts/docker-push.sh v1.0.0

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Docker Hub 仓库
REGISTRY="vancece"
REPO_BACKEND="word-teacher-backend"
REPO_AGENT="word-teacher-agent"
REPO_NGINX="word-teacher-nginx"

# 版本号（默认使用 git commit hash）
VERSION="${1:-$(git rev-parse --short HEAD)}"

# 项目根目录
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════╗"
echo "║     🐳 Docker 镜像构建 & 推送工具          ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${BLUE}📦 版本号: ${VERSION}${NC}"
echo ""

# 检查 Docker 登录状态
check_login() {
    if ! docker info 2>/dev/null | grep -q "Username"; then
        echo -e "${YELLOW}⚠️  请先登录 Docker Hub:${NC}"
        echo -e "   docker login"
        exit 1
    fi
}

# 构建并推送单个镜像
build_and_push() {
    local name=$1
    local dockerfile=$2
    local repo=$3
    
    echo -e "${BLUE}🔨 构建 ${name}...${NC}"
    docker build -t ${REGISTRY}/${repo}:${VERSION} -t ${REGISTRY}/${repo}:latest -f ${dockerfile} .
    
    echo -e "${BLUE}📤 推送 ${name}...${NC}"
    docker push ${REGISTRY}/${repo}:${VERSION}
    docker push ${REGISTRY}/${repo}:latest
    
    echo -e "${GREEN}✅ ${name} 推送完成！${NC}"
    echo ""
}

# 主流程
main() {
    check_login
    
    echo -e "${YELLOW}开始构建和推送镜像...${NC}"
    echo ""
    
    # 构建并推送 Backend
    build_and_push "Backend" "Dockerfile.backend" "${REPO_BACKEND}"
    
    # 构建并推送 Agent
    build_and_push "Agent" "Dockerfile.agent" "${REPO_AGENT}"
    
    # 构建并推送 Nginx (前端)
    build_and_push "Nginx (Frontend)" "Dockerfile.nginx" "${REPO_NGINX}"
    
    echo -e "${GREEN}════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ 所有镜像推送完成！${NC}"
    echo ""
    echo -e "镜像列表:"
    echo -e "  ${CYAN}${REGISTRY}/${REPO_BACKEND}:${VERSION}${NC}"
    echo -e "  ${CYAN}${REGISTRY}/${REPO_AGENT}:${VERSION}${NC}"
    echo -e "  ${CYAN}${REGISTRY}/${REPO_NGINX}:${VERSION}${NC}"
    echo ""
    echo -e "${YELLOW}💡 在服务器上部署:${NC}"
    echo -e "   1. 复制 docker-compose.prod.yml 和 .env 到服务器"
    echo -e "   2. 修改 .env 中的 IMAGE_TAG=${VERSION}"
    echo -e "   3. 运行: docker compose -f docker-compose.prod.yml up -d"
}

main

