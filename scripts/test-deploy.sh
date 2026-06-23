#!/bin/bash
# 本地测试部署脚本 - 直接 SSH 到服务器验证部署逻辑
# 用法: ./scripts/test-deploy.sh [--dry-run] [--only-canary]
#
# --dry-run     只验证逻辑，不实际切换服务
# --only-canary 只测试 canary 启动，不做完整部署

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SSH_KEY="$PROJECT_DIR/github.pem"
SERVER="root@1.14.201.123"
SSH_CMD="ssh -o ConnectTimeout=10 -i $SSH_KEY $SERVER"

DRY_RUN=false
ONLY_CANARY=false

for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --only-canary) ONLY_CANARY=true ;;
  esac
done

echo "🧪 本地部署测试"
echo "   服务器: $SERVER"
echo "   dry-run: $DRY_RUN"
echo "   only-canary: $ONLY_CANARY"
echo ""

# 从 .env 读取 TCR 配置
source "$PROJECT_DIR/.env"

# 验证 TCR 登录
echo "📋 验证 TCR 登录..."
$SSH_CMD "echo '$TCR_PASSWORD' | docker login $TCR_REGISTRY -u $TCR_USERNAME --password-stdin" 2>&1
echo ""

# 验证镜像是否存在
echo "📋 检查 TCR 镜像..."
$SSH_CMD "
  docker pull $TCR_REGISTRY/$TCR_NAMESPACE/word-teacher-backend:latest && echo '✅ backend 镜像 OK' || echo '❌ backend 镜像不存在'
  docker pull $TCR_REGISTRY/$TCR_NAMESPACE/word-teacher-agent:latest && echo '✅ agent 镜像 OK' || echo '❌ agent 镜像不存在'
  docker pull $TCR_REGISTRY/$TCR_NAMESPACE/word-teacher-nginx:latest && echo '✅ nginx 镜像 OK' || echo '❌ nginx 镜像不存在'
"
echo ""

if [ "$ONLY_CANARY" = "true" ] || [ "$DRY_RUN" = "true" ]; then
  echo "📋 测试 canary 容器启动..."
  $SSH_CMD "
    cd /root/word-teacher

    DOCKER_NETWORK='word-teacher_word-teacher-network'
    IMAGE_PREFIX='vancece/word-teacher'
    MYSQL_PW=\$(grep '^MYSQL_PASSWORD=' .env | cut -d= -f2)

    # 清理旧 canary
    docker rm -f word-teacher-backend-canary word-teacher-agent-canary word-teacher-nginx-canary 2>/dev/null || true

    # 测试 backend canary
    echo '🔵 [backend] 启动 canary...'
    docker run -d --name word-teacher-backend-canary \
      --network \$DOCKER_NETWORK \
      --env-file .env \
      -e NODE_ENV=production -e PORT=3001 \
      -e DATABASE_URL=mysql://wordteacher:\${MYSQL_PW}@mysql:3306/word_teacher \
      -e LANCEDB_PATH=/app/data/lancedb \
      -e AGENT_URL=http://agent:3002/api/agent \
      -e MINIO_ENDPOINT=minio \
      -e MINIO_PORT=9000 \
      \${IMAGE_PREFIX}-backend:latest
    RC=\$?
    echo \"   docker run exit code: \$RC\"

    if [ \$RC -eq 0 ]; then
      # 健康检查
      HEALTHY=false
      for i in \$(seq 1 15); do
        if docker exec word-teacher-backend-canary wget -q -O /dev/null http://localhost:3001/api/health; then
          HEALTHY=true
          echo \"✅ [backend] canary 健康检查通过 (\${i}x2s)\"
          break
        fi
        sleep 2
      done
      if [ \"\$HEALTHY\" = \"false\" ]; then
        echo '❌ [backend] canary 健康检查失败'
        echo '--- 日志 ---'
        docker logs word-teacher-backend-canary --tail 20 2>&1
        echo '--- end ---'
      fi
    else
      echo '❌ [backend] docker run 失败!'
    fi

    # 测试 agent canary
    echo ''
    DASHSCOPE_KEY=\$(grep '^DASHSCOPE_API_KEY=' .env | cut -d= -f2)
    echo '🔵 [agent] 启动 canary...'
    docker run -d --name word-teacher-agent-canary \
      --network \$DOCKER_NETWORK \
      --env-file .env \
      -e NODE_ENV=production -e PORT=3002 \
      -e OPENAI_API_KEY=\${DASHSCOPE_KEY} \
      \${IMAGE_PREFIX}-agent:latest
    RC=\$?
    echo \"   docker run exit code: \$RC\"

    if [ \$RC -eq 0 ]; then
      HEALTHY=false
      for i in \$(seq 1 15); do
        if docker exec word-teacher-agent-canary wget -q -O /dev/null http://localhost:3002/api/agent/health; then
          HEALTHY=true
          echo \"✅ [agent] canary 健康检查通过 (\${i}x2s)\"
          break
        fi
        sleep 2
      done
      if [ \"\$HEALTHY\" = \"false\" ]; then
        echo '❌ [agent] canary 健康检查失败'
        docker logs word-teacher-agent-canary --tail 20 2>&1
      fi
    fi

    # 清理
    echo ''
    echo '🧹 清理 canary 容器...'
    docker rm -f word-teacher-backend-canary word-teacher-agent-canary word-teacher-nginx-canary 2>/dev/null || true
    echo '✅ 测试完成'
  "
  echo ""
  echo "🎉 canary 测试结束"
  exit 0
fi

# 完整部署（非 dry-run 且非 only-canary）
echo "⚠️  即将执行完整部署！按 Ctrl+C 取消，或 Enter 继续..."
read -r

$SSH_CMD "
  cd /root/word-teacher
  IMAGE_PREFIX='vancece/word-teacher'
  BUILD_BACKEND=success
  BUILD_FRONTEND=success
  BUILD_AGENT=success

  # 用 TCR 镜像打 tag
  docker tag $TCR_REGISTRY/$TCR_NAMESPACE/word-teacher-backend:latest \${IMAGE_PREFIX}-backend:latest
  docker tag $TCR_REGISTRY/$TCR_NAMESPACE/word-teacher-nginx:latest \${IMAGE_PREFIX}-nginx:latest
  docker tag $TCR_REGISTRY/$TCR_NAMESPACE/word-teacher-agent:latest \${IMAGE_PREFIX}-agent:latest

  # 直接 compose up
  docker compose -f docker-compose.prod.yml up -d
  sleep 5
  docker compose -f docker-compose.prod.yml ps
"

echo "🎉 部署完成"
