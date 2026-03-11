#!/bin/bash
# Word Teacher SSL 证书自动配置脚本
# 使用 Let's Encrypt 申请免费证书

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Word Teacher SSL 证书配置脚本${NC}"
echo -e "${GREEN}========================================${NC}"

# 获取域名
DOMAIN=${1:-workly.cloud}
echo -e "\n${YELLOW}域名: ${DOMAIN}${NC}"

# 检查是否在正确的目录
if [ ! -f "docker-compose.prod.yml" ]; then
    echo -e "${RED}错误: 请在 word-teacher 部署目录下运行此脚本${NC}"
    echo "cd ~/word-teacher && bash setup-ssl.sh"
    exit 1
fi

# 步骤 1: 安装 certbot
echo -e "\n${GREEN}[1/5] 安装 certbot...${NC}"
if ! command -v certbot &> /dev/null; then
    sudo apt update
    sudo apt install certbot -y
else
    echo "certbot 已安装"
fi

# 步骤 2: 停止 nginx 释放 80 端口
echo -e "\n${GREEN}[2/5] 停止 nginx 释放端口...${NC}"
docker compose -f docker-compose.prod.yml stop nginx || true

# 步骤 3: 申请证书
echo -e "\n${GREEN}[3/5] 申请 Let's Encrypt 证书...${NC}"
sudo certbot certonly --standalone \
    -d ${DOMAIN} \
    --non-interactive \
    --agree-tos \
    --email admin@${DOMAIN} \
    --preferred-challenges http

# 步骤 4: 复制证书到项目目录
echo -e "\n${GREEN}[4/5] 复制证书到项目目录...${NC}"
mkdir -p ./ssl
sudo cp /etc/letsencrypt/live/${DOMAIN}/fullchain.pem ./ssl/
sudo cp /etc/letsencrypt/live/${DOMAIN}/privkey.pem ./ssl/
sudo chown $(whoami):$(whoami) ./ssl/*.pem
chmod 644 ./ssl/*.pem

echo -e "${GREEN}证书已复制到 ./ssl/ 目录${NC}"
ls -la ./ssl/

# 步骤 5: 重启 nginx
echo -e "\n${GREEN}[5/5] 重启 nginx...${NC}"
docker compose -f docker-compose.prod.yml start nginx

# 完成
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  ✅ SSL 证书配置完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\n现在可以通过 HTTPS 访问:"
echo -e "  学生端: https://${DOMAIN}/teacher-test/"
echo -e "  管理端: https://${DOMAIN}/teacher-admin/"
echo -e "\n${YELLOW}提示: 证书有效期 90 天，建议设置自动续期${NC}"
echo "运行以下命令设置自动续期 cron:"
echo "  echo '0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/${DOMAIN}/*.pem ~/word-teacher/ssl/ && docker compose -f ~/word-teacher/docker-compose.prod.yml restart nginx' | sudo tee -a /etc/crontab"

