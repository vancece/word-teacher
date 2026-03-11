// 测试 Unicode 引号处理

const normalize = (text) => text
  .toLowerCase()
  .replace(/[.,!?\u0027\u0022\u2018\u2019\u201C\u201D\u2010-\u2014-]/g, '')
  .trim()

console.log("=== 测试各种引号 ===")
console.log("普通撇号 its (U+0027):", normalize("it's"))
console.log("右单引号 its (U+2019):", normalize("it\u2019s"))
console.log("左单引号 its (U+2018):", normalize("it\u2018s"))
console.log("连字符 twentyone:", normalize("twenty-one"))

console.log("\n=== 测试完整句子 ===")
// 模拟原句用 Unicode 引号
const original = "Well, it\u2019s sunny today."
const spoken = "Well, it's sunny today"

const originalWords = original.split(/\s+/).filter(w => w.length > 0)
const spokenWords = spoken.split(/\s+/)

console.log("原句:", original)
console.log("识别:", spoken)
console.log("原句词 normalize:", originalWords.map(w => normalize(w)))
console.log("识别词 normalize:", spokenWords.map(w => normalize(w)))

const originalIts = normalize(originalWords[1])
const spokenIts = normalize(spokenWords[1])
console.log("\n'its' 匹配:", originalIts, "===", spokenIts, "=", originalIts === spokenIts)

// 测试21
console.log("\n=== 测试数字 ===")
console.log("21:", normalize("21"))
console.log("twenty-one:", normalize("twenty-one"))
console.log("twentyone 等价:", normalize("twenty-one") === "twentyone")
