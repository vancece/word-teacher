import type { Response, NextFunction } from 'express'
import { verifyToken, verifyStudentToken, verifyTeacherToken } from '../utils/jwt.js'
import { unauthorized, forbidden } from '../utils/response.js'
import type { AuthRequest, StudentRequest, TeacherRequest } from '../types/index.js'

// ==================== 学生认证 ====================

export function authenticateStudent(req: StudentRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return unauthorized(res, '未提供认证令牌')
  }

  const token = authHeader.slice(7)
  const payload = verifyStudentToken(token)

  if (!payload) {
    return unauthorized(res, '无效或过期的令牌，请重新登录')
  }

  req.student = payload
  next()
}

// ==================== 教师认证 ====================

export function authenticateTeacher(req: TeacherRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return unauthorized(res, '未提供认证令牌')
  }

  const token = authHeader.slice(7)
  const payload = verifyTeacherToken(token)

  if (!payload) {
    return unauthorized(res, '无效或过期的令牌，请重新登录')
  }

  req.teacher = payload
  next()
}

// 仅管理员教师可访问
export function adminOnly(req: TeacherRequest, res: Response, next: NextFunction) {
  if (!req.teacher) {
    return unauthorized(res)
  }

  if (!req.teacher.isAdmin) {
    return forbidden(res, '仅管理员教师可访问')
  }

  next()
}

// ==================== 兼容旧代码（逐步废弃） ====================

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return unauthorized(res, 'No token provided')
  }

  const token = authHeader.slice(7)
  const payload = verifyToken(token)

  if (!payload) {
    return unauthorized(res, 'Invalid or expired token')
  }

  req.user = payload

  // 同时设置 student 或 teacher
  if (payload.type === 'student') {
    req.student = payload
  } else if (payload.type === 'teacher') {
    req.teacher = payload
  }

  next()
}

export function authorize(...allowedTypes: ('student' | 'teacher')[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return unauthorized(res)
    }

    if (!allowedTypes.includes(req.user.type)) {
      return forbidden(res, '无权访问此资源')
    }

    next()
  }
}

