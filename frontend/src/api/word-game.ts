import { apiClient } from './client'

export interface WordGameReportParams {
  gameType: string
  packName: string
  score: number
  summary: string
}

export const wordGameApi = {
  /** 上报游戏结果 */
  reportResult(params: WordGameReportParams) {
    return apiClient.post('/word-game/result', params)
  },
}
