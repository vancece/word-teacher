# AI 英文词典生成方案

## 一、项目目标

构建一套**自有的完整英文词典体系**，作为 Word Teacher 平台的核心数据资产。

- **目标词量**：50,000+ 词（完全体）
- **生成方式**：由 Claude 分批手动填充词条内容
- **质量标准**：对标牛津/朗文学习词典的内容丰富度

---

## 二、词表来源

### 多源合并策略

以下公开权威词表合并去重，确保覆盖面最广：

| 来源 | 词量 | 特点 | 获取方式 |
|------|------|------|---------|
| **COCA 60000** | 60,000 | 美国当代英语语料库，按词频排序，覆盖最广 | [GitHub](https://github.com/brucewlee/COCA-WordFrequency) / wordfrequency.info |
| **Oxford 5000** | 5,000 | 牛津官方核心词，CEFR 分级(A1-C1) | [GitHub TXT](https://github.com/ittuann/The-Oxford-5000-Word-Lists) |
| **BNC/COCA 25000** | 25,000 | 英式+美式词频，带频率数据 | [EAP Foundation](https://www.eapfoundation.com/vocab/general/bnccoca/) |
| **人教版课标词汇** | ~3,500 | 国内小/初/高教材同步 | 公开课标整理 |
| **四六级/考研大纲** | ~8,000 | 大学英语考试覆盖 | 公开大纲 |
| **NGSL 新通用服务词表** | 2,800 | 现代高频核心词 | 公开 |
| **AWL 学术词表** | 570 | 学术写作核心词 | 公开 |
| **GSL 通用服务词表** | 2,000 | 经典基础词表 | 公开 |

### 合并去重流程

```
COCA 60000（主表，提供词频排序）
  + Oxford 5000（补充 CEFR 分级标签）
  + 人教版课标（补充国内教材标签）
  + 四六级考研（补充考试标签）
  + BNC（补充英式词频）
  → 去重（统一小写、去除变形重复）
  → 最终主词表：约 50,000-55,000 词
```

### 难度分级规则

综合词频 + 词表归属，自动标注等级：

| 等级 | 标签 | 判定规则 |
|------|------|---------|
| A1 | 小学低年级 | Oxford A1 ∪ COCA Top 500 ∪ 人教版1-3年级 |
| A2 | 小学高年级 | Oxford A2 ∪ COCA 500-1500 ∪ 人教版4-6年级 |
| B1 | 初中 | Oxford B1 ∪ COCA 1500-4000 ∪ 人教版初中 |
| B2 | 高中 | Oxford B2 ∪ COCA 4000-8000 ∪ 人教版高中 ∪ CET4 |
| C1 | 大学/进阶 | Oxford C1 ∪ COCA 8000-15000 ∪ CET6/考研 |
| C2 | 高级 | COCA 15000-30000 |
| 专业 | 扩展 | COCA 30000-60000 + 各领域补充 |

---

## 三、词条结构设计

每个词条包含以下维度：

```json
{
  "word": "abandon",
  "phonetic": {
    "us": "/əˈbændən/",
    "uk": "/əˈbændən/"
  },
  "forms": {
    "plural": null,
    "thirdPerson": "abandons",
    "pastTense": "abandoned",
    "pastParticiple": "abandoned",
    "presentParticiple": "abandoning",
    "comparative": null,
    "superlative": null
  },
  "meanings": [
    {
      "pos": "v.",
      "en": "to leave someone or something permanently",
      "cn": "放弃；抛弃；遗弃"
    },
    {
      "pos": "n.",
      "en": "a feeling of complete freedom from worry or responsibility",
      "cn": "放纵；放任"
    }
  ],
  "phrases": [
    { "phrase": "abandon hope", "cn": "放弃希望", "example": "Don't abandon hope just yet." },
    { "phrase": "abandon oneself to", "cn": "沉溺于；纵情于", "example": "She abandoned herself to grief." },
    { "phrase": "with abandon", "cn": "放纵地；尽情地", "example": "The children played with abandon." }
  ],
  "examples": [
    { "en": "They had to abandon the car in the snow.", "cn": "他们不得不把车丢在雪地里。" },
    { "en": "The baby was abandoned outside a hospital.", "cn": "那个婴儿被遗弃在医院外面。" }
  ],
  "synonyms": ["give up", "desert", "forsake", "quit"],
  "antonyms": ["keep", "maintain", "continue"],
  "memory_tip": "a + band(乐队) + on → 乐队在演出时离开了 → 抛弃",
  "confusables": [
    { "word": "desert", "diff": "desert 强调"遗弃不管"，abandon 强调"主动放弃"" }
  ],
  "tags": ["emotion", "action"],
  "level": "B2",
  "frequency_rank": 2142,
  "syllables": 3,
  "letter_count": 7
}
```

### 维度说明

| 维度 | 必填 | 说明 |
|------|------|------|
| word | ✅ | 单词原形 |
| phonetic.us / .uk | ✅ | 美式/英式 IPA 音标 |
| forms | ✅ | 词形变化（按词性填充相关字段，不适用的填 null） |
| meanings | ✅ | 释义列表，按词性分组，按使用频率排序 |
| phrases | ✅ | 2-3 个常用短语/搭配，含中文和例句 |
| examples | ✅ | 2-3 个例句，中英对照 |
| synonyms | ✅ | 2-4 个近义词 |
| antonyms | ⚪ | 1-2 个反义词（有则填，无则空数组） |
| memory_tip | ⚪ | 联想记忆/词根拆解（尽量提供） |
| confusables | ⚪ | 易混淆词对比（有则填，无则空数组） |
| tags | ✅ | 主题标签（动物/食物/运动/学校/情感/科技…） |
| level | ✅ | CEFR 等级：A1/A2/B1/B2/C1/C2 |
| frequency_rank | ✅ | COCA 词频排名 |
| syllables | ✅ | 音节数 |
| letter_count | ✅ | 字母数 |

---

## 四、生成方式：分批手动填充

### 4.1 方式说明

由 Claude 在对话中直接生成词条内容，逐批写入 JSON 文件。

- **每批数量**：200-300 个词条
- **每批输出**：写入 `data/dictionary/batch-{NNN}.json`
- **按顺序推进**：按词频从高到低（COCA 排名）
- **断点记录**：维护进度文件，记录已完成的词和批次

### 4.2 分批计划

| 阶段 | 词频范围 | 词量 | 批次数 | 优先级 |
|------|---------|------|--------|--------|
| 第一阶段 | COCA 1-5000 | 5,000 | ~20 批 | 🔴 最高 |
| 第二阶段 | COCA 5001-15000 | 10,000 | ~40 批 | 🟡 高 |
| 第三阶段 | COCA 15001-30000 | 15,000 | ~60 批 | 🟢 中 |
| 第四阶段 | COCA 30001-50000+ | 20,000 | ~80 批 | ⚪ 低 |
| **总计** | | **50,000+** | **~200 批** | |

### 4.3 文件组织

```
data/
└── dictionary/
    ├── wordlist.txt              # 主词表（50000+ 纯单词列表，按词频排序）
    ├── progress.json             # 进度记录（已完成批次、下一批起始位置）
    ├── batch-001.json            # 第1批词条（word 1-250）
    ├── batch-002.json            # 第2批词条（word 251-500）
    ├── ...
    └── batch-200.json            # 第200批
```

### 4.4 进度文件格式

```json
{
  "total_words": 50000,
  "completed_words": 0,
  "completed_batches": 0,
  "next_batch": 1,
  "next_word_index": 0,
  "last_updated": "2026-05-29T15:50:00Z",
  "batches": []
}
```

### 4.5 工作流程

每次开始新一批：

1. 读取 `progress.json` 确认从哪里继续
2. 从 `wordlist.txt` 取下一批 200-300 个词
3. Claude 生成完整词条内容
4. 写入 `batch-{NNN}.json`
5. 更新 `progress.json`
6. 用户说"继续"→ 重复上述步骤

---

## 五、质量保障

### 5.1 生成时自检

每批生成后自动校验：

- [ ] JSON 格式合法
- [ ] 必填字段完整
- [ ] 音标格式正确（以 `/` 包裹）
- [ ] 例句包含目标单词或其变形
- [ ] 中文释义非空
- [ ] 等级标注与词频匹配
- [ ] 无明显重复词条

### 5.2 后续可补充的校验

- 批次间去重检查
- 交叉引用：近义词/反义词/易混淆词是否也在词典中
- 短语搭配是否真实存在（可后期用搜索引擎验证）

### 5.3 用户反馈机制

上线后前端添加"报错"按钮，支持众包修正。

---

## 六、数据库设计

```sql
-- 主词表
CREATE TABLE dictionary_words (
  id INT PRIMARY KEY AUTO_INCREMENT,
  word VARCHAR(100) NOT NULL UNIQUE,
  phonetic_us VARCHAR(200),
  phonetic_uk VARCHAR(200),
  level ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2'),
  frequency_rank INT,
  syllables TINYINT,
  letter_count TINYINT,
  memory_tip TEXT,
  tags JSON,
  forms JSON,
  synonyms JSON,
  antonyms JSON,
  confusables JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_word (word),
  INDEX idx_level (level),
  INDEX idx_frequency (frequency_rank)
);

-- 释义表（一词多义）
CREATE TABLE dictionary_meanings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  word_id INT NOT NULL,
  pos VARCHAR(20),
  en_definition TEXT,
  cn_definition TEXT,
  sort_order TINYINT DEFAULT 0,
  FOREIGN KEY (word_id) REFERENCES dictionary_words(id) ON DELETE CASCADE
);

-- 例句表
CREATE TABLE dictionary_examples (
  id INT PRIMARY KEY AUTO_INCREMENT,
  word_id INT NOT NULL,
  en_sentence TEXT NOT NULL,
  cn_sentence TEXT,
  FOREIGN KEY (word_id) REFERENCES dictionary_words(id) ON DELETE CASCADE
);

-- 短语表
CREATE TABLE dictionary_phrases (
  id INT PRIMARY KEY AUTO_INCREMENT,
  word_id INT NOT NULL,
  phrase VARCHAR(200) NOT NULL,
  cn_meaning VARCHAR(500),
  example TEXT,
  FOREIGN KEY (word_id) REFERENCES dictionary_words(id) ON DELETE CASCADE
);
```

---

## 七、前端词典功能规划

### 7.1 页面

| 页面 | 功能 |
|------|------|
| 词典搜索页 | 搜索框 + 模糊匹配 + 搜索建议 + 历史记录 |
| 词条详情页 | 展示全部维度信息，支持发音播放（TTS） |
| 按等级浏览 | 按 CEFR A1-C2 分类浏览 |
| 按主题浏览 | 按 tags 分类（动物/食物/运动/学校…） |
| 生词本 | 用户收藏的词，支持复习模式 |
| 每日一词 | 每天推荐一个新词 |

### 7.2 与现有功能联动

| 联动点 | 说明 |
|--------|------|
| **单词游戏** | 词典中的词可一键加入单词包 |
| **对话练习** | 对话中遇到的生词可跳转词典 |
| **跟读练习** | 词典例句可作为跟读材料 |
| **AI 对话** | AI 用词超出学生等级时自动弹出词典卡片 |
| **学习报告** | 统计学生查词频率、已掌握词量 |

---

## 八、执行计划

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 | 确定方案 ✅ | 完成 |
| P1 | 下载词表 → 合并去重 → 生成 wordlist.txt | 待开始 |
| P2 | 分批填充词条（第一阶段：COCA Top 5000） | 待开始 |
| P3 | 入库脚本（JSON → MySQL） | 待开始 |
| P4 | 后端 API（搜索/详情/分类/收藏） | 待开始 |
| P5 | 前端词典页面 | 待开始 |
| P6 | 继续填充剩余批次（长期推进） | 待开始 |

---

## 九、快速开始

准备好后，对我说：**"开始填充词典"**

我会：
1. 确认/创建主词表文件
2. 读取进度
3. 取下一批 250 个词
4. 输出完整词条 JSON
5. 写入文件并更新进度

每次对话说 **"继续"** 就接着下一批。
