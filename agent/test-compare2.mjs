// 完整测试对比逻辑

// 规范化文本 - 和代码保持一致
const normalize = (text) => text
  .toLowerCase()
  .replace(/[.,!?'"''""\-]/g, '')  // 移除标点和各种引号
  .trim()

console.log("=== 测试 normalize ===")
console.log("it's (普通撇号):", normalize("it's"))
console.log("it's (智能引号):", normalize("it's"))
console.log("isn't (智能引号):", normalize("isn't"))
console.log("What's:", normalize("What's"))
console.log("twenty-one:", normalize("twenty-one"))
console.log("21:", normalize("21"))

// 测试用例
const testCases = [
  {
    original: "Well, it's sunny today.",
    spoken: "Well, it's sunny today",
    expected: 100
  },
  {
    original: "No, it isn't. It's 21 degrees.",
    spoken: "No, it isn't. It's twenty-one degrees.",
    expected: 100
  },
  {
    original: "What's the weather like?",
    spoken: "What is the weather like?",
    expected: 100  // 多词匹配
  },
]

// 缩写等价映射
const CONTRACTION_EQUIVALENTS = {
  "whats": ["what is"],
  "its": ["it is"],
  "isnt": ["is not"],
}

// 数字等价映射
const NUMBER_EQUIVALENTS = {
  "21": ["twentyone"],
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

// 多词匹配
function tryMultiWordMatch(originalWord, spokenWords, usedIndices) {
  const expansions = {
    "whats": ["what", "is"],
    "its": ["it", "is"],
    "isnt": ["is", "not"],
    "21": ["twenty", "one"],
  }

  const expansion = expansions[originalWord]
  if (!expansion) {
    return { matched: false, indices: [] }
  }

  for (let i = 0; i <= spokenWords.length - expansion.length; i++) {
    const indices = []
    let allMatch = true
    
    for (let j = 0; j < expansion.length; j++) {
      const idx = i + j
      if (usedIndices.has(idx) || spokenWords[idx] !== expansion[j]) {
        allMatch = false
        break
      }
      indices.push(idx)
    }
    
    if (allMatch) {
      return { matched: true, indices }
    }
  }

  return { matched: false, indices: [] }
}

// 对比函数
function compareAndScore(originalSentence, spokenText) {
  const originalWords = originalSentence.split(/\s+/).filter(w => w.length > 0)
  const spokenWords = spokenText.split(/\s+/)
  const normalizedSpokenOriginal = spokenWords.map(w => normalize(w))
  const usedIndices = new Set()

  const words = originalWords.map((word) => {
    const normalizedOriginal = normalize(word)
    
    // 跳过空词
    if (!normalizedOriginal) {
      return { text: word, status: 'correct' }
    }
    
    // 1. 精确匹配
    let foundIndex = normalizedSpokenOriginal.findIndex((w, i) => !usedIndices.has(i) && w === normalizedOriginal)
    if (foundIndex !== -1) {
      usedIndices.add(foundIndex)
      return { text: word, status: 'correct' }
    }

    // 2. 缩写容错匹配
    const equivalents = getEquivalentForms(normalizedOriginal)
    for (const equiv of equivalents) {
      foundIndex = normalizedSpokenOriginal.findIndex((w, i) => !usedIndices.has(i) && w === equiv)
      if (foundIndex !== -1) {
        usedIndices.add(foundIndex)
        return { text: word, status: 'correct' }
      }
    }

    // 3. 多词展开匹配
    const multiWordMatch = tryMultiWordMatch(normalizedOriginal, normalizedSpokenOriginal, usedIndices)
    if (multiWordMatch.matched) {
      multiWordMatch.indices.forEach(i => usedIndices.add(i))
      return { text: word, status: 'correct' }
    }

    return { text: word, status: 'incorrect' }
  })

  const correctCount = words.filter(w => w.status === 'correct').length
  const accuracy = Math.round((correctCount / words.length) * 100)

  return { words, accuracy }
}

console.log("\n=== 运行测试用例 ===")
for (const tc of testCases) {
  console.log(`\n原句: "${tc.original}"`)
  console.log(`识别: "${tc.spoken}"`)
  
  const originalWords = tc.original.split(/\s+/).filter(w => w.length > 0)
  const spokenWords = tc.spoken.split(/\s+/)
  console.log("原句词 (规范化):", originalWords.map(w => normalize(w)))
  console.log("识别词 (规范化):", spokenWords.map(w => normalize(w)))
  
  const result = compareAndScore(tc.original, tc.spoken)
  console.log("结果:", result.words.map(w => `${w.text}:${w.status}`).join(', '))
  console.log(`准确率: ${result.accuracy}% (期望: ${tc.expected}%)`)
  console.log(result.accuracy === tc.expected ? "✅ PASS" : "❌ FAIL")
}
