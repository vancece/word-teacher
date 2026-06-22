/**
 * 知识库数据导入脚本
 * 用法：cd backend && npx tsx src/scripts/seed-knowledge.ts
 * 
 * 将 knowledge-items.ts 中的知识条目全量同步到 LanceDB 向量数据库
 */
import { knowledgeVectorService } from '../services/knowledge-vector.service.js'
import { knowledgeItems } from '../data/knowledge-items.js'

async function main() {
  console.log(`🚀 开始导入知识库，共 ${knowledgeItems.length} 条...`)
  console.log()

  // 按分类统计
  const categoryCount = new Map<string, number>()
  for (const item of knowledgeItems) {
    categoryCount.set(item.category, (categoryCount.get(item.category) || 0) + 1)
  }
  console.log('📂 分类统计：')
  for (const [cat, count] of categoryCount) {
    console.log(`   ${cat}: ${count} 条`)
  }
  console.log()

  // 统计总字数
  const totalChars = knowledgeItems.reduce((sum, item) => {
    return sum + item.title.length + item.content.length + item.keywords.length
  }, 0)
  console.log(`📝 总字数：约 ${totalChars} 字`)
  console.log()

  // 全量同步到 LanceDB
  const count = await knowledgeVectorService.syncAll(knowledgeItems)

  console.log()
  console.log(`✅ 知识库导入完成！已写入 ${count} 条向量数据`)
}

main().catch(err => {
  console.error('❌ 导入失败:', err)
  process.exit(1)
})
