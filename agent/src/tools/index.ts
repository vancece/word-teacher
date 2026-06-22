/**
 * 工具注册入口（安全白名单）
 *
 * ⚠️ 只有在此文件中注册的工具才会暴露给 AI。
 * 新增工具前请确认：
 *   1. 是否为只读操作？（优先）
 *   2. 如果是写操作，是否低风险、可恢复？
 *   3. 是否需要在 PR 中标注风险等级？
 *
 * 绝对不要注册：删除学生/班级/教师、权限变更、删除记录等不可逆操作
 */
import { toolRegistry } from './registry.js'
import { knowledgeTool } from './knowledge.tool.js'
import { queryStudentsTool, resetPasswordTool } from './student.tool.js'
import { recordsTool } from './records.tool.js'
import { studentSummaryTool } from './summary.tool.js'
import { classAnalysisTool } from './class-analysis.tool.js'
import { contentManageTool } from './content-manage.tool.js'
import { createStudentTool, createTeacherTool } from './create-user.tool.js'
import { queryDatabaseTool } from './query-db.tool.js'

toolRegistry.registerAll([
  // 知识问答
  knowledgeTool,
  // 数据查询（只读）
  queryStudentsTool,
  recordsTool,
  studentSummaryTool,
  classAnalysisTool,
  // 安全写操作
  resetPasswordTool,
  contentManageTool,
  createStudentTool,
  createTeacherTool,
  // 数据库查询（含导出 Excel 功能）
  queryDatabaseTool,
])

console.log(`[ToolRegistry] Registered ${toolRegistry.size} tools: ${toolRegistry.listToolNames().join(', ')}`)

export { toolRegistry }
