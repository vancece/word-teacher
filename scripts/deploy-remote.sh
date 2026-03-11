#!/bin/bash
# Word Teacher 远程部署脚本
# 用法: ./scripts/deploy-remote.sh [backend|agent|nginx|all|sync|status|logs|verify|db-push|seed]
#
# ⚠️ 所有配置都在服务器的 .env 文件中管理
# ⚠️ 不要在此脚本中硬编码任何环境变量

set -e

# ============ 服务器配置 ============
SERVER_IP="${DEPLOY_SERVER_IP:-YOUR_SERVER_IP}"
SERVER_USER="${DEPLOY_SERVER_USER:-root}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/word-teacher.pem}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/root/word-teacher}"

# ============ 数据库配置 ============
DB_USER="${DB_USER:-wordteacher}"
DB_PASS="${DB_PASS:-change_this_app_password_456}"
DB_NAME="${DB_NAME:-word_teacher}"

# 项目根目录
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# 如果项目目录下有 julian.pem，优先使用（向后兼容）
[ -f "$ROOT_DIR/julian.pem" ] && SSH_KEY="$ROOT_DIR/julian.pem"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# 检查 SSH 密钥
[ ! -f "$SSH_KEY" ] && log_error "SSH 密钥不存在: $SSH_KEY\n提示: 将密钥放在 ~/.ssh/word-teacher.pem 或项目根目录的 julian.pem"

SSH_CMD="ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP"
SCP_CMD="scp -i $SSH_KEY"

# ============ 核心函数 ============

build_and_upload() {
    local name=$1
    local dockerfile=$2
    local tag="vanceliance/word-teacher-${name}:latest"
    local no_cache="${3:-false}"

    log_step "1/5 构建 $name (linux/amd64)..."
    if [ "$no_cache" = "true" ]; then
        log_warn "使用 --no-cache 强制重新构建"
        docker build --no-cache --platform linux/amd64 -t "$tag" -f "$dockerfile" .
    else
        docker build --platform linux/amd64 -t "$tag" -f "$dockerfile" .
    fi

    log_step "2/5 验证构建结果..."
    verify_local_image "$name"

    log_step "3/5 保存镜像..."
    docker save "$tag" | gzip > "/tmp/${name}.tar.gz"

    log_step "4/5 上传到服务器..."
    $SCP_CMD "/tmp/${name}.tar.gz" "$SERVER_USER@$SERVER_IP:/root/"

    log_step "5/5 加载并重启服务..."
    # 删除旧镜像，加载新镜像，使用 IMAGE_TAG=latest 重启
    $SSH_CMD "cd /root && \
              docker rmi vanceliance/word-teacher-${name}:latest 2>/dev/null || true && \
              gunzip -c ${name}.tar.gz | docker load && \
              cd $REMOTE_DIR && IMAGE_TAG=latest docker compose -f docker-compose.prod.yml up -d --force-recreate ${name}"

    log_info "✅ $name 部署完成!"

    # 部署后验证
    sleep 3
    verify_deployment "$name"

    # 自动运行完整健康检查
    echo ""
    log_info "🏥 自动运行部署后健康检查..."
    health_check
}

# 验证本地构建的镜像
verify_local_image() {
    local name=$1
    local tag="vanceliance/word-teacher-${name}:latest"

    if [ "$name" = "backend" ]; then
        log_info "检查 Prisma schema..."
        local schema_check=$(docker run --rm "$tag" cat prisma/schema.prisma 2>/dev/null | head -20)
        if echo "$schema_check" | grep -q "model Student"; then
            log_info "✓ Schema 包含 Student 模型"
        elif echo "$schema_check" | grep -q "model User"; then
            log_warn "⚠ Schema 使用旧的 User 模型，可能需要 --no-cache 重新构建"
        fi
    fi
}

# 验证远程部署结果
verify_deployment() {
    local name=$1

    log_info "验证 $name 部署状态..."

    # 检查容器是否运行
    local status=$($SSH_CMD "docker ps --filter name=word-teacher-${name} --format '{{.Status}}'" 2>/dev/null)
    if echo "$status" | grep -q "Up"; then
        log_info "✓ 容器运行中: $status"
    else
        log_error "✗ 容器未运行，请检查日志: ./scripts/deploy-remote.sh logs $name"
    fi

    # 针对不同服务的额外检查
    case "$name" in
        backend)
            log_info "检查 Backend API..."
            local api_check=$($SSH_CMD "curl -s http://127.0.0.1:80/teacher-test/api/health 2>/dev/null || echo 'FAILED'" | head -1)
            if [ "$api_check" != "FAILED" ]; then
                log_info "✓ Backend API 响应正常"
            else
                log_warn "⚠ Backend API 无响应，可能还在启动中"
            fi
            ;;
        nginx)
            log_info "检查 Nginx 代理..."
            # 检查 /minio 代理是否配置
            local minio_config=$($SSH_CMD "docker exec word-teacher-nginx cat /etc/nginx/nginx.conf | grep -c '/minio/' || echo 0")
            if [ "$minio_config" -ge 2 ]; then
                log_info "✓ MinIO 代理配置正确 (HTTPS + HTTP)"
            else
                log_warn "⚠ MinIO 代理配置可能不完整，检查 8080 端口是否有 /minio/"
            fi
            ;;
    esac
}

sync_config() {
    log_info "📤 同步配置文件..."
    $SCP_CMD docker-compose.prod.yml "$SERVER_USER@$SERVER_IP:$REMOTE_DIR/"
    $SCP_CMD deploy/nginx-docker.conf "$SERVER_USER@$SERVER_IP:$REMOTE_DIR/nginx.conf"
    $SCP_CMD .env.production.example "$SERVER_USER@$SERVER_IP:$REMOTE_DIR/.env.example"

    log_info "✅ 配置同步完成"
    log_warn "如需更新 .env，请手动编辑服务器上的文件:"
    echo "  ./scripts/deploy-remote.sh ssh"
    echo "  vim $REMOTE_DIR/.env"
}

show_status() {
    log_info "📊 服务状态:"
    $SSH_CMD "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml ps"
}

show_logs() {
    local service="${1:-backend}"
    log_info "📋 $service 日志:"
    $SSH_CMD "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml logs --tail 50 $service"
}

restart_all() {
    log_info "🔄 重启所有服务..."
    # 确保使用 latest 标签
    $SSH_CMD "cd $REMOTE_DIR && IMAGE_TAG=latest docker compose -f docker-compose.prod.yml up -d"
    show_status
}

# 数据库迁移
db_push() {
    log_info "🗃️ 运行数据库迁移..."

    log_step "1. 检查当前表结构..."
    $SSH_CMD "docker exec word-teacher-mysql mysql -u ${DB_USER} -p${DB_PASS} ${DB_NAME} -e 'SHOW TABLES;'"

    log_step "2. 执行 Prisma db push..."
    local push_result=$($SSH_CMD "docker exec word-teacher-backend npx prisma db push --accept-data-loss 2>&1")
    echo "$push_result"

    log_step "3. 验证表结构..."
    $SSH_CMD "docker exec word-teacher-mysql mysql -u ${DB_USER} -p${DB_PASS} ${DB_NAME} -e 'SHOW TABLES;'"

    log_info "✅ 数据库迁移完成"
}

# 数据库重置（危险操作）
db_reset() {
    log_warn "⚠️ 这将清空所有数据！"
    read -p "确认重置数据库? (输入 'yes' 确认): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "已取消"
        return
    fi

    log_info "🗃️ 重置数据库..."
    $SSH_CMD "docker exec word-teacher-backend npx prisma db push --force-reset --accept-data-loss"

    log_info "✅ 数据库已重置"
    log_warn "提示: 运行 ./scripts/deploy-remote.sh seed 创建初始数据"
}

# 创建种子数据
seed_data() {
    log_info "🌱 创建种子数据..."

    # 生成密码 hash
    local password_hash=$($SSH_CMD "docker exec word-teacher-backend node -e \"console.log(require('bcryptjs').hashSync('123456', 10))\"")
    log_info "密码 hash 已生成 (密码: 123456)"

    # 创建临时 SQL 文件（确保 UTF-8 编码）
    cat > /tmp/seed.sql << 'SEEDSQL'
-- 设置字符集
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- 清理旧数据
DELETE FROM students WHERE studentNo IN ('2026050101', '2026050102');
DELETE FROM teachers WHERE username IN ('admin', 'teacher1', 'xiaomei');
DELETE FROM classes WHERE name IN ('三年级1班', '四年级2班');

-- 创建管理员教师
INSERT INTO teachers (username, password, name, is_admin, created_at, updated_at) VALUES
('admin', 'HASH_PLACEHOLDER', 'Admin', 1, NOW(), NOW()),
('xiaomei', 'HASH_PLACEHOLDER', '小美老师', 0, NOW(), NOW());

-- 创建班级
INSERT INTO classes (name, grade, created_at, updated_at) VALUES
('三年级1班', '三年级', NOW(), NOW()),
('四年级2班', '四年级', NOW(), NOW());

-- 创建测试学生
INSERT INTO students (studentNo, password, name, class_id, seat_no, created_at, updated_at) VALUES
('2026050101', 'HASH_PLACEHOLDER', '张三', 1, 1, NOW(), NOW()),
('2026050102', 'HASH_PLACEHOLDER', '李四', 1, 2, NOW(), NOW());
SEEDSQL

    # 替换密码占位符
    sed -i.bak "s|HASH_PLACEHOLDER|${password_hash}|g" /tmp/seed.sql

    # 上传并执行 SQL
    scp -i "$SSH_KEY" -o StrictHostKeyChecking=no /tmp/seed.sql ${SERVER_USER}@${SERVER_IP}:/tmp/seed.sql
    $SSH_CMD "docker cp /tmp/seed.sql word-teacher-mysql:/tmp/seed.sql"
    $SSH_CMD "docker exec word-teacher-mysql mysql -u ${DB_USER} -p${DB_PASS} ${DB_NAME} --default-character-set=utf8mb4 < /tmp/seed.sql"

    # 清理临时文件
    rm -f /tmp/seed.sql /tmp/seed.sql.bak
    $SSH_CMD "rm -f /tmp/seed.sql"

    log_info "✅ 种子数据创建完成"
    log_info "测试账号:"
    echo "  教师: admin / 123456, xiaomei / 123456"
    echo "  学生: 2026050101 / 123456, 2026050102 / 123456"
}

# 健康检查
health_check() {
    log_info "🏥 运行健康检查..."

    echo ""
    log_step "1. 检查容器状态"
    $SSH_CMD "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep word-teacher"

    echo ""
    log_step "2. 检查学生端 API"
    local student_api=$($SSH_CMD "curl -s 'http://127.0.0.1:80/teacher-test/api/student/auth/classes'" 2>/dev/null)
    if echo "$student_api" | grep -q '"success":true'; then
        log_info "✓ 学生端 API 正常"
    else
        log_warn "✗ 学生端 API 异常: $student_api"
    fi

    echo ""
    log_step "3. 检查教师端 API"
    local teacher_api=$($SSH_CMD "curl -s 'http://127.0.0.1:80/teacher-admin/api/health'" 2>/dev/null || echo "")
    log_info "教师端响应: $teacher_api"

    echo ""
    log_step "4. 检查 MinIO 代理 (8080 端口)"
    local minio_check=$($SSH_CMD "docker exec word-teacher-nginx wget -q -O /dev/null --server-response 'http://localhost:8080/minio/covers/' 2>&1 | head -3")
    if echo "$minio_check" | grep -q "200\|403"; then
        log_info "✓ MinIO 代理正常 (8080 端口)"
    else
        log_warn "✗ MinIO 代理可能有问题"
    fi

    echo ""
    log_info "✅ 健康检查完成"
}

# ============ 主逻辑 ============

echo -e "${CYAN}╔════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   🚀 Word Teacher 远程部署工具 v2.0        ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════╝${NC}"
echo ""

case "${1:-help}" in
    backend)
        build_and_upload "backend" "Dockerfile.backend" "${2:-false}"
        ;;
    backend-clean)
        # 强制无缓存构建
        build_and_upload "backend" "Dockerfile.backend" "true"
        ;;
    agent)
        build_and_upload "agent" "Dockerfile.agent" "${2:-false}"
        ;;
    nginx)
        build_and_upload "nginx" "Dockerfile.nginx" "${2:-false}"
        ;;
    all)
        build_and_upload "backend" "Dockerfile.backend"
        build_and_upload "agent" "Dockerfile.agent"
        build_and_upload "nginx" "Dockerfile.nginx"
        ;;
    sync)
        sync_config
        ;;
    restart)
        restart_all
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "${2:-backend}"
        ;;
    ssh)
        log_info "连接服务器..."
        $SSH_CMD
        ;;
    health)
        health_check
        ;;
    db-push)
        db_push
        ;;
    db-reset)
        db_reset
        ;;
    seed)
        seed_data
        ;;
    *)
        echo "用法: ./scripts/deploy-remote.sh <命令> [参数]"
        echo ""
        echo -e "${GREEN}部署命令:${NC}"
        echo "  backend       构建并部署 Backend"
        echo "  backend-clean 强制无缓存构建 Backend (解决缓存问题)"
        echo "  agent         构建并部署 Agent"
        echo "  nginx         构建并部署 Nginx"
        echo "  all           部署所有服务"
        echo ""
        echo -e "${GREEN}数据库命令:${NC}"
        echo "  db-push       运行数据库迁移 (prisma db push)"
        echo "  db-reset      重置数据库 (⚠️ 清空所有数据)"
        echo "  seed          创建种子数据 (测试账号)"
        echo ""
        echo -e "${GREEN}管理命令:${NC}"
        echo "  sync          同步配置文件到服务器"
        echo "  restart       重启所有服务"
        echo "  status        查看服务状态"
        echo "  logs [服务]   查看日志 (默认: backend)"
        echo "  health        运行健康检查"
        echo "  ssh           SSH 连接到服务器"
        echo ""
        echo -e "${YELLOW}常见问题解决:${NC}"
        echo "  部署后代码没更新?   使用 backend-clean 强制重新构建"
        echo "  数据库表没创建?     运行 db-push 或 db-reset"
        echo "  图片 404?           检查 nginx 配置并重新部署"
        echo ""
        echo "示例:"
        echo "  ./scripts/deploy-remote.sh backend-clean  # 强制重新构建后端"
        echo "  ./scripts/deploy-remote.sh health         # 健康检查"
        echo "  ./scripts/deploy-remote.sh db-push        # 数据库迁移"
        ;;
esac

