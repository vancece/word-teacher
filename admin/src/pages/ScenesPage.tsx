import { useState, useEffect, useRef } from 'react'
import { Plus, Edit2, Trash2, Mic2, MessageSquare, PlusCircle, MinusCircle, Eye, EyeOff, Sparkles, Image as ImageIcon, Lock, Upload, X } from 'lucide-react'
import { Tabs, Button, Modal, Form, Input, Select, Card, Popconfirm, message, Spin, Switch, Tooltip, Image, Tag } from 'antd'
import { adminApi, type ReadAloudScene, type DialogueScene } from '../api'
import { useAuth } from '../contexts/AuthContext'
import AdminTip from '../components/AdminTip'
import './ScenesPage.scss'

interface SentenceItem {
  id: number
  english: string
  chinese: string
}

interface SceneModalState {
  visible: boolean
  mode: 'add' | 'edit'
  type: 'readAloud' | 'dialogue'
  scene?: ReadAloudScene | DialogueScene
}

export default function ScenesPage() {
  const { user, isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState<'readAloud' | 'dialogue'>('readAloud')
  const [readAloudScenes, setReadAloudScenes] = useState<ReadAloudScene[]>([])
  const [dialogueScenes, setDialogueScenes] = useState<DialogueScene[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [sentences, setSentences] = useState<SentenceItem[]>([])
  const [isSupplementing, setIsSupplementing] = useState(false)
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [sceneModal, setSceneModal] = useState<SceneModalState>({ visible: false, mode: 'add', type: 'readAloud' })
  const [vocabulary, setVocabulary] = useState<string[]>([])  // 关键词数组
  const [newKeyword, setNewKeyword] = useState('')  // 新关键词输入
  const [form] = Form.useForm()
  const fileInputRef = useRef<HTMLInputElement>(null)  // 图片上传 input ref

  // 检查当前用户是否可以编辑某个场景
  const canEditScene = (scene: ReadAloudScene | DialogueScene) => {
    if (isAdmin) return true
    return scene.creatorId === user?.id
  }

  useEffect(() => {
    loadScenes()
  }, [])

  // 当弹窗打开时，更新表单值
  useEffect(() => {
    if (sceneModal.visible) {
      if (sceneModal.mode === 'edit' && sceneModal.scene) {
        if (sceneModal.type === 'dialogue') {
          const scene = sceneModal.scene as DialogueScene
          form.setFieldsValue(scene)
          setVocabulary(scene.vocabulary || [])
          setCoverImage(scene.coverImage || null)
        } else {
          form.setFieldsValue(sceneModal.scene)
          const scene = sceneModal.scene as ReadAloudScene
          setSentences(scene.sentences?.map((s, i) => ({ id: i + 1, english: s.english, chinese: s.chinese })) || [{ id: 1, english: '', chinese: '' }])
          setCoverImage(scene.coverImage || null)
        }
      } else {
        form.resetFields()
        setSentences([{ id: 1, english: '', chinese: '' }])
        setVocabulary([])
        setCoverImage(null)
      }
      setNewKeyword('')
    }
  }, [sceneModal.visible, sceneModal.mode, sceneModal.scene, sceneModal.type, form])

  // 添加关键词
  const handleAddKeyword = () => {
    const keyword = newKeyword.trim().toLowerCase()
    if (keyword && !vocabulary.includes(keyword)) {
      setVocabulary([...vocabulary, keyword])
      setNewKeyword('')
    }
  }

  // 删除关键词
  const handleRemoveKeyword = (word: string) => {
    setVocabulary(vocabulary.filter(v => v !== word))
  }

  const loadScenes = async () => {
    setIsLoading(true)
    try {
      const [ra, d] = await Promise.all([
        adminApi.getReadAloudScenes(),
        adminApi.getScenes(),
      ])
      setReadAloudScenes(ra)
      setDialogueScenes(d as any)
    } catch (err) {
      console.error('Failed to load scenes:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteReadAloud = async (id: string) => {
    try {
      await adminApi.deleteReadAloudScene(id)
      setReadAloudScenes(prev => prev.filter(s => s.id !== id))
      message.success('删除成功')
    } catch (err) {
      message.error('删除失败')
    }
  }

  const handleDeleteDialogue = async (id: string) => {
    try {
      await adminApi.deleteScene(id)
      setDialogueScenes(prev => prev.filter(s => s.id !== id))
      message.success('删除成功')
    } catch (err) {
      message.error('删除失败')
    }
  }

  // 打开编辑弹窗
  const handleEditReadAloud = (scene: ReadAloudScene) => {
    setSceneModal({ visible: true, mode: 'edit', type: 'readAloud', scene })
  }

  const handleEditDialogue = (scene: DialogueScene) => {
    setSceneModal({ visible: true, mode: 'edit', type: 'dialogue', scene })
  }

  // 打开添加弹窗
  const handleOpenAddModal = () => {
    setSceneModal({ visible: true, mode: 'add', type: activeTab })
  }

  // 切换可见性
  const handleToggleVisibility = async (type: 'readAloud' | 'dialogue', id: string, visible: boolean) => {
    try {
      if (type === 'readAloud') {
        await adminApi.updateReadAloudScene(id, { visible })
        setReadAloudScenes(prev => prev.map(s => s.id === id ? { ...s, visible } : s))
      } else {
        await adminApi.updateScene(id, { visible })
        setDialogueScenes(prev => prev.map(s => s.id === id ? { ...s, visible } : s))
      }
      message.success(visible ? '已显示给学生' : '已对学生隐藏')
    } catch (err) {
      message.error('操作失败')
    }
  }

  // 添加句子
  const handleAddSentence = () => {
    const newId = sentences.length > 0 ? Math.max(...sentences.map(s => s.id)) + 1 : 1
    setSentences([...sentences, { id: newId, english: '', chinese: '' }])
  }

  // 删除句子
  const handleRemoveSentence = (id: number) => {
    setSentences(sentences.filter(s => s.id !== id))
  }

  // 标准化引号（将 Unicode 智能引号替换为普通 ASCII 引号）
  const normalizeQuotes = (text: string) => text
    .replace(/[\u2018\u2019\u201B]/g, "'")  // 各种单引号 → 普通撇号
    .replace(/[\u201C\u201D\u201F]/g, '"')  // 各种双引号 → 普通双引号

  // 更新句子
  const handleUpdateSentence = (id: number, field: 'english' | 'chinese', value: string) => {
    // 对英文句子自动标准化引号，避免 Unicode 引号导致语音识别匹配问题
    const normalizedValue = field === 'english' ? normalizeQuotes(value) : value
    setSentences(sentences.map(s => s.id === id ? { ...s, [field]: normalizedValue } : s))
  }

  // 关闭弹窗
  const handleModalCancel = () => {
    setSceneModal({ ...sceneModal, visible: false })
    setSentences([])
    setCoverImage(null)
    form.resetFields()
  }

  // 保存场景（统一处理添加和编辑）
  const handleSaveScene = async () => {
    try {
      const values = await form.validateFields()
      setIsSaving(true)

      if (sceneModal.type === 'readAloud') {
        // 验证句子
        const validSentences = sentences.filter(s => s.english.trim() && s.chinese.trim())
        if (validSentences.length === 0) {
          message.error('请至少添加一个句子')
          setIsSaving(false)
          return
        }

        if (sceneModal.mode === 'add') {
          // 添加新跟读场景
          const newScene = await adminApi.createReadAloudScene({
            name: values.name,
            description: values.description || '',
            grade: values.grade || '基础',
            sentences: validSentences,
            coverImage: coverImage || undefined,
          })
          setReadAloudScenes(prev => [...prev, newScene])
          message.success('添加成功')
        } else {
          // 编辑跟读场景
          const scene = sceneModal.scene as ReadAloudScene
          const updatedScene = await adminApi.updateReadAloudScene(scene.id, {
            name: values.name,
            description: values.description,
            grade: values.grade,
            sentences: validSentences,
            coverImage: coverImage || undefined,
          })
          setReadAloudScenes(prev => prev.map(s => s.id === scene.id ? updatedScene : s))
          message.success('保存成功')
        }
      } else {
        // 对话场景
        if (sceneModal.mode === 'add') {
          const newScene = await adminApi.createScene({
            name: values.name,
            description: values.description || '',
            grade: values.grade || '基础',
            vocabulary: vocabulary,
            coverImage: coverImage || undefined,
            prompt: values.prompt || undefined,
          })
          setDialogueScenes(prev => [...prev, newScene])
          message.success('添加成功')
        } else {
          const scene = sceneModal.scene as DialogueScene
          const updatedScene = await adminApi.updateScene(scene.id, {
            name: values.name,
            description: values.description,
            grade: values.grade,
            vocabulary: vocabulary,
            coverImage: coverImage || undefined,
            prompt: values.prompt || undefined,
          })
          setDialogueScenes(prev => prev.map(s => s.id === scene.id ? updatedScene : s))
          message.success('保存成功')
        }
      }

      handleModalCancel()
    } catch (err) {
      message.error(sceneModal.mode === 'add' ? '添加失败' : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  // 验证表单（用于 AI 补充前）
  const validateForAI = (): boolean => {
    const values = form.getFieldsValue()
    if (!values.name?.trim()) {
      message.warning('请输入场景名称')
      return false
    }
    if (!values.description?.trim()) {
      message.warning('请输入场景描述')
      return false
    }
    if (sceneModal.type === 'readAloud') {
      const englishSentences = sentences.filter(s => s.english.trim())
      if (englishSentences.length === 0) {
        message.warning('请至少添加一个英文句子')
        return false
      }
    }
    return true
  }

  // AI 补充：仅翻译（不再生成图片，太贵了）
  const handleAISupplement = async () => {
    if (!validateForAI()) return

    try {
      const values = form.getFieldsValue()
      setIsSupplementing(true)
      message.loading({ content: 'AI 正在补充翻译...', key: 'supplement', duration: 0 })

      const result = await adminApi.supplementScene({
        sceneName: values.name,
        sceneDescription: values.description,
        sentences: sceneModal.type === 'readAloud' ? sentences.filter(s => s.english.trim()).map(s => ({ english: s.english })) : undefined,
        type: sceneModal.type,
        skipCoverImage: true,  // 跳过封面图生成
      })

      // 更新翻译
      if (result.translations && sceneModal.type === 'readAloud') {
        setSentences(prev => prev.map(s => {
          const translated = result.translations?.find(t => t.english === s.english)
          return translated ? { ...s, chinese: translated.chinese || s.chinese } : s
        }))
      }

      message.success({ content: 'AI 翻译完成！', key: 'supplement' })
    } catch (err) {
      console.error('AI supplement error:', err)
      message.error({ content: 'AI 补充失败，请重试', key: 'supplement' })
    } finally {
      setIsSupplementing(false)
    }
  }

  // 判断是否需要 AI 补充（仅跟读场景需要翻译时）
  const needsAISupplement = (): boolean => {
    if (sceneModal.type === 'readAloud') {
      // 跟读场景：有未翻译的句子时需要 AI 补充
      const hasUntranslated = sentences.some(s => s.english.trim() && !s.chinese.trim())
      return hasUntranslated
    }
    // 对话场景：不需要 AI 补充
    return false
  }

  // 处理图片上传
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      message.error('请上传图片文件')
      return
    }

    // 验证文件大小（最大 2MB）
    if (file.size > 2 * 1024 * 1024) {
      message.error('图片大小不能超过 2MB')
      return
    }

    // 转为 base64
    const reader = new FileReader()
    reader.onload = (e) => {
      setCoverImage(e.target?.result as string)
    }
    reader.readAsDataURL(file)

    // 清空 input，允许重复选择同一文件
    event.target.value = ''
  }

  // 清除封面图
  const handleClearCoverImage = () => {
    setCoverImage(null)
  }

  return (
    <div className="scenes-page">
      <div className="page-header">
        <h1>场景管理</h1>
        <Button type="primary" icon={<Plus size={16} />} onClick={handleOpenAddModal}>
          添加场景
        </Button>
      </div>

      <AdminTip
        adminMessage="您可以查看和管理所有场景"
        teacherMessage="您可以查看所有场景，但只能编辑自己创建的场景"
        showForTeacher
      />

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'readAloud' | 'dialogue')}
        items={[
          {
            key: 'readAloud',
            label: <span><Mic2 size={16} style={{ marginRight: 8 }} />跟读场景</span>,
          },
          {
            key: 'dialogue',
            label: <span><MessageSquare size={16} style={{ marginRight: 8 }} />对话场景</span>,
          },
        ]}
      />

      <Spin spinning={isLoading}>
        <div className="scenes-grid">
          {activeTab === 'readAloud' ? (
            readAloudScenes.length === 0 ? (
              <div className="empty">暂无跟读场景</div>
            ) : (
              readAloudScenes.map((scene) => (
                <Card key={scene.id} className={`scene-card ${!scene.visible ? 'hidden-scene' : ''}`} hoverable>
                  {/* 封面图片 */}
                  {scene.coverImage ? (
                    <img src={scene.coverImage} alt={scene.name} className="scene-cover" />
                  ) : (
                    <div className="scene-cover-placeholder">
                      <ImageIcon size={24} />
                    </div>
                  )}
                  <div className="scene-header">
                    <h3>{scene.name}</h3>
                    <div className="header-badges">
                      {!scene.visible && (
                        <Tooltip title="学生不可见">
                          <span className="badge hidden-badge"><EyeOff size={12} /> 隐藏</span>
                        </Tooltip>
                      )}
                      <span className="badge">{scene.grade}</span>
                    </div>
                  </div>
                  <p className="description">{scene.description || '暂无描述'}</p>
                  {/* 句子预览列表 */}
                  {scene.sentences && scene.sentences.length > 0 && (
                    <div className="sentences-preview">
                      <div className="sentences-preview-header">
                        <Mic2 size={14} />
                        <span>跟读句子 ({scene.sentences.length})</span>
                      </div>
                      <div className="sentences-preview-list">
                        {scene.sentences.slice(0, 3).map((s: any, idx: number) => (
                          <div key={idx} className="sentence-preview-item">
                            <span className="sentence-num">{idx + 1}</span>
                            <span className="sentence-text">{s.english}</span>
                          </div>
                        ))}
                        {scene.sentences.length > 3 && (
                          <div className="sentence-more">+{scene.sentences.length - 3} 更多...</div>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="scene-footer">
                    <div className="scene-meta">
                      <span>{scene.sentences?.length || 0} 个句子</span>
                      <span className="separator">·</span>
                      <span>{scene.creator?.name || '未知'}</span>
                      <span className="separator">·</span>
                      <span>{new Date(scene.createdAt).toLocaleDateString()}</span>
                    </div>
                    <Tooltip title={scene.visible ? '点击隐藏' : '点击显示'}>
                      <Switch
                        size="small"
                        checked={scene.visible}
                        onChange={(checked) => handleToggleVisibility('readAloud', scene.id, checked)}
                        checkedChildren={<Eye size={12} />}
                        unCheckedChildren={<EyeOff size={12} />}
                      />
                    </Tooltip>
                  </div>
                  <div className="scene-actions">
                    {canEditScene(scene) ? (
                      <>
                        <Button type="text" icon={<Edit2 size={16} />} onClick={() => handleEditReadAloud(scene)} />
                        <Popconfirm
                          title="确定要删除这个场景吗？"
                          onConfirm={() => handleDeleteReadAloud(scene.id)}
                          okText="确定"
                          cancelText="取消"
                        >
                          <Button type="text" danger icon={<Trash2 size={16} />} />
                        </Popconfirm>
                      </>
                    ) : (
                      <Tooltip title="只有创建者或管理员可以编辑">
                        <Button type="text" icon={<Lock size={16} />} disabled />
                      </Tooltip>
                    )}
                  </div>
                </Card>
              ))
            )
          ) : (
            dialogueScenes.length === 0 ? (
              <div className="empty">暂无对话场景</div>
            ) : (
              dialogueScenes.map((scene) => (
                <Card key={scene.id} className={`scene-card ${!scene.visible ? 'hidden-scene' : ''}`} hoverable>
                  {/* 封面图片 */}
                  {scene.coverImage ? (
                    <img src={scene.coverImage} alt={scene.name} className="scene-cover" />
                  ) : (
                    <div className="scene-cover-placeholder">
                      <ImageIcon size={24} />
                    </div>
                  )}
                  <div className="scene-header">
                    <h3>{scene.name}</h3>
                    <div className="header-badges">
                      {!scene.visible && (
                        <Tooltip title="学生不可见">
                          <span className="badge hidden-badge"><EyeOff size={12} /> 隐藏</span>
                        </Tooltip>
                      )}
                      <span className="badge">{scene.grade}</span>
                    </div>
                  </div>
                  <p className="description">{scene.description || '暂无描述'}</p>
                  <div className="scene-footer">
                    <div className="scene-meta">
                      <span>{scene.creator?.name || '未知'}</span>
                      <span className="separator">·</span>
                      <span>{scene.createdAt ? new Date(scene.createdAt).toLocaleDateString() : '-'}</span>
                    </div>
                    <Tooltip title={scene.visible ? '点击隐藏' : '点击显示'}>
                      <Switch
                        size="small"
                        checked={scene.visible}
                        onChange={(checked) => handleToggleVisibility('dialogue', scene.id, checked)}
                        checkedChildren={<Eye size={12} />}
                        unCheckedChildren={<EyeOff size={12} />}
                      />
                    </Tooltip>
                  </div>
                  <div className="scene-actions">
                    {canEditScene(scene) ? (
                      <>
                        <Button type="text" icon={<Edit2 size={16} />} onClick={() => handleEditDialogue(scene)} />
                        <Popconfirm
                          title="确定要删除这个场景吗？"
                          onConfirm={() => handleDeleteDialogue(scene.id)}
                          okText="确定"
                          cancelText="取消"
                        >
                          <Button type="text" danger icon={<Trash2 size={16} />} />
                        </Popconfirm>
                      </>
                    ) : (
                      <Tooltip title="只有创建者或管理员可以编辑">
                        <Button type="text" icon={<Lock size={16} />} disabled />
                      </Tooltip>
                    )}
                  </div>
                </Card>
              ))
            )
          )}
        </div>
      </Spin>

      {/* 统一的场景弹窗（添加/编辑） */}
      <Modal
        title={`${sceneModal.mode === 'add' ? '添加' : '编辑'}${sceneModal.type === 'readAloud' ? '跟读' : '对话'}场景`}
        open={sceneModal.visible}
        onCancel={handleModalCancel}
        footer={null}
        destroyOnClose
        width={sceneModal.type === 'readAloud' ? 800 : 500}
        className="scene-modal"
      >
        <div className={`modal-body ${sceneModal.type === 'readAloud' ? 'two-column' : ''}`}>
          {/* 左侧：基础信息 + 封面图 */}
          <div className="left-panel">
            <Form form={form} layout="vertical" autoComplete="off">
              <Form.Item name="name" label="场景名称" rules={[{ required: true, message: '请输入场景名称' }]}>
                <Input placeholder="如：打招呼" />
              </Form.Item>
              <Form.Item name="description" label="描述" rules={[{ required: true, message: '请输入场景描述' }]}>
                <Input.TextArea rows={2} placeholder="如：学习日常问候" />
              </Form.Item>
              <Form.Item name="grade" label="难度" initialValue="基础">
                <Select options={[{ value: '基础', label: '基础' }, { value: '进阶', label: '进阶' }, { value: '高级', label: '高级' }]} />
              </Form.Item>
              {/* 对话场景专属字段 */}
              {sceneModal.type === 'dialogue' && (
                <>
                  <div className="form-item-custom">
                    <label>关键词</label>
                    <div className="keyword-input-row">
                      <Input
                        value={newKeyword}
                        onChange={e => setNewKeyword(e.target.value)}
                        placeholder="输入关键词"
                        onPressEnter={handleAddKeyword}
                        style={{ flex: 1 }}
                      />
                      <Button type="primary" onClick={handleAddKeyword} icon={<PlusCircle size={14} />}>
                        添加
                      </Button>
                    </div>
                    <div className="keyword-tags">
                      {vocabulary.length === 0 ? (
                        <span className="empty-hint">暂无关键词，请添加</span>
                      ) : (
                        vocabulary.map(word => (
                          <Tag
                            key={word}
                            closable
                            onClose={() => handleRemoveKeyword(word)}
                            color="blue"
                          >
                            {word}
                          </Tag>
                        ))
                      )}
                    </div>
                  </div>
                  <Form.Item
                    name="prompt"
                    label="AI 提示词"
                    tooltip="用于引导 AI 的对话风格和内容"
                  >
                    <Input.TextArea
                      rows={2}
                      placeholder="可选，如：请扮演一位亲切的老师，多聊校园话题"
                    />
                  </Form.Item>
                </>
              )}
            </Form>

            {/* 封面图上传 */}
            <div className="cover-section">
              <div className="cover-label">封面图 <span style={{ color: '#9ca3af', fontWeight: 'normal' }}>(可选)</span></div>
              {coverImage ? (
                <div className="cover-preview" style={{ position: 'relative' }}>
                  <Image src={coverImage} alt="封面" width={140} height={140} style={{ borderRadius: 8, objectFit: 'cover' }} />
                  <Button
                    type="text"
                    size="small"
                    icon={<X size={14} />}
                    onClick={handleClearCoverImage}
                    style={{
                      position: 'absolute',
                      top: -8,
                      right: -8,
                      background: '#ef4444',
                      color: 'white',
                      borderRadius: '50%',
                      width: 24,
                      height: 24,
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  />
                </div>
              ) : (
                <div
                  className="cover-placeholder"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ cursor: 'pointer' }}
                >
                  <Upload size={28} color="#d1d5db" />
                  <span>点击上传图片</span>
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {/* 右侧：句子列表（仅跟读场景） */}
          {sceneModal.type === 'readAloud' && (
            <div className="right-panel">
              <div className="panel-header">
                <span>英文句子</span>
                <Button type="link" size="small" icon={<PlusCircle size={14} />} onClick={handleAddSentence}>
                  添加
                </Button>
              </div>
              <div className="sentences-list">
                {sentences.map((sentence, index) => (
                  <div key={sentence.id} className="sentence-row">
                    <span className="num">{index + 1}</span>
                    <div className="sentence-content">
                      <Input
                        placeholder="输入英文句子"
                        value={sentence.english}
                        onChange={e => handleUpdateSentence(sentence.id, 'english', e.target.value)}
                      />
                      {sentence.chinese && (
                        <div className="translation">→ {sentence.chinese}</div>
                      )}
                    </div>
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<MinusCircle size={14} />}
                      onClick={() => handleRemoveSentence(sentence.id)}
                      disabled={sentences.length <= 1}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="modal-footer">
          <Button onClick={handleModalCancel}>取消</Button>
          {needsAISupplement() ? (
            <Button
              type="primary"
              icon={<Sparkles size={16} />}
              onClick={handleAISupplement}
              loading={isSupplementing}
              className="ai-btn"
            >
              {isSupplementing ? 'AI 处理中...' : 'AI 补充'}
            </Button>
          ) : (
            <Button type="primary" onClick={handleSaveScene} loading={isSaving}>
              {sceneModal.mode === 'add' ? '添加场景' : '保存修改'}
            </Button>
          )}
        </div>
      </Modal>
    </div>
  )
}

