/**
 * Internal API - 可见性修改测试
 * 验证场景/单词包的上架/下架操作
 */
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { prismaMock, resetPrismaMocks } from '../mocks/prisma.js'
import { createTestApp, agentHeaders } from '../helpers/app.js'

const app = createTestApp()

describe('Internal API - Scene Visibility', () => {
  beforeEach(() => {
    resetPrismaMocks()
  })

  it('应能下架对话场景', async () => {
    prismaMock.scene.findUnique.mockResolvedValue({ id: 'scene-1', name: '买水果' } as any)
    prismaMock.scene.update.mockResolvedValue({} as any)

    const res = await request(app)
      .put('/api/internal/scenes/scene-1/visibility')
      .set(agentHeaders)
      .send({ type: 'dialogue', visible: false })

    expect(res.status).toBe(200)
    expect(res.body.data.visible).toBe(false)
    expect(res.body.data.type).toBe('dialogue')
    expect(prismaMock.scene.update).toHaveBeenCalledWith({
      where: { id: 'scene-1' },
      data: { visible: false },
    })
  })

  it('应能上架跟读场景', async () => {
    prismaMock.readAloudScene.findUnique.mockResolvedValue({ id: 'ra-1', name: '绘本朗读' } as any)
    prismaMock.readAloudScene.update.mockResolvedValue({} as any)

    const res = await request(app)
      .put('/api/internal/scenes/ra-1/visibility')
      .set(agentHeaders)
      .send({ type: 'readAloud', visible: true })

    expect(res.status).toBe(200)
    expect(res.body.data.visible).toBe(true)
    expect(res.body.data.type).toBe('readAloud')
  })

  it('场景不存在应返回 404', async () => {
    prismaMock.scene.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .put('/api/internal/scenes/non-exist/visibility')
      .set(agentHeaders)
      .send({ type: 'dialogue', visible: false })

    expect(res.status).toBe(404)
  })

  it('visible 非布尔值应返回 400', async () => {
    const res = await request(app)
      .put('/api/internal/scenes/scene-1/visibility')
      .set(agentHeaders)
      .send({ type: 'dialogue', visible: 'yes' })

    expect(res.status).toBe(400)
    expect(res.body.message).toContain('布尔值')
  })
})

describe('Internal API - WordPack Visibility', () => {
  beforeEach(() => {
    resetPrismaMocks()
  })

  it('应能下架单词包', async () => {
    prismaMock.wordPack.findUnique.mockResolvedValue({ id: 1, name: '动物世界' } as any)
    prismaMock.wordPack.update.mockResolvedValue({} as any)

    const res = await request(app)
      .put('/api/internal/word-packs/1/visibility')
      .set(agentHeaders)
      .send({ visible: false })

    expect(res.status).toBe(200)
    expect(res.body.data.visible).toBe(false)
    expect(prismaMock.wordPack.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { visible: false },
    })
  })

  it('单词包不存在应返回 404', async () => {
    prismaMock.wordPack.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .put('/api/internal/word-packs/999/visibility')
      .set(agentHeaders)
      .send({ visible: true })

    expect(res.status).toBe(404)
  })
})
