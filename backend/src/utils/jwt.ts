import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import type { JwtPayload, StudentJwtPayload, TeacherJwtPayload } from '../types/index.js'

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  })
}

export function generateStudentToken(payload: Omit<StudentJwtPayload, 'type'>): string {
  return generateToken({ type: 'student', ...payload })
}

export function generateTeacherToken(payload: Omit<TeacherJwtPayload, 'type'>): string {
  return generateToken({ type: 'teacher', ...payload })
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.jwt.secret) as JwtPayload
  } catch {
    return null
  }
}

// 验证并检查是否为学生 Token
export function verifyStudentToken(token: string): StudentJwtPayload | null {
  const payload = verifyToken(token)
  if (payload && payload.type === 'student') {
    return payload as StudentJwtPayload
  }
  return null
}

// 验证并检查是否为教师 Token
export function verifyTeacherToken(token: string): TeacherJwtPayload | null {
  const payload = verifyToken(token)
  if (payload && payload.type === 'teacher') {
    return payload as TeacherJwtPayload
  }
  return null
}

