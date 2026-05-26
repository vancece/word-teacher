# 常见问题排查

## 1. 数据库连接失败

**现象**: Backend 启动报 `Can't connect to MySQL`

**排查**:
```bash
docker compose -f docker-compose.dev.yml ps   # 检查 MySQL 容器状态
```

**解决**: 确认 `backend/.env` 中 DATABASE_URL 密码与 docker-compose.dev.yml 一致:
```
DATABASE_URL="mysql://root:root123456@localhost:3306/word_teacher"
```

## 2. Agent SOE 评测返回失败

**现象**: 评测结果显示 fallback 到 STT 方案

**排查**:
```bash
# 查看 Agent 日志
tail -50 /tmp/word-teacher-agent.log | grep TencentSOE
```

**常见原因**:
- SecretId/SecretKey 配置错误 → 检查 `agent/.env`
- 腾讯云账号未开通 SOE 服务 → 去控制台开通
- 音频格式问题 → 确认前端录音为 WAV 16kHz 16bit mono

## 3. 前端录音无声 / 评分 0 分

**现象**: 点击录音后评分一直是 0

**排查**:
1. 浏览器控制台检查 `[ReadAloudPage]` 日志
2. 确认浏览器已授权麦克风权限
3. 检查 audioBase64 长度是否 > 100

**解决**: Chrome 需要 HTTPS 或 localhost 才能用麦克风

## 4. AI 对话回复太长

**现象**: Lily 回复 5-6 句话

**原因**: Qwen-Omni 对指令遵循度有限

**当前措施**:
- System Prompt 末尾强调长度约束 (recency bias)
- temperature 降到 0.5
- 不使用 max_tokens（会导致截断）

**如果还是太长**: 考虑换用指令遵循更好的模型，或后端做裁剪

## 5. Prisma 相关

**`prisma db push` 报错**:
```bash
cd backend && npx prisma generate  # 先生成 client
cd backend && npx prisma db push   # 再推送 schema
```

**Prisma Studio 打不开**:
```bash
cd backend && npx prisma studio --port 5555
```

## 6. 端口冲突

| 服务 | 端口 | 冲突时 |
|------|------|--------|
| MySQL | 3306 | `lsof -i :3306` 找占用进程 |
| Backend | 3001 | 改 backend/.env 的 PORT |
| Agent | 8000 | 改 agent/.env 的 PORT |
| Frontend | 5174 | Vite 会自动 +1 |

## 7. SOE ScoreCoeff 太严/太松

**现象**: 小朋友读得不错但分数很低，或者读得不好也高分

**调整**: 修改 `agent/src/services/tencent-soe.service.ts` 中的 `ScoreCoeff`:
- 1.0 = 标准难度（成人）
- 2.0-3.0 = 适中（小学高年级）
- 3.5-4.0 = 宽松（小学低年级）← 当前值
- 5.0 = 非常宽松

## 8. 服务一键启动/停止

**启动所有**:
```bash
cd /Users/lianziyu/WebstormProjects/word-teacher
docker compose -f docker-compose.dev.yml up -d
cd backend && pnpm dev &
cd ../agent && pnpm dev &
cd ../frontend && pnpm dev &
```

**停止所有**:
```bash
pkill -f "tsx.*backend"
pkill -f "tsx.*agent"
pkill -f "vite.*frontend"
docker compose -f docker-compose.dev.yml down
```
