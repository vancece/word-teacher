#!/bin/bash
# 手动触发 GitHub Actions 部署流水线
gh workflow run deploy.yml --ref master
echo "✅ 流水线已触发，查看状态: https://github.com/vancece/word-teacher/actions/workflows/deploy.yml"
