import { Client } from 'minio'
import { logger } from '../utils/logger.js'

// MinIO 配置
const config = {
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'admin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minio123456',
}

const bucketName = process.env.MINIO_BUCKET || 'covers'
// 使用相对路径，让 Nginx 代理处理，这样换域名不需要修改
const publicUrl = '/minio'

// 创建 MinIO 客户端
let minioClient: Client | null = null

/**
 * 获取 MinIO 客户端（懒加载）
 */
function getClient(): Client {
  if (!minioClient) {
    minioClient = new Client(config)
  }
  return minioClient
}

/**
 * 初始化 MinIO，确保 bucket 存在
 */
export async function initMinio(): Promise<void> {
  try {
    const client = getClient()
    const exists = await client.bucketExists(bucketName)
    
    if (!exists) {
      await client.makeBucket(bucketName)
      logger.info({ bucket: bucketName }, '[MinIO] Bucket created')
      
      // 设置 bucket 为公开读取
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucketName}/*`],
          },
        ],
      }
      await client.setBucketPolicy(bucketName, JSON.stringify(policy))
      logger.info({ bucket: bucketName }, '[MinIO] Bucket policy set to public read')
    } else {
      logger.info({ bucket: bucketName }, '[MinIO] Bucket already exists')
    }
  } catch (error) {
    logger.error({ error }, '[MinIO] Failed to initialize')
    // 不抛出错误，允许服务继续启动（可能 MinIO 还未就绪）
  }
}

/**
 * 上传文件到 MinIO
 * @param buffer 文件内容
 * @param filename 文件名（如 scene_001.jpg）
 * @param contentType MIME 类型
 * @returns 公开访问 URL
 */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const client = getClient()
  
  // 生成唯一文件名
  const timestamp = Date.now()
  const uniqueName = `${timestamp}_${filename}`
  
  await client.putObject(bucketName, uniqueName, buffer, buffer.length, {
    'Content-Type': contentType,
  })
  
  logger.info({ filename: uniqueName, size: buffer.length }, '[MinIO] File uploaded')
  
  // 返回公开 URL
  return `${publicUrl}/${bucketName}/${uniqueName}`
}

/**
 * 从 base64 上传图片
 * @param base64Data base64 编码的图片数据（可以包含 data:image/xxx;base64, 前缀）
 * @param filename 文件名
 * @returns 公开访问 URL
 */
export async function uploadBase64Image(base64Data: string, filename: string): Promise<string> {
  // 移除 data URL 前缀
  let base64 = base64Data
  let contentType = 'image/png'
  
  const matches = base64Data.match(/^data:(.+);base64,(.+)$/)
  if (matches) {
    contentType = matches[1]
    base64 = matches[2]
  }
  
  const buffer = Buffer.from(base64, 'base64')
  
  // 从 contentType 提取扩展名
  const ext = contentType.split('/')[1] || 'png'
  const finalFilename = filename.includes('.') ? filename : `${filename}.${ext}`
  
  return uploadFile(buffer, finalFilename, contentType)
}

/**
 * 删除文件
 */
export async function deleteFile(filename: string): Promise<void> {
  const client = getClient()
  await client.removeObject(bucketName, filename)
  logger.info({ filename }, '[MinIO] File deleted')
}

/**
 * 检查 MinIO 是否可用
 */
export async function isMinioAvailable(): Promise<boolean> {
  try {
    const client = getClient()
    await client.bucketExists(bucketName)
    return true
  } catch {
    return false
  }
}

