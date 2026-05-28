import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Eye, EyeOff, Crosshair, Layers, PenLine, Pickaxe } from 'lucide-react'
import { Tabs, Button, Modal, Form, Input, Select, Popconfirm, message, Switch, Space, Tag, Empty } from 'antd'
import { wordPackApi, type WordPack, type GameType } from '../api'
import { useAuth } from '../contexts/AuthContext'
import './WordPacksPage.scss'

const GAME_TYPES: { key: GameType; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'shooter', label: '单词射击', icon: <Crosshair size={16} />, color: '#ff6b6b' },
  { key: 'match', label: '翻牌配对', icon: <Layers size={16} />, color: '#6c63ff' },
  { key: 'spell', label: '美食餐车', icon: <PenLine size={16} />, color: '#48c6ef' },
  { key: 'miner', label: '黄金矿工', icon: <Pickaxe size={16} />, color: '#ff8f00' },
]

interface WordEditItem {
  key: string
  english: string
  chinese: string
  phonetic: string
  difficulty: number
}

export default function WordPacksPage() {
  const { isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState<GameType>('shooter')
  const [packs, setPacks] = useState<WordPack[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingPack, setEditingPack] = useState<WordPack | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [form] = Form.useForm()
  const [words, setWords] = useState<WordEditItem[]>([])

  useEffect(() => {
    loadPacks()
  }, [activeTab])

  const loadPacks = async () => {
    setIsLoading(true)
    try {
      const data = await wordPackApi.getAll(activeTab)
      setPacks(data)
    } catch (err: any) {
      message.error(err.message || '加载失败')
    } finally {
      setIsLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingPack(null)
    form.resetFields()
    form.setFieldsValue({ gameType: activeTab, grade: '通用', visible: true })
    setWords([{ key: Date.now().toString(), english: '', chinese: '', phonetic: '', difficulty: 1 }])
    setModalVisible(true)
  }

  const openEditModal = (pack: WordPack) => {
    setEditingPack(pack)
    form.setFieldsValue({
      name: pack.name,
      description: pack.description,
      gameType: pack.gameType,
      grade: pack.grade,
      visible: pack.visible,
    })
    setWords(
      pack.words.map((w, i) => ({
        key: `${i}-${w.english}`,
        english: w.english,
        chinese: w.chinese,
        phonetic: w.phonetic || '',
        difficulty: w.difficulty || 1,
      }))
    )
    setModalVisible(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      const validWords = words.filter(w => w.english.trim() && w.chinese.trim())

      if (validWords.length === 0) {
        message.warning('至少添加一个单词')
        return
      }

      setIsSaving(true)

      const payload = {
        ...values,
        words: validWords.map(w => ({
          english: w.english.trim(),
          chinese: w.chinese.trim(),
          phonetic: w.phonetic.trim() || undefined,
          difficulty: w.difficulty,
        })),
      }

      if (editingPack) {
        await wordPackApi.update(editingPack.id, payload)
        message.success('更新成功')
      } else {
        await wordPackApi.create(payload)
        message.success('创建成功')
      }

      setModalVisible(false)
      loadPacks()
    } catch (err: any) {
      if (err.errorFields) return // form validation error
      message.error(err.message || '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await wordPackApi.delete(id)
      message.success('已删除')
      loadPacks()
    } catch (err: any) {
      message.error(err.message || '删除失败')
    }
  }

  const handleToggleVisible = async (pack: WordPack) => {
    try {
      await wordPackApi.update(pack.id, { visible: !pack.visible })
      message.success(pack.visible ? '已隐藏' : '已显示')
      loadPacks()
    } catch (err: any) {
      message.error(err.message || '操作失败')
    }
  }

  const addWord = () => {
    setWords([...words, { key: Date.now().toString(), english: '', chinese: '', phonetic: '', difficulty: 1 }])
  }

  const removeWord = (key: string) => {
    setWords(words.filter(w => w.key !== key))
  }

  const updateWord = (key: string, field: keyof WordEditItem, value: any) => {
    setWords(words.map(w => w.key === key ? { ...w, [field]: value } : w))
  }

  const renderPackCard = (pack: WordPack) => (
    <div className={`word-pack-card ${!pack.visible ? 'hidden-pack' : ''}`} key={pack.id}>
      <div className="pack-header">
        <div className="pack-title">
          <h3>{pack.name}</h3>
          {!pack.visible && <Tag color="default">已隐藏</Tag>}
        </div>
        {isAdmin && (
          <Space>
            <Button
              type="text"
              size="small"
              icon={pack.visible ? <EyeOff size={14} /> : <Eye size={14} />}
              onClick={() => handleToggleVisible(pack)}
              title={pack.visible ? '隐藏' : '显示'}
            />
            <Button
              type="text"
              size="small"
              icon={<Edit2 size={14} />}
              onClick={() => openEditModal(pack)}
            />
            <Popconfirm
              title="确定删除此单词包？"
              description="删除后所有单词数据将丢失"
              onConfirm={() => handleDelete(pack.id)}
            >
              <Button type="text" size="small" danger icon={<Trash2 size={14} />} />
            </Popconfirm>
          </Space>
        )}
      </div>
      {pack.description && <p className="pack-desc">{pack.description}</p>}
      <div className="pack-meta">
        <span className="word-count">{pack.words.length} 个单词</span>
        <span className="grade">{pack.grade}</span>
        {pack.creator && <span className="creator">{pack.creator.name}</span>}
      </div>
      <div className="pack-words-preview">
        {pack.words.slice(0, 8).map((w, i) => (
          <Tag key={i} className="word-tag">{w.english}</Tag>
        ))}
        {pack.words.length > 8 && <Tag className="word-tag more">+{pack.words.length - 8}</Tag>}
      </div>
    </div>
  )

  return (
    <div className="word-packs-page">
      <div className="page-header">
        <h1>游戏管理</h1>
        <p className="page-desc">为不同游戏配置单词包，学生可在游戏中练习</p>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as GameType)}
        items={GAME_TYPES.map(gt => ({
          key: gt.key,
          label: (
            <span className="tab-label">
              {gt.icon}
              <span>{gt.label}</span>
            </span>
          ),
        }))}
        tabBarExtraContent={
          isAdmin ? (
            <Button type="primary" icon={<Plus size={14} />} onClick={openCreateModal}>
              新建单词包
            </Button>
          ) : null
        }
      />

      <div className="packs-content">
        {isLoading ? (
          <div className="loading-state">加载中...</div>
        ) : packs.length === 0 ? (
          <Empty description={`还没有为「${GAME_TYPES.find(g => g.key === activeTab)?.label}」配置单词包`}>
            {isAdmin && <Button type="primary" onClick={openCreateModal}>立即创建</Button>}
          </Empty>
        ) : (
          <div className="packs-grid">
            {packs.map(renderPackCard)}
          </div>
        )}
      </div>

      <Modal
        title={editingPack ? '编辑单词包' : '新建单词包'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSave}
        confirmLoading={isSaving}
        width={720}
        okText="保存"
        className="word-pack-modal"
      >
        <Form form={form} layout="vertical">
          <div className="form-row">
            <Form.Item name="name" label="单词包名称" rules={[{ required: true, message: '请输入名称' }]} style={{ flex: 1 }}>
              <Input placeholder="如：动物世界" />
            </Form.Item>
            <Form.Item name="gameType" label="游戏类型" rules={[{ required: true }]} style={{ width: 160 }}>
              <Select>
                {GAME_TYPES.map(gt => (
                  <Select.Option key={gt.key} value={gt.key}>{gt.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <div className="form-row">
            <Form.Item name="description" label="描述" style={{ flex: 1 }}>
              <Input placeholder="简要描述这个单词包" />
            </Form.Item>
            <Form.Item name="grade" label="年级/难度" style={{ width: 120 }}>
              <Input placeholder="通用" />
            </Form.Item>
            <Form.Item name="visible" label="可见" valuePropName="checked" style={{ width: 60 }}>
              <Switch />
            </Form.Item>
          </div>
        </Form>

        <div className="words-editor">
          <div className="words-header">
            <h4>单词列表 ({words.filter(w => w.english.trim()).length} 个)</h4>
            <Button size="small" type="dashed" icon={<Plus size={12} />} onClick={addWord}>
              添加单词
            </Button>
          </div>

          <div className="words-table">
            <div className="words-table-head">
              <span className="col-english">英文</span>
              <span className="col-chinese">中文</span>
              <span className="col-phonetic">音标</span>
              <span className="col-difficulty">难度</span>
              <span className="col-action"></span>
            </div>
            <div className="words-table-body">
              {words.map((word, index) => (
                <div className="words-table-row" key={word.key}>
                  <span className="row-index">{index + 1}</span>
                  <input
                    className="col-english"
                    placeholder="apple"
                    value={word.english}
                    onChange={(e) => updateWord(word.key, 'english', e.target.value)}
                  />
                  <input
                    className="col-chinese"
                    placeholder="苹果"
                    value={word.chinese}
                    onChange={(e) => updateWord(word.key, 'chinese', e.target.value)}
                  />
                  <input
                    className="col-phonetic"
                    placeholder="/ˈæpəl/"
                    value={word.phonetic}
                    onChange={(e) => updateWord(word.key, 'phonetic', e.target.value)}
                  />
                  <select
                    className="col-difficulty"
                    value={word.difficulty}
                    onChange={(e) => updateWord(word.key, 'difficulty', parseInt(e.target.value))}
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                  </select>
                  <button
                    className="col-action remove-btn"
                    onClick={() => removeWord(word.key)}
                    disabled={words.length <= 1}
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <Button block type="dashed" onClick={addWord} style={{ marginTop: 8 }}>
            + 添加更多单词
          </Button>
        </div>
      </Modal>
    </div>
  )
}
