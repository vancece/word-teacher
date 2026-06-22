import type { McpTool } from './types.js'
import { toolOk, toolError } from './types.js'

/**
 * 数据库查询工具 — 让 AI 直接写 SQL 查询数据
 * 安全限制：只允许 SELECT，自动注入权限过滤
 */
export const queryDatabaseTool: McpTool = {
  name: 'queryDatabase',
  description: `直接查询数据库，获取任意学生/成绩/内容数据。只允许 SELECT 查询。
数据库类型：MySQL 8.0，必须使用 MySQL 语法，禁止使用 PostgreSQL 语法（如 ::date、ILIKE、interval '7 days' 等）。
权限：管理员可查所有数据；普通教师只能查所属班级的学生数据。

可用表及字段（注意字段名大小写）：
- students: id, studentNo, name, class_id, seat_no, created_at
- classes: id, name, grade, description, created_at
- class_teachers: id, class_id, teacher_id, created_at
- teachers: id, username, name, is_admin, created_at
- practice_records: id, student_id, scene_id, total_score, pronunciation_score, fluency_score, grammar_score, duration_seconds, rounds_completed, status, created_at
- read_aloud_records: id, student_id, scene_id, total_score, intonation_score, fluency_score, accuracy_score, expression_score, completed_count, total_count, duration_seconds, status, created_at
- word_game_records: id, student_id, game_type, pack_name, score, summary, created_at
- scenes: id, name, description, grade, visible, rounds, creator_id, created_at
- read_aloud_scenes: id, name, description, grade, visible, creator_id, created_at
- word_packs: id, name, game_type, grade, visible, sort_order, creator_id, created_at
- words: id, pack_id, english, chinese, phonetic, difficulty, sort_order

MySQL 常用函数提示：
- 今天: CURDATE()  昨天: CURDATE() - INTERVAL 1 DAY
- 取日期部分: DATE(created_at)  本周: YEARWEEK(created_at) = YEARWEEK(CURDATE())
- 本月: YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())
- 模糊匹配: LIKE（MySQL 不支持 ILIKE，默认不区分大小写）

注意：
- status 枚举值: IN_PROGRESS, COMPLETED, ABANDONED
- game_type 值: shooter, match, spell, miner
- 敏感字段(password)不可查询
- 结果最多返回 100 行`,
  inputSchema: {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description: 'SELECT SQL 语句。不需要加 LIMIT（系统自动限制100行，导出Excel时上限1000行）。普通教师的查询会自动添加班级权限过滤。',
      },
      explanation: {
        type: 'string',
        description: '简要说明这个查询的目的（方便日志审计）',
      },
      exportExcel: {
        type: 'boolean',
        description: '是否将查询结果导出为 Excel 文件。为 true 时返回下载链接而非数据，LIMIT 放宽到 1000 行。',
      },
      exportTitle: {
        type: 'string',
        description: '导出 Excel 的文件标题（exportExcel=true 时使用）',
      },
    },
    required: ['sql'],
  },

  async execute(args, context) {
    const res = await fetch(`${context.backendUrl}/internal/query-db`, {
      method: 'POST',
      headers: { ...context.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sql: args.sql,
        explanation: args.explanation,
        exportExcel: args.exportExcel,
        exportTitle: args.exportTitle,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string }
      return toolError(err.message || '查询失败')
    }

    const data = await res.json() as { data: any }

    // 导出模式：直接返回可用的 Markdown 链接，AI 原样输出即可
    if (args.exportExcel && data.data?.downloadUrl) {
      const { downloadUrl, filename, message } = data.data
      const baseUrl = context.backendUrl.replace('/api', '')
      const adminPath = downloadUrl.replace('/api/internal/export/', '/api/admin/export/')
      const fullUrl = `${baseUrl}${adminPath}`
      return toolOk(`${message}\n\n[📥 点击下载 ${filename}](${fullUrl})`)
    }

    // 导出模式但后端返回空结果（无数据可导出）
    if (args.exportExcel && !data.data?.downloadUrl) {
      const rows = data.data?.rows
      if (!rows || rows.length === 0) {
        return toolOk('查询结果为空，没有数据可以导出。')
      }
      // 后端返回了数据但没走导出分支（不应该发生，降级为返回数据）
      return toolOk(JSON.stringify(rows, null, 2))
    }

    // 普通查询返回数据
    const { rows, rowCount, truncated } = data.data
    let result = JSON.stringify(rows, null, 2)
    if (truncated) {
      result += `\n\n(结果已截断，共 ${rowCount} 行，只显示前 100 行)`
    }

    return toolOk(result)
  },
}
