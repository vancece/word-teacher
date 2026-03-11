import type { Request, Response, NextFunction, RequestHandler } from 'express'

/**
 * 包装异步路由处理器，自动捕获错误并传递给错误处理中间件
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

