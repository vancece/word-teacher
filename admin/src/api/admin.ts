import { apiClient } from './client'

// 教师相关
export interface Teacher {
  id: number
  username: string
  name: string
  isAdmin: boolean
  classes: { id: number; name: string }[]
  createdAt: string
}

// 班级相关
export interface Class {
  id: number
  name: string
  grade: string
  description: string | null
  studentCount: number
  teachers?: { id: number; name: string }[]
  createdAt: string
}

// 学生相关
export interface Student {
  id: number
  studentNo: string  // 学号
  name: string
  classId: number | null
  className: string | null
  seatNo: number | null
  createdAt: string
  practiceCount?: number
  readAloudCount?: number
}

// 跟读记录（1-5星制，4个维度）
export interface ReadAloudRecord {
  id: number
  studentId: number
  sceneId: string
  totalScore?: number        // 总分 1-5
  intonationScore?: number   // 语音语调 1-5
  fluencyScore?: number      // 流利连贯 1-5
  accuracyScore?: number     // 准确完整 1-5
  expressionScore?: number   // 情感表现力 1-5
  feedback?: string
  strengths?: string[]
  improvements?: string[]
  completedCount: number
  totalCount: number
  status: string
  createdAt: string
  updatedAt: string
  student?: {
    id: number
    name: string
    username: string
    className?: string
  }
  scene?: {
    id: string
    name: string
  }
}

// 跟读场景
export interface ReadAloudScene {
  id: string
  name: string
  description?: string
  coverImage?: string
  grade: string
  visible: boolean  // 是否对学生可见
  sentences: Array<{
    id: number
    english: string
    chinese: string
    audio?: string
  }>
  creatorId?: number  // 创建者ID
  creator?: { id: number; name: string }
  createdAt: string
}

// 对话场景
export interface DialogueScene {
  id: string
  name: string
  description?: string
  coverImage?: string
  prompt?: string  // AI 自定义提示词
  grade: string
  visible: boolean  // 是否对学生可见
  vocabulary?: string[]
  dialogueConfig?: {
    prompts?: string[]
  }
  creatorId?: number  // 创建者ID
  creator?: { id: number; name: string }
  createdAt?: string
}

// 统计数据
export interface DashboardStats {
  totalStudents: number
  totalTeachers: number
  totalPractices: number
  totalReadAlouds: number
  todayPractices: number
  todayReadAlouds: number
  completedReadAlouds: number
  averageScore: number
}

export const adminApi = {
  // 仪表盘统计
  getDashboardStats: async (): Promise<DashboardStats> => {
    return apiClient.get('/admin/stats') as unknown as DashboardStats
  },

  // 教师管理（仅管理员）
  getTeachers: async (): Promise<Teacher[]> => {
    return apiClient.get('/admin/teachers') as unknown as Teacher[]
  },

  createTeacher: async (data: { username: string; password: string; name: string; isAdmin?: boolean }): Promise<Teacher> => {
    return apiClient.post('/admin/teachers', data) as unknown as Teacher
  },

  updateTeacher: async (id: number, data: { name?: string; isAdmin?: boolean; password?: string }): Promise<Teacher> => {
    return apiClient.put(`/admin/teachers/${id}`, data) as unknown as Teacher
  },

  deleteTeacher: async (id: number): Promise<void> => {
    return apiClient.delete(`/admin/teachers/${id}`) as unknown as void
  },

  // 班级管理
  getClasses: async (): Promise<{ classes: Class[] }> => {
    return apiClient.get('/admin/classes') as unknown as { classes: Class[] }
  },

  createClass: async (data: { name: string; grade: string; description?: string; teacherIds?: number[] }): Promise<Class> => {
    return apiClient.post('/admin/classes', data) as unknown as Class
  },

  updateClass: async (id: number, data: { name?: string; grade?: string; description?: string; teacherIds?: number[] }): Promise<Class> => {
    return apiClient.put(`/admin/classes/${id}`, data) as unknown as Class
  },

  deleteClass: async (id: number): Promise<void> => {
    return apiClient.delete(`/admin/classes/${id}`) as unknown as void
  },

  // 学生管理
  getStudents: async (params?: { page?: number; limit?: number; search?: string; classId?: number }): Promise<{
    students: Student[]
    total: number
    page: number
    limit: number
  }> => {
    return apiClient.get('/admin/students', { params }) as unknown as {
      students: Student[]
      total: number
      page: number
      limit: number
    }
  },

  deleteStudent: async (id: number): Promise<void> => {
    return apiClient.delete(`/admin/students/${id}`) as unknown as void
  },

  updateStudentPassword: async (id: number, password: string): Promise<void> => {
    return apiClient.put(`/admin/students/${id}/password`, { password }) as unknown as void
  },

  updateStudent: async (id: number, data: { seatNo?: number | null; name?: string }): Promise<void> => {
    return apiClient.put(`/admin/students/${id}`, data) as unknown as void
  },

  batchImportStudents: async (data: {
    students: Array<{ studentNo: string; name: string; password: string; seatNo?: number }>
    classId: number
  }): Promise<{
    total: number
    created: number
    duplicates: string[]
    skipped: number
  }> => {
    return apiClient.post('/admin/students/batch', data) as unknown as {
      total: number
      created: number
      duplicates: string[]
      skipped: number
    }
  },

  // 跟读记录
  getReadAloudRecords: async (params?: {
    page?: number
    limit?: number
    studentId?: number
    sceneId?: string
    status?: string
  }): Promise<{
    records: ReadAloudRecord[]
    total: number
    page: number
    limit: number
  }> => {
    return apiClient.get('/admin/read-aloud-records', { params }) as unknown as {
      records: ReadAloudRecord[]
      total: number
      page: number
      limit: number
    }
  },

  // 跟读场景
  getReadAloudScenes: async (): Promise<ReadAloudScene[]> => {
    return apiClient.get('/admin/read-aloud-scenes') as unknown as ReadAloudScene[]
  },

  createReadAloudScene: async (data: Partial<ReadAloudScene>): Promise<ReadAloudScene> => {
    return apiClient.post('/admin/read-aloud-scenes', data) as unknown as ReadAloudScene
  },

  updateReadAloudScene: async (id: string, data: Partial<ReadAloudScene>): Promise<ReadAloudScene> => {
    return apiClient.put(`/admin/read-aloud-scenes/${id}`, data) as unknown as ReadAloudScene
  },

  deleteReadAloudScene: async (id: string): Promise<void> => {
    return apiClient.delete(`/admin/read-aloud-scenes/${id}`) as unknown as void
  },

  // 学生详情
  getStudentDetail: async (id: number): Promise<any> => {
    return apiClient.get(`/admin/students/${id}`) as unknown as any
  },

  // 对话场景
  getScenes: async (): Promise<any[]> => {
    return apiClient.get('/admin/scenes') as unknown as any[]
  },

  createScene: async (data: any): Promise<any> => {
    return apiClient.post('/admin/scenes', data) as unknown as any
  },

  updateScene: async (id: string, data: any): Promise<any> => {
    return apiClient.put(`/admin/scenes/${id}`, data) as unknown as any
  },

  deleteScene: async (id: string): Promise<void> => {
    return apiClient.delete(`/admin/scenes/${id}`) as unknown as void
  },

  // 进步情况 API
  getProgressOverview: async (params?: { classId?: number; days?: number; practiceType?: string; sceneId?: string }): Promise<ProgressOverview> => {
    const query = new URLSearchParams()
    if (params?.classId) query.append('classId', String(params.classId))
    if (params?.days) query.append('days', String(params.days))
    if (params?.practiceType) query.append('practiceType', params.practiceType)
    if (params?.sceneId) query.append('sceneId', params.sceneId)
    const queryStr = query.toString()
    return apiClient.get(`/admin/progress/overview${queryStr ? '?' + queryStr : ''}`) as unknown as ProgressOverview
  },

  getStudentProgress: async (id: number): Promise<StudentProgress> => {
    return apiClient.get(`/admin/progress/student/${id}`) as unknown as StudentProgress
  },

  // AI 学习总结
  getStudentSummary: async (id: number): Promise<StudentSummary> => {
    return apiClient.get(`/admin/progress/student/${id}/summary`) as unknown as StudentSummary
  },

  // AI 场景补充（仅翻译）- 通过后端代理调用 Agent
  supplementScene: async (data: {
    sceneName: string
    sceneDescription?: string
    sentences?: Array<{ english: string }>
    type: 'readAloud' | 'dialogue'
    skipCoverImage?: boolean  // 跳过封面图生成
  }): Promise<{
    translations?: Array<{ english: string; chinese: string }>
    coverImage?: string
    error?: string
  }> => {
    // 通过后端代理调用 Agent，不直接访问 Agent 服务
    return apiClient.post('/admin/scene/supplement', data) as unknown as {
      translations?: Array<{ english: string; chinese: string }>
      coverImage?: string
      error?: string
    }
  },
}

// 学生统计数据
export interface StudentStat {
  id: number
  name: string
  className: string
  practiceCount: number
  readAloudCount: number
  totalCount: number
  avgScore: number | null
  improvement: number
  lastPracticeDate: string | null
  reason?: string
  highlight?: string
}

// 班级统计数据
export interface ClassStats {
  studentCount: number
  activeCount: number
  participationRate: number
  totalPracticeCount: number
  totalReadAloudCount: number
  avgScore: number
  scoreTrend: number
}

// 进步情况类型
export interface ProgressOverview {
  classes: { id: number; name: string; grade?: string }[]
  dialogueScenes: { id: string; name: string }[]
  readAloudScenes: { id: string; name: string }[]
  classStats: ClassStats
  progressData: { week: string; avgScore: number; count: number }[]
  students: StudentStat[]
  needAttention: StudentStat[]
  topPerformers: StudentStat[]
}

export interface StudentProgress {
  student: {
    id: number
    name: string
    username: string
    className: string | null
    createdAt: string
  }
  stats: {
    practiceCount: number
    readAloudCount: number
    practiceAvg: number
    readAloudAvg: number
    practiceImprovement: number
    readAloudImprovement: number
  }
  practiceProgress: {
    date: string
    score: number | null
    sceneName: string
    pronunciationScore: number | null
    fluencyScore: number | null
    grammarScore: number | null
  }[]
  readAloudProgress: {
    date: string
    score: number | null
    sceneName: string
    intonationScore: number | null   // 语音语调 1-5
    fluencyScore: number | null      // 流利连贯 1-5
    accuracyScore: number | null     // 准确完整 1-5
    expressionScore: number | null   // 情感表现力 1-5
  }[]
}

// AI 学习总结
export interface StudentSummary {
  strengths: string[]
  weaknesses: string[]
  overallComment: string
  suggestions: string[]
}

