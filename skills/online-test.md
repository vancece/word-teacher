# Echo Kid 线上测试指南

## 🌐 线上环境地址

线上环境通过 Cloudflare Tunnel 暴露，域名是动态的：
- 学生端: `https://{动态域名}.trycloudflare.com/teacher-test`
- 管理后台: `https://{动态域名}.trycloudflare.com/teacher-admin`

> **获取当前域名**: 查看服务器上的 Cloudflare Tunnel 日志或部署输出

---

## 🔑 测试账号

| 角色 | 账号 | 密码 |
|------|------|------|
| 管理员 | `admin` | `123456` |
| 学生 | `2026050101` | `123456` |

---

## 🖥️ Chrome DevTools 自动化测试

### 常用工具命令

```bash
# 页面导航
navigate_page_chrome-devtools   # 导航到 URL
list_pages_chrome-devtools      # 列出所有页面
select_page_chrome-devtools     # 切换页面 (pageId)
new_page_chrome-devtools        # 打开新页面

# 页面交互
take_snapshot_chrome-devtools   # 获取页面快照 (a11y tree) - 返回 uid
click_chrome-devtools           # 点击元素 (uid)
fill_chrome-devtools            # 填写单个输入框 (uid, value)
fill_form_chrome-devtools       # 批量填写表单 ([{uid, value}])

# 等待和截图
wait_for_chrome-devtools        # 等待文本出现 (text[], timeout)
take_screenshot_chrome-devtools # 截图
navigate_page_chrome-devtools   # 刷新页面 (type: "reload")
```

### 测试流程示例

```javascript
// 1. 打开页面
navigate_page → { type: "url", url: "https://xxx.trycloudflare.com/teacher-admin" }

// 2. 获取页面快照，找到元素 uid
take_snapshot → 返回页面元素树，每个元素有 uid

// 3. 填写表单
fill_form → { elements: [
  { uid: "xxx_5", value: "admin" },
  { uid: "xxx_7", value: "123456" }
]}

// 4. 点击按钮
click → { uid: "xxx_9" }

// 5. 等待页面响应
wait_for → { text: ["仪表盘", "登录失败"], timeout: 15000 }

// 6. 多页面切换
select_page → { pageId: 1 }  // 切换到第一个页面
```

---

## 📋 完整测试流程

### 1. 管理后台测试

```
1. navigate_page → 打开 /teacher-admin
2. take_snapshot → 获取页面元素 uid
3. fill_form → 输入 admin / 123456
4. click → 点击登录按钮
5. wait_for → 等待 "仪表盘" 出现
6. 验证功能:
   - click "教师管理" → take_snapshot 验证教师列表
   - click "班级管理" → take_snapshot 验证班级列表
   - click "场景管理" → click "添加场景"
   - fill_form 填写场景信息 → click "AI 补充"
   - wait_for "AI 补充完成" → click "添加场景"
   - wait_for 场景名称出现 → 验证创建成功
```

### 2. 学生端测试

```
1. new_page → 打开 /teacher-test (新标签页)
2. fill_form → 输入 2026050101 / 123456
3. click → 点击登录按钮
4. wait_for → 等待用户名或场景列表出现
5. 验证跟读功能:
   - click "英语跟读" → click 跟读场景卡片
   - wait_for 句子内容 → 验证句子显示
   - click "返回"
6. 验证对话功能:
   - click 对话场景卡片
   - wait_for AI 回复 (可能需要 30 秒)
   - click "切换到文字输入"
   - fill 输入框 → click 发送按钮
   - wait_for AI 新回复 → 验证对话正常
```

### 3. 清理测试数据

```
1. select_page → 切换到管理后台页面
2. click "场景管理"
3. 对每个测试场景:
   - click 删除按钮 (通常是最后一个 button)
   - wait_for "确定要删除" → click "确 定"
   - wait_for "暂无" 或 "删除成功"
```

---

## 🐛 已发现并修复的问题

### 1. 中文乱码问题 (已修复 2026-03-05)
**现象**: 学生端用户名显示为 `å¼ ä¸‰` 而不是中文

**原因**: 后端 API 响应缺少 UTF-8 字符集声明

**修复方案**:
- `backend/src/app.ts`: 添加中间件设置 `Content-Type: application/json; charset=utf-8`
- `deploy/nginx-docker.conf`: 添加 `charset utf-8` 全局配置

---

## ✅ 已验证功能清单 (2026-03-05)

### 管理后台
- [x] 管理员登录
- [x] 仪表盘统计数据
- [x] 场景管理 (跟读/对话切换)
- [x] **添加跟读场景** - 表单填写、AI 补充、封面图生成
- [x] **添加对话场景** - 关键词添加、AI 补充
- [x] 场景删除

### 学生端
- [x] 学生登录
- [x] 首页场景列表显示
- [x] **跟读功能** - 进入场景、句子显示、录音按钮
- [x] **AI 对话** - AI 主动打招呼、语音播放
- [x] **文字输入对话** - 发送消息、AI 回复、中文翻译

### AI 功能
- [x] 对话 AI 回复 (Qwen-Omni)
- [x] 翻译生成
- [x] 语音合成
- [x] 场景封面图生成

---

## ⚠️ 注意事项

1. **Cloudflare Tunnel 地址动态变化** - 每次部署/重启后检查最新地址
2. **线上数据库独立** - 不与本地开发环境共享数据
3. **AI 响应时间** - 线上环境 AI 响应可能需要 5-30 秒，wait_for 超时建议设 30000ms
4. **测试后务必清理** - 删除测试创建的场景数据
5. **多页面测试** - 使用 `new_page` 打开新标签页，用 `select_page` 切换

