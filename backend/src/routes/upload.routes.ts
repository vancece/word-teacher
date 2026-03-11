import { Router, Request, Response } from 'express'
import multer from 'multer'
import { authenticate } from '../middleware/auth.js'
import { uploadFile, uploadBase64Image, isMinioAvailable } from '../services/minio.service.js'
import { success, error } from '../utils/response.js'
import { logger } from '../utils/logger.js'

const router = Router()

// 配置 multer 内存存储
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (_req, file, cb) => {
    // 只允许图片
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('只允许上传图片文件'))
    }
  },
})

/**
 * POST /api/upload/image
 * 上传图片文件
 */
router.post('/image', authenticate, upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return error(res, '请选择要上传的图片', 400)
    }

    const url = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    )

    return success(res, { url })
  } catch (err) {
    logger.error({ error: err }, '[Upload] Failed to upload image')
    return error(res, '图片上传失败', 500)
  }
})

/**
 * POST /api/upload/base64
 * 上传 base64 编码的图片
 */
router.post('/base64', authenticate, async (req: Request, res: Response) => {
  try {
    const { image, filename } = req.body

    if (!image) {
      return error(res, '请提供图片数据', 400)
    }

    const url = await uploadBase64Image(image, filename || 'image')

    return success(res, { url })
  } catch (err) {
    logger.error({ error: err }, '[Upload] Failed to upload base64 image')
    return error(res, '图片上传失败', 500)
  }
})

/**
 * GET /api/upload/health
 * 检查上传服务是否可用
 */
router.get('/health', async (_req: Request, res: Response) => {
  const available = await isMinioAvailable()
  return success(res, { 
    available,
    message: available ? 'MinIO is ready' : 'MinIO is not available'
  })
})

export default router

