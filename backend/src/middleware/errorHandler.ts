import type { Request, Response, NextFunction } from 'express'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import { env } from '../config/env.js'
import { error } from '../utils/response.js'
import { apiLogger } from '../utils/logger.js'

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 400
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  apiLogger.error({
    error: err.message,
    stack: env.isDev ? err.stack : undefined,
    method: req.method,
    path: req.path,
  }, 'Request error')

  // 自定义应用错误
  if (err instanceof AppError) {
    return error(res, err.message, err.statusCode)
  }

  // Zod 验证错误
  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
    return error(res, 'Validation error', 400, messages.join('; '))
  }

  // Prisma 错误
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return error(res, 'A record with this value already exists', 409)
      case 'P2025':
        return error(res, 'Record not found', 404)
      default:
        return error(res, 'Database error', 500)
    }
  }

  // 默认服务器错误
  const message = env.isDev ? err.message : 'Internal server error'
  return error(res, message, 500)
}

