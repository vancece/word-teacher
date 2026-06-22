# AI 助手 MCP 架构技术方案

## 概述

将 AI 助手从"硬编码 Function Calling + switch/case"升级为"嵌入式 MCP Server"架构。工具以独立文件注册，Agent 核心不再关心具体工具逻辑。

## 架构图

```
┌──────────────────────────────────────────────────────┐
│  Agent 服务 (Node.js, 单进程)                         │
│                                                      │
│  ┌──────────────┐      ┌────────────────────────┐    │
│  │  AssistantAgent │──→│  McpToolRegistry        │    │
│  │  (LLM Client)  │←──│  - listTools()          │    │
│  └──────────────┘      │  - executeTool(name,args)│   │
│                         └────────────────────────┘    │
│                                    │                  │
│              ┌─────────────────────┼──────────┐       │
│              ↓                     ↓          ↓       │
│   ┌─────────────────┐  ┌──────────────┐  ┌────────┐ │
│   │ knowledge.tool   │  │ student.tool │  │ ...    │ │
│   │ (搜索知识库)      │  │ (查/改学生)   │  │        │ │
│   └─────────────────┘  └──────────────┘  └────────┘ │
└──────────────────────────────────────────────────────┘
              ↓ HTTP 回调
┌──────────────────────────┐
│  Backend /api/internal/* │
└──────────────────────────┘
```

## 设计原则

1. **单进程嵌入** — 不起独立 MCP Server 进程，工具注册在 Agent 内存中
2. **文件即工具** — `agent/src/tools/*.tool.ts` 每个文件导出一个工具定义
3. **自动发现** — 启动时扫描 tools 目录，自动注册
4. **协议兼容** — 工具定义遵循 MCP Tool schema（name/description/inputSchema）
5. **LLM 透传** — 自动将 MCP tools 转为 OpenAI tools 格式传给 Qwen

## 工具定义规范

每个 `*.tool.ts` 文件导出一个 `McpTool` 对象：

```typescript
// agent/src/tools/types.ts
export interface McpTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
  execute: (args: Record<string, any>, context: ToolContext) => Promise<ToolResult>
}

export interface ToolContext {
  backendUrl: string
  headers: Record<string, string>
}

export interface ToolResult {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}
```

## 文件结构

```
agent/src/
├── agents/
│   └── assistant.agent.ts    # LLM 对话，调用 registry
├── tools/
│   ├── types.ts              # McpTool 接口定义
│   ├── registry.ts           # 工具注册中心（自动发现 + 执行派发）
│   ├── knowledge.tool.ts     # 知识库搜索
│   ├── student.tool.ts       # 学生查询/重置密码
│   ├── class.tool.ts         # 班级查询
│   ├── records.tool.ts       # 学习记录查询
│   ├── progress.tool.ts      # 进步趋势查询
│   └── stats.tool.ts         # 平台统计概览
└── routes/
    └── assistant.routes.ts   # HTTP 路由（精简，只做转发）
```

## TODO

### Phase 1: 基础设施 ✅
- [x] 创建 `agent/src/tools/types.ts` — McpTool 接口定义
- [x] 创建 `agent/src/tools/registry.ts` — 工具注册中心
- [x] 改造 `assistant.agent.ts` — 从 registry 获取 tools 列表，执行时调用 registry

### Phase 2: 迁移现有工具 ✅
- [x] 创建 `knowledge.tool.ts` — 知识库搜索
- [x] 创建 `student.tool.ts` — queryStudents + resetStudentPassword
- [x] 创建 `class.tool.ts` — queryClasses
- [x] 创建 `records.tool.ts` — queryLearningRecords
- [x] 创建 `progress.tool.ts` — queryProgress
- [x] 创建 `stats.tool.ts` — getOverviewStats

### Phase 3: 精简路由层 ✅
- [x] 精简 `assistant.routes.ts` — 全部走 registry，只剩 HTTP 转发
- [x] assistant.agent.ts 不再硬编码 TOOLS 数组
- [x] Backend 新增 `/api/internal/*` 路由（Agent API Key 认证）

### Phase 4: 验证
- [ ] 本地测试：知识库问答
- [ ] 本地测试：数据查询（"查一下张三的成绩"）
- [ ] 本地测试：操作执行（"重置张三密码"）
- [ ] 确认 token 消耗在预期范围内

### Phase 5: 后续扩展（未来）
- [ ] 新工具：批量导出学习报告
- [ ] 新工具：发送钉钉通知
- [ ] 新工具：场景管理（创建/编辑场景）
- [ ] 工具执行日志（记录每次工具调用，方便审计）

## 安全白名单

AI 助手只能调用已注册的 MCP 工具，未注册的操作 LLM 完全不可见。

### ✅ 已注册（白名单内）

| 工具 | 类型 | 说明 |
|------|------|------|
| `searchKnowledge` | 只读 | 搜索知识库 |
| `queryStudents` | 只读 | 查学生信息和成绩 |
| `queryClasses` | 只读 | 查班级列表 |
| `queryLearningRecords` | 只读 | 查学习记录 |
| `queryProgress` | 只读 | 查进步趋势 |
| `getOverviewStats` | 只读 | 查平台统计 |
| `resetStudentPassword` | 写入 | 重置学生密码（低风险，可恢复） |

### ❌ 不注册（永远不提供给 AI）

| 操作 | 原因 |
|------|------|
| 删除学生 | 不可逆，会级联删除所有记录 |
| 删除班级 | 不可逆 |
| 删除/创建教师 | 权限敏感 |
| 修改教师角色（设为管理员） | 权限提升 |
| 删除学习记录 | 数据不可恢复 |
| 删除场景 | 影响全校学生 |
| 修改系统配置 | 基础设施级 |

### 设计原则

1. **白名单优于黑名单** — 只注册安全工具，不存在"忘了 block"的风险
2. **写操作最小化** — 当前唯一写操作是重置密码（低风险、可恢复、高频需求）
3. **后续扩展需 Code Review** — 新增写操作工具必须在 PR 中明确标注风险等级
4. **teacherId 权限隔离** — 即使是白名单内的操作，也受教师权限约束

## Token 控制

- system prompt 固定 ~300 tokens
- tools 描述 ~500 tokens（6 个工具）
- 工具返回结果截断到 3000 字符
- 最多 3 轮 tool call 循环
- 预估单次对话: 1000-4000 tokens（看是否触发工具）
