// 调试：检查实际的字符编码

// 原句（从日志复制）
const original = "Well, it's sunny today."
// 识别结果（从日志复制）  
const spoken = "Well, it's sunny today"

console.log("=== 检查原句中 it's 的字符 ===")
const originalIts = original.split(/\s+/)[1]
console.log("原句 it's:", originalIts)
console.log("字符编码:")
for (let i = 0; i < originalIts.length; i++) {
  console.log(`  [${i}] '${originalIts[i]}' = U+${originalIts.charCodeAt(i).toString(16).padStart(4, '0')}`)
}

console.log("\n=== 检查识别结果中 it's 的字符 ===")
const spokenIts = spoken.split(/\s+/)[1]
console.log("识别 it's:", spokenIts)
console.log("字符编码:")
for (let i = 0; i < spokenIts.length; i++) {
  console.log(`  [${i}] '${spokenIts[i]}' = U+${spokenIts.charCodeAt(i).toString(16).padStart(4, '0')}`)
}

// 测试 normalize
const normalize = (text) => text
  .toLowerCase()
  .replace(/[.,!?'"''""\-]/g, '')
  .trim()

console.log("\n=== normalize 结果 ===")
console.log("原句 normalize:", normalize(originalIts))
console.log("识别 normalize:", normalize(spokenIts))
console.log("是否相等:", normalize(originalIts) === normalize(spokenIts))

// 检查正则是否能匹配
console.log("\n=== 正则匹配测试 ===")
const regex = /[.,!?'"''""\-]/g
console.log("原句 it's 匹配:", originalIts.match(regex))
console.log("识别 it's 匹配:", spokenIts.match(regex))
