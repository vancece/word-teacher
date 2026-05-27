# 技术方案：语音评测服务迁移至科大讯飞 ISE

> ✅ **状态：已完成** — 2026-05-27
>
> 已完全移除腾讯 SOE 和 STT fallback，跟读评测只使用科大讯飞 ISE。

## 1. 最终架构

```
前端录音 (WAV 16k/16bit/mono)
    ↓
Agent API (/api/agent/read-aloud/evaluate)
    ↓
科大讯飞 ISE (WebSocket)
    ↓
XML 解析 → 统一 ReadAloudResult → 前端展示
```

## 2. 保留的服务

| 服务 | 用途 | 环境变量 |
|------|------|---------|
| 科大讯飞 ISE | 跟读评测（唯一方案） | `XFYUN_APP_ID` / `XFYUN_API_KEY` / `XFYUN_API_SECRET` |
| 阿里云 STT | 对话场景语音转文字 | `ALIYUN_STT_APPKEY` / `ALIYUN_STT_TOKEN` 或 `ALIYUN_AK_ID` / `ALIYUN_AK_SECRET` |

## 3. 已移除

| 服务 | 原用途 | 已删除的环境变量 |
|------|--------|----------------|
| 腾讯云 SOE | 跟读评测 fallback | `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` / `TENCENT_APP_ID` |

已删除的文件：
- `agent/src/services/tencent-soe.service.ts`

已删除的代码：
- `read-aloud.agent.ts` 中的 SOE fallback 逻辑
- `read-aloud.agent.ts` 中的 STT + 文本对比 fallback 逻辑
- `config.ts` 中的 `tencentSoe` 配置
- `docker-compose.prod.yml` 中的腾讯环境变量
- `.github/workflows/deploy.yml` 中的腾讯 secrets 映射

## 4. 前端样式适配

单词评测结果直接使用讯飞返回的 `matchTag` 作为 CSS class：

| matchTag | 含义 | 样式 |
|----------|------|------|
| `correct` | 发音正确 | 绿色文字 |
| `mispronounced` | 发音错误 | 红色 + 波浪下划线 |
| `missing` | 漏读 | 灰色 + 删除线 |
| `extra` | 多读 | 紫色 + 斜体 |

## 5. 异常处理

- ISE 未配置 → 返回错误提示
- ISE 返回全 0 分 + 所有词 missing → 检测为静音，提示用户检查麦克风
- ISE 网络错误/超时 → 返回错误提示，用户可重试

## 6. 费用

- 免费额度：每日 500 次（完全够用）
- 当前日均调用：50-100 次
