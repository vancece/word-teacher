// 用实际从日志复制的字符串测试
// 注意：这些字符串需要从实际日志获取真实的字符编码

const testCases = [
  // 测试1: 两个都是普通撇号
  { original: "Well, it's sunny today.", spoken: "Well, it's sunny today" },
  
  // 测试2: 原句用 Unicode 右单引号 U+2019
  { original: "Well, it\u2019s sunny today.", spoken: "Well, it's sunny today" },
  
  // 测试3: 原句用其他可能的引号
  { original: "Well, it\u0027s sunny today.", spoken: "Well, it's sunny today" },
]

const normalize = (text) => text
  .toLowerCase()
  .replace(/[.,!?'"''""\-]/g, '')
  .trim()

console.log("=== normalize 正则测试 ===")
console.log("普通撇号 ' (U+0027):", normalize("it's"))
console.log("右单引号 ' (U+2019):", normalize("it\u2019s"))
console.log("左单引号 ' (U+2018):", normalize("it\u2018s"))

console.log("\n=== 测试用例 ===")
for (const tc of testCases) {
  const originalWords = tc.original.split(/\s+/).filter(w => w.length > 0)
  const spokenWords = tc.spoken.split(/\s+/)
  
  console.log(`\n原句: "${tc.original}"`)
  console.log("原句词 normalize:", originalWords.map(w => normalize(w)))
  console.log("识别词 normalize:", spokenWords.map(w => normalize(w)))
  
  // 检查 it's 这个词
  const originalIts = originalWords[1]
  const spokenIts = spokenWords[1]
  console.log(`原句 'it's': ${normalize(originalIts)} (chars: ${[...originalIts].map(c => 'U+' + c.charCodeAt(0).toString(16).padStart(4,'0')).join(' ')})`)
  console.log(`识别 'it's': ${normalize(spokenIts)} (chars: ${[...spokenIts].map(c => 'U+' + c.charCodeAt(0).toString(16).padStart(4,'0')).join(' ')})`)
  console.log(`match: ${normalize(originalIts) === normalize(spokenIts)}`)
}
