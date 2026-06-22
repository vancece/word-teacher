/**
 * 知识库向量搜索服务
 * 使用 LanceDB（嵌入式向量数据库）+ DashScope Embedding API
 * 职责：向量化知识条目、向量搜索、索引同步
 */
import * as lancedb from '@lancedb/lancedb'
import OpenAI from 'openai'
import path from 'path'
import { logger } from '../utils/logger.js'
import { env } from '../config/env.js'

const EMBEDDING_MODEL = 'text-embedding-v3'
const EMBEDDING_DIMENSIONS = 1024
const TABLE_NAME = 'knowledge'

// LanceDB 数据目录
const LANCEDB_PATH = process.env.LANCEDB_PATH || path.resolve(process.cwd(), 'data/lancedb')

interface KnowledgeVector {
  id: number
  category: string
  title: string
  content: string
  keywords: string
  text: string // 用于 embedding 的拼接文本
  vector: number[]
  [key: string]: unknown
}

interface SearchResult {
  id: number
  category: string
  title: string
  content: string
  score: number
}

class KnowledgeVectorService {
  private db: lancedb.Connection | null = null
  private table: lancedb.Table | null = null
  private openai: OpenAI
  private ready = false
  private initPromise: Promise<void> | null = null

  constructor() {
    const apiKey = env.ai?.apiKey || process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || ''
    const baseURL = env.ai?.apiUrl || process.env.OPENAI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'

    this.openai = new OpenAI({ apiKey, baseURL })
  }

  /**
   * 初始化 LanceDB 连接（懒加载，首次调用时执行）
   */
  async init(): Promise<void> {
    if (this.ready) return
    // 允许重试：如果上次 init 失败（ready 仍为 false），清除 promise 重新初始化
    if (this.initPromise && !this.ready) {
      this.initPromise = null
    }
    if (this.initPromise) return this.initPromise

    this.initPromise = this._doInit()
    return this.initPromise
  }

  private async _doInit(): Promise<void> {
    try {
      this.db = await lancedb.connect(LANCEDB_PATH)

      // 检查表是否存在
      const tableNames = await this.db.tableNames()
      if (tableNames.includes(TABLE_NAME)) {
        this.table = await this.db.openTable(TABLE_NAME)
        const count = await this.table.countRows()
        logger.info({ count, path: LANCEDB_PATH }, '[VectorDB] LanceDB table loaded')
      } else {
        logger.info('[VectorDB] No existing table, will create on first sync')
      }

      this.ready = true
    } catch (err) {
      logger.error({ error: err }, '[VectorDB] Failed to initialize LanceDB')
      // 不阻塞应用启动，降级为 MySQL 搜索
      this.ready = false
    }
  }

  /**
   * 向量搜索知识库
   * @returns 按相似度排序的搜索结果
   */
  async search(query: string, category?: string, limit = 5): Promise<SearchResult[]> {
    await this.init()

    if (!this.table) {
      logger.warn({ ready: this.ready, hasDb: !!this.db }, '[VectorDB] Table not ready, returning empty')
      return []
    }

    try {
      // 1. 生成 query 向量
      const queryVector = await this.getEmbedding(query)
      if (!queryVector) {
        logger.warn({ query }, '[VectorDB] Failed to generate embedding for query')
        return []
      }

      // 2. 向量搜索
      let searchQuery = this.table.search(queryVector).limit(limit)

      // 3. 如果指定了分类，加过滤条件
      if (category) {
        searchQuery = searchQuery.where(`category = '${category}'`)
      }

      const results = await searchQuery.toArray()

      logger.info({ query, category, resultCount: results.length }, '[VectorDB] Search completed')
      return results.map((row: any) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        content: row.content,
        score: 1 - (row._distance || 0), // LanceDB 返回的是距离，转换为相似度
      }))
    } catch (err) {
      logger.error({ error: err, query }, '[VectorDB] Search failed')
      return []
    }
  }

  /**
   * 同步所有知识库条目到向量索引
   * 适用于初始化或全量重建
   */
  async syncAll(items: { id: number; category: string; title: string; content: string; keywords: string }[]): Promise<number> {
    await this.init()
    if (!this.db) {
      logger.error('[VectorDB] DB not connected, cannot sync')
      return 0
    }

    if (items.length === 0) {
      logger.info('[VectorDB] No items to sync')
      return 0
    }

    logger.info({ count: items.length }, '[VectorDB] Starting full sync...')

    // 批量生成 embedding
    const vectors = await this.batchEmbedding(items.map(item => this.buildEmbeddingText(item)))

    if (vectors.length !== items.length) {
      logger.error('[VectorDB] Embedding count mismatch, aborting sync')
      return 0
    }

    const data: KnowledgeVector[] = items.map((item, i) => ({
      ...item,
      text: this.buildEmbeddingText(item),
      vector: vectors[i],
    }))

    // 删旧表，重建（全量同步场景）
    try {
      const tableNames = await this.db.tableNames()
      if (tableNames.includes(TABLE_NAME)) {
        await this.db.dropTable(TABLE_NAME)
      }
    } catch {}

    this.table = await this.db.createTable(TABLE_NAME, data)
    const count = await this.table.countRows()
    logger.info({ count }, '[VectorDB] Full sync completed')
    return count
  }

  /**
   * 新增或更新单条知识条目的向量
   */
  async upsertItem(item: { id: number; category: string; title: string; content: string; keywords: string }): Promise<void> {
    await this.init()
    if (!this.db) return

    const text = this.buildEmbeddingText(item)
    const vector = await this.getEmbedding(text)
    if (!vector) return

    const row: KnowledgeVector = { ...item, text, vector }

    try {
      if (!this.table) {
        // 首次创建表
        this.table = await this.db.createTable(TABLE_NAME, [row])
      } else {
        // 先删除旧的（按 id），再添加新的
        try {
          await this.table.delete(`id = ${item.id}`)
        } catch {} // 不存在也没关系
        await this.table.add([row])
      }
      logger.info({ id: item.id, title: item.title }, '[VectorDB] Upserted item')
    } catch (err) {
      logger.error({ error: err, id: item.id }, '[VectorDB] Failed to upsert item')
    }
  }

  /**
   * 删除单条知识条目的向量
   */
  async deleteItem(id: number): Promise<void> {
    await this.init()
    if (!this.table) return

    try {
      await this.table.delete(`id = ${id}`)
      logger.info({ id }, '[VectorDB] Deleted item')
    } catch (err) {
      logger.error({ error: err, id }, '[VectorDB] Failed to delete item')
    }
  }

  /**
   * 获取当前索引的条目数
   */
  async getCount(): Promise<number> {
    await this.init()
    if (!this.table) return 0
    return this.table.countRows()
  }

  // 构造用于 embedding 的文本（拼接关键字段提升匹配质量）
  private buildEmbeddingText(item: { title: string; content: string; keywords: string; category: string }): string {
    return `${item.category} ${item.title} ${item.keywords} ${item.content}`
  }

  // 单条文本 embedding
  private async getEmbedding(text: string): Promise<number[] | null> {
    try {
      const response = await this.openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
      })
      return response.data[0].embedding
    } catch (err) {
      logger.error({ error: err }, '[VectorDB] Embedding failed')
      return null
    }
  }

  // 批量 embedding（DashScope text-embedding-v3 限制每批最多 10 条）
  private async batchEmbedding(texts: string[]): Promise<number[][]> {
    const BATCH_SIZE = 6
    const allVectors: number[][] = []

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE)
      try {
        const response = await this.openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: batch,
          dimensions: EMBEDDING_DIMENSIONS,
        })
        const vectors = response.data
          .sort((a, b) => a.index - b.index)
          .map(d => d.embedding)
        allVectors.push(...vectors)
      } catch (err) {
        logger.error({ error: err, batchStart: i }, '[VectorDB] Batch embedding failed')
        // 填充空向量避免索引对不上
        allVectors.push(...batch.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0)))
      }
    }

    return allVectors
  }
}

export const knowledgeVectorService = new KnowledgeVectorService()
