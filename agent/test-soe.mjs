/**
 * 腾讯云 SOE 新版口语评测 API 测试脚本（WebSocket 版）
 * 
 * 新版 SOE 使用 WebSocket 协议：wss://soe.cloud.tencent.com/soe/api/{AppID}
 * 鉴权方式：HMAC-SHA1 签名
 * 
 * 用法: node test-soe.mjs
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createHmac } from 'crypto'
import { randomUUID } from 'crypto'
import WebSocket from 'ws'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 读取 .env
const envContent = readFileSync(join(__dirname, '.env'), 'utf-8')
const envVars = {}
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) envVars[match[1].trim()] = match[2].trim()
}

const secretId = envVars.TENCENT_SECRET_ID
const secretKey = envVars.TENCENT_SECRET_KEY
const appId = envVars.TENCENT_APP_ID

console.log('SecretId:', secretId?.slice(0, 10) + '...')
console.log('SecretKey:', secretKey?.slice(0, 6) + '...')
console.log('AppID:', appId || '❌ 未配置')

if (!secretId || !secretKey) {
  console.error('❌ TENCENT_SECRET_ID 或 TENCENT_SECRET_KEY 未配置')
  process.exit(1)
}
if (!appId) {
  console.error('❌ TENCENT_APP_ID 未配置')
  console.error('   请在 agent/.env 中添加: TENCENT_APP_ID=你的腾讯云AppID')
  console.error('   获取方式: https://console.cloud.tencent.com/developer → 查看 AppID')
  process.exit(1)
}

// 生成一段简单的 WAV 音频（16k, 16bit, mono, 1秒微弱噪声）
function generateTestWav(durationSec = 1) {
  const sampleRate = 16000
  const bitsPerSample = 16
  const numChannels = 1
  const numSamples = sampleRate * durationSec
  const dataSize = numSamples * numChannels * (bitsPerSample / 8)
  const buffer = Buffer.alloc(44 + dataSize)

  // WAV header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)           // PCM
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28)
  buffer.writeUInt16LE(numChannels * bitsPerSample / 8, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  // 写入微小噪声
  for (let i = 44; i < buffer.length; i += 2) {
    buffer.writeInt16LE(Math.floor(Math.random() * 100 - 50), i)
  }

  return buffer
}

// 生成 HMAC-SHA1 签名
function generateSignature(params, appId, secretKey) {
  // 1. 按字典序排序参数
  const sortedKeys = Object.keys(params).sort()
  const sortedParams = sortedKeys.map(k => `${k}=${params[k]}`).join('&')
  
  // 2. 构造签名原文（不含 wss:// 协议前缀）
  const signStr = `soe.cloud.tencent.com/soe/api/${appId}?${sortedParams}`
  
  console.log('\n📝 签名原文:', signStr.slice(0, 120) + '...')
  
  // 3. HMAC-SHA1 + Base64
  const hmac = createHmac('sha1', secretKey)
  hmac.update(signStr)
  return hmac.digest('base64')
}

// 构建 WebSocket URL
function buildWsUrl(refText, voiceFormat = 1) {
  const timestamp = Math.floor(Date.now() / 1000)
  const expired = timestamp + 86400 // 24小时有效期
  const nonce = Math.floor(Math.random() * 1000000000)
  const voiceId = randomUUID()

  const params = {
    eval_mode: 1,             // 句子模式
    expired: expired,
    nonce: nonce,
    rec_mode: 0,              // 流式评测
    ref_text: refText,
    score_coeff: 3.5,         // 评分宽松度
    secretid: secretId,
    sentence_info_enabled: 1, // 返回详细信息
    server_engine_type: '16k_en', // 英文16k引擎
    text_mode: 0,             // 普通文本
    timestamp: timestamp,
    voice_format: voiceFormat, // 1=wav
    voice_id: voiceId,
  }

  // 生成签名
  const signature = generateSignature(params, appId, secretKey)
  console.log('🔐 Signature:', signature)

  // 构建最终 URL（key 和 value 都需要 urlencode）
  const urlParams = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  
  return `wss://soe.cloud.tencent.com/soe/api/${appId}?${urlParams}&signature=${encodeURIComponent(signature)}`
}

// 测试 SOE WebSocket 连接
async function testSOE(refText = 'Hello') {
  console.log(`\n🔍 测试: 新版 SOE WebSocket API`)
  console.log(`   RefText: "${refText}"`)
  
  const url = buildWsUrl(refText)
  console.log('🌐 WebSocket URL:', url.slice(0, 100) + '...')
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let resultReceived = false
    
    const timeout = setTimeout(() => {
      if (!resultReceived) {
        console.error('❌ 超时（15s）')
        ws.close()
        reject(new Error('Timeout'))
      }
    }, 15000)

    ws.on('open', () => {
      console.log('✅ WebSocket 连接成功！')
      
      // 流式模式：分片发送音频，最后发 {"type":"end"} 文本帧结束
      const wavBuffer = generateTestWav(2) // 2秒音频
      console.log(`📤 发送音频数据: ${wavBuffer.length} bytes`)
      
      // 分片发送（每片 6400 bytes ≈ 200ms @ 16k/16bit/mono）
      const chunkSize = 6400
      let offset = 0
      const sendChunk = () => {
        if (offset < wavBuffer.length) {
          const end = Math.min(offset + chunkSize, wavBuffer.length)
          ws.send(wavBuffer.slice(offset, end))
          offset = end
          setTimeout(sendChunk, 100)
        } else {
          // 发送结束标记：JSON 文本帧 {"type":"end"}
          console.log('📤 发送结束标记: {"type":"end"}')
          ws.send(JSON.stringify({ type: 'end' }))
        }
      }
      sendChunk()
    })

    ws.on('message', (data) => {
      const msg = data.toString()
      console.log('\n📩 收到消息:', msg)
      
      try {
        const json = JSON.parse(msg)
        
        if (json.code !== undefined && json.code !== 0) {
          console.error(`❌ 服务端错误: code=${json.code}, message=${json.message}`)
          clearTimeout(timeout)
          ws.close()
          reject(new Error(`SOE error: ${json.message}`))
          return
        }
        
        // 握手成功（final=0, result=null）
        if (json.code === 0 && json.final === 0 && json.result === null) {
          console.log('🤝 握手成功! voice_id:', json.voice_id)
          return
        }
        
        // 中间结果（final=0, result 有值）
        if (json.final === 0 && json.result) {
          console.log('📊 中间结果:', JSON.stringify(json.result))
          return
        }
        
        // 最终评测结果（final=1）
        if (json.final === 1 && json.result) {
          resultReceived = true
          clearTimeout(timeout)
          
          const r = json.result
          console.log('\n✅ ===== 最终评测结果 =====')
          console.log(`   准确度 (PronAccuracy): ${r.PronAccuracy}`)
          console.log(`   流利度 (PronFluency): ${r.PronFluency}`)
          console.log(`   完整度 (PronCompletion): ${r.PronCompletion}`)
          console.log(`   建议评分 (SuggestedScore): ${r.SuggestedScore}`)
          
          if (r.Words && r.Words.length > 0) {
            console.log(`\n   📖 词级详情:`)
            for (const w of r.Words) {
              console.log(`     "${w.Word}": 准确度=${w.PronAccuracy}, 流利度=${w.PronFluency}, MatchTag=${w.MatchTag}`)
              if (w.PhoneInfos) {
                for (const p of w.PhoneInfos) {
                  console.log(`       /${p.Phone}/ 准确度=${p.PronAccuracy}, 重音=${p.DetectedStress}, 参考=/${p.ReferencePhone}/`)
                }
              }
            }
          } else {
            console.log('   ⚠️ 没有词级详情（可能是因为没检测到有效语音）')
          }
          
          console.log('\n📋 完整返回:')
          console.log(JSON.stringify(json, null, 2))
          
          ws.close()
          resolve(json)
        }
      } catch (e) {
        console.log('   (非 JSON 消息)')
      }
    })

    ws.on('error', (err) => {
      console.error('❌ WebSocket 错误:', err.message)
      clearTimeout(timeout)
      reject(err)
    })

    ws.on('close', (code, reason) => {
      console.log(`\n🔌 WebSocket 关闭: code=${code}, reason=${reason?.toString() || ''}`)
      clearTimeout(timeout)
      if (!resultReceived) {
        reject(new Error(`WebSocket closed: code=${code}`))
      }
    })
  })
}

// 运行测试
try {
  await testSOE('Hello')
} catch (err) {
  console.error('\n💀 测试失败:', err.message)
  process.exit(1)
}
