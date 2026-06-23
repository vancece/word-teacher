/**
 * 学生在线状态（Presence）服务
 * - 接收前端心跳上报，记录最后活跃时间
 * - 统计"最近 N 秒内有心跳"的活跃学生数
 * - 内存存储，重启丢失（符合预期，不需要持久化）
 */

const ACTIVE_THRESHOLD = 2 * 60 * 1000 // 2 分钟内视为在线

// studentId → lastHeartbeat timestamp
const heartbeats: Map<number, number> = new Map()

/**
 * 记录心跳
 */
export function recordHeartbeat(studentId: number) {
  heartbeats.set(studentId, Date.now())
}

/**
 * 获取当前活跃学生数量
 */
export function getActiveStudentCount(): number {
  const now = Date.now()
  let count = 0
  for (const [, lastTime] of heartbeats) {
    if (now - lastTime < ACTIVE_THRESHOLD) {
      count++
    }
  }
  return count
}

/**
 * 获取活跃学生 ID 列表
 */
export function getActiveStudentIds(): number[] {
  const now = Date.now()
  const ids: number[] = []
  for (const [id, lastTime] of heartbeats) {
    if (now - lastTime < ACTIVE_THRESHOLD) {
      ids.push(id)
    }
  }
  return ids
}

/**
 * 定期清理过期心跳（避免内存泄漏）
 * 每 10 分钟清理一次超过 10 分钟没心跳的记录
 */
export function startPresenceCleanup() {
  setInterval(() => {
    const now = Date.now()
    const expiry = 10 * 60 * 1000
    for (const [id, lastTime] of heartbeats) {
      if (now - lastTime > expiry) {
        heartbeats.delete(id)
      }
    }
  }, 10 * 60 * 1000)
}
