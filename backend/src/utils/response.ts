import type { Response } from 'express'
import type { ApiResponse, PaginatedResponse } from '../types/index.js'

export function success<T>(res: Response, data: T, message?: string, statusCode = 200) {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message,
  }
  return res.status(statusCode).json(response)
}

export function error(res: Response, message: string, statusCode = 400, errorDetails?: string) {
  const response: ApiResponse = {
    success: false,
    message,
    error: errorDetails,
  }
  return res.status(statusCode).json(response)
}

export function paginated<T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  pageSize: number
) {
  const response: ApiResponse<PaginatedResponse<T>> = {
    success: true,
    data: {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  }
  return res.status(200).json(response)
}

export function created<T>(res: Response, data: T, message = 'Created successfully') {
  return success(res, data, message, 201)
}

export function noContent(res: Response) {
  return res.status(204).send()
}

export function notFound(res: Response, message = 'Resource not found') {
  return error(res, message, 404)
}

export function unauthorized(res: Response, message = 'Unauthorized') {
  return error(res, message, 401)
}

export function forbidden(res: Response, message = 'Forbidden') {
  return error(res, message, 403)
}

