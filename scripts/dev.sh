#!/bin/bash

# Word Teacher - 本地开发启动脚本
# 使用方法: ./scripts/dev.sh 或 pnpm dev:start

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 项目根目录
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════╗"
echo "║     🎓 Word Teacher - 开发环境启动器       ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}❌ pnpm 未安装，请先安装: npm install -g pnpm${NC}"
    exit 1
fi

# 检查 .env 文件
check_env() {
    local dir=$1
    local name=$2
    if [ ! -f "$dir/.env" ]; then
        if [ -f "$dir/.env.example" ]; then
            echo -e "${YELLOW}⚠️  $name/.env 不存在，从 .env.example 复制...${NC}"
            cp "$dir/.env.example" "$dir/.env"
            echo -e "${YELLOW}   请编辑 $name/.env 配置必要的环境变量${NC}"
        else
            echo -e "${RED}❌ $name/.env 和 .env.example 都不存在${NC}"
            exit 1
        fi
    fi
}

echo -e "${BLUE}📋 检查环境配置...${NC}"
check_env "backend" "backend"
check_env "agent" "agent"

# 检查依赖
echo -e "${BLUE}📦 检查依赖...${NC}"
if [ ! -d "node_modules" ] || [ ! -d "backend/node_modules" ]; then
    echo -e "${YELLOW}⚠️  依赖未安装，正在安装...${NC}"
    pnpm install
fi

# 生成 Prisma Client
echo -e "${BLUE}🔧 生成 Prisma Client...${NC}"
cd backend && pnpm db:generate > /dev/null 2>&1 && cd ..

# 显示服务信息
echo ""
echo -e "${GREEN}🚀 启动所有服务...${NC}"
echo ""
echo -e "   ${CYAN}Backend${NC}  → http://localhost:3001/api"
echo -e "   ${CYAN}Agent${NC}    → http://localhost:3002"
echo -e "   ${CYAN}Frontend${NC} → http://localhost:5173"
echo -e "   ${CYAN}Admin${NC}    → http://localhost:5174"
echo ""
echo -e "${YELLOW}💡 提示: 按 Ctrl+C 停止所有服务${NC}"
echo ""

# 启动所有服务
pnpm -r --parallel run dev

