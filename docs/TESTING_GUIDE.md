# Word Teacher 测试指南

## 测试环境

- **生产地址**: `http://YOUR_SERVER_IP/teacher-test`
- **管理后台**: `http://YOUR_SERVER_IP/teacher-admin`
- **测试账号**:
  - 管理员: `admin` / `123456`
  - 学生: `student` / `123456`

## 功能测试清单

### 1. 学生端 (Frontend)

#### 1.1 用户认证
- [ ] 登录功能正常
- [ ] 退出登录正常
- [ ] 页面刷新后保持登录状态

#### 1.2 首页
- [ ] 显示练习模式选择（AI 对话/英语跟读）
- [ ] 显示可用场景列表
- [ ] 场景卡片显示封面图、名称、描述、难度、关键词

#### 1.3 AI 对话练习
- [ ] 进入场景后 AI 自动问候
- [ ] 语音输入功能正常
- [ ] 文字输入功能正常
- [ ] AI 回复有语音和文字
- [ ] 中文翻译显示正常
- [ ] 5 轮对话后自动评分
- [ ] 评分页面显示各项分数、反馈、亮点、建议
- [ ] 评分严格（乱说话得低分）

#### 1.4 英语跟读练习
- [ ] 跟读句子列表显示正常
- [ ] 播放示范音频正常
- [ ] 录音功能正常
- [ ] AI 评估发音正常
- [ ] 评分结果显示正常

### 2. 管理后台 (Admin)

#### 2.1 用户认证
- [ ] 登录功能正常（仅教师/管理员可登录）
- [ ] 退出登录正常

#### 2.2 仪表盘
- [ ] 统计数据显示正常
- [ ] 图表加载正常

#### 2.3 教师管理（仅管理员）
- [ ] 查看教师列表
- [ ] 添加教师
- [ ] 编辑教师
- [ ] 删除教师（不能删除自己）

#### 2.4 班级管理
- [ ] 查看班级列表
- [ ] 添加/编辑/删除班级
- [ ] 管理班级学生

#### 2.5 场景管理
- [ ] 查看跟读场景列表（显示所属教师）
- [ ] 查看对话场景列表（显示所属教师）
- [ ] 添加场景 + AI 补充（翻译+封面图）
- [ ] 编辑场景
- [ ] 删除场景
- [ ] 切换场景可见性

#### 2.6 跟读记录
- [ ] 查看跟读记录列表
- [ ] 筛选功能正常

#### 2.7 进步情况
- [ ] 查看学生进步图表
- [ ] 筛选功能正常

### 3. API 测试

```bash
# 健康检查
curl http://YOUR_SERVER_IP/teacher-test/api/health

# 登录
curl -X POST http://YOUR_SERVER_IP/teacher-test/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"student","password":"123456"}'
```

## 常见问题排查

### 问题：AI 对话无响应
1. 检查 Agent 服务状态：`docker compose ps agent`
2. 检查 Agent 日志：`docker logs word-teacher-agent`
3. 确认 `DASHSCOPE_API_KEY` 环境变量已设置

### 问题：评分显示"无法评估"
1. 确保完成了 5 轮对话
2. 检查 Agent 评分日志

### 问题：Admin AI 补充失败
1. 检查后端日志：`docker logs word-teacher-backend`
2. 确认 `/api/admin/scene/supplement` 路由正常

### 问题：场景不显示所属教师
- 旧场景可能没有 `creatorId`，显示"未知"是正常的
- 新创建的场景会正确显示教师名称

## 服务器命令

```bash
# 查看所有服务状态
docker compose -f docker-compose.prod.yml ps

# 查看服务日志
docker logs word-teacher-backend 2>&1 | tail -50
docker logs word-teacher-agent 2>&1 | tail -50
docker logs word-teacher-nginx 2>&1 | tail -50

# 重启服务
docker compose -f docker-compose.prod.yml restart backend
docker compose -f docker-compose.prod.yml restart agent
docker compose -f docker-compose.prod.yml restart nginx
```

