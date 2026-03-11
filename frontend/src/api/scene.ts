import { apiClient, type ApiResponse } from './client'

export interface Scene {
  id: string
  name: string
  description: string
  rounds: number
  icon: string
  coverImage?: string
  grade: string
  vocabulary: string[]
  dialogueConfig?: {
    prompts: string[]
  }
}

export const sceneApi = {
  list: () => apiClient.get<void, ApiResponse<Scene[]>>('/scenes'),

  getById: (id: string) => apiClient.get<void, ApiResponse<Scene>>(`/scenes/${id}`),
}

