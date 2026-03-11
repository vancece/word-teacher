// 测试对比逻辑

// 规范化文本
const normalize = (text) => text.toLowerCase().replace(/[.,!?'"]/g, '').trim()

// 缩写等价映射
const CONTRACTION_EQUIVALENTS = {
  "what's": ["whats", "what is"],
  "it's": ["its", "it is"],
  "isn't": ["isnt", "is not"],
  "that's": ["thats", "that is"],
}

// 数字等价映射
const NUMBER_EQUIVALENTS = {
  "21": ["twenty-one", "twenty one", "twentyone"],
}

// 获取等价形式
function getEquivalentForms(word) {
  const equivalents = []
  
  if (CONTRACTION_EQUIVALENTS[word]) {
    equivalents.push(...CONTRACTION_EQUIVALENTS[word])
  }
  
  for (const [contraction, forms] of Object.entries(CONTRACTION_EQUIVALENTS)) {
    if (forms.includes(word)) {
      equivalents.push(contraction)
      equivalents.push(...forms.filter(f => f !== word))
    }
  }
  
  if (NUMBER_EQUIVALENTS[word]) {
    equivalents.push(...NUMBER_EQUIVALENTS[word])
  }
  
  for (const [number, forms] of Object.entries(NUMBER_EQUIVALENTS)) {
    if (forms.includes(word)) {
      equivalents.push(number)
      equivalents.push(...forms.filter(f => f !== word))
    }
  }
  
  return [...new Set(equivalents)]
}

// 测试用例
console.log("=== 测试 getEquivalentForms ===")
console.log("it's:", getEquivalentForms("it's"))
console.log("isn't:", getEquivalentForms("isn't"))
console.log("21:", getEquivalentForms("21"))
console.log("twenty-one:", getEquivalentForms("twenty-one"))

// 测试实际对比
console.log("\n=== 测试实际对比 ===")

const original = "Well, it's sunny today."
const spoken = "Well, it's sunny today"

const originalWords = original.split(/\s+/)
const spokenWords = spoken.split(/\s+/)

console.log("原句词列表:", originalWords.map(w => normalize(w)))
console.log("识别词列表:", spokenWords.map(w => normalize(w)))

// 关键：看 "it's" 规范化后是什么
console.log("\n=== 关键检查 ===")
console.log("原句 'it's' 规范化:", normalize("it's"))
console.log("识别 'it's' 规范化:", normalize("it's"))
console.log("是否相等:", normalize("it's") === normalize("it's"))

// 测试更复杂的
console.log("\n=== 测试 21 degrees ===")
const original2 = "No, it isn't. It's 21 degrees."
const spoken2 = "No, it isn't. It's twenty-one degrees."

const originalWords2 = original2.split(/\s+/)
const spokenWords2 = spoken2.split(/\s+/)

console.log("原句词列表:", originalWords2.map(w => normalize(w)))
console.log("识别词列表:", spokenWords2.map(w => normalize(w)))

// 检查 21 vs twenty-one
console.log("\n原句有 '21':", originalWords2.some(w => normalize(w) === "21"))
console.log("识别有 'twenty-one':", spokenWords2.some(w => normalize(w) === "twenty-one"))
console.log("'21' 的等价形式:", getEquivalentForms("21"))
console.log("'twenty-one' 在等价列表中:", getEquivalentForms("21").includes("twenty-one"))
