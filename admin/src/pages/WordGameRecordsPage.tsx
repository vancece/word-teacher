import { useState, useEffect } from 'react'
import { Select, Table, Tag, Input, Modal, Popconfirm, Button, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { wordGameRecordsApi, adminApi, type WordGameRecord, type Class } from '../api'
import './WordGameRecordsPage.scss'

const GAME_TYPE_OPTIONS = [
  { value: '', label: '全部游戏' },
  { value: 'shooter', label: '保卫城堡' },
  { value: 'match', label: '翻牌配对' },
  { value: 'spell', label: '美食餐车' },
  { value: 'miner', label: '黄金矿工' },
]

const GAME_TYPE_MAP: Record<string, { label: string; color: string }> = {
  shooter: { label: '保卫城堡', color: 'red' },
  match: { label: '翻牌配对', color: 'purple' },
  spell: { label: '美食餐车', color: 'blue' },
  miner: { label: '黄金矿工', color: 'orange' },
}

export default function WordGameRecordsPage() {
  const [records, setRecords] = useState<WordGameRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [gameType, setGameType] = useState<string>('')
  const [classId, setClassId] = useState<number | undefined>()
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [classes, setClasses] = useState<Class[]>([])
  const [detailRecord, setDetailRecord] = useState<WordGameRecord | null>(null)
  const limit = 15

  useEffect(() => {
    adminApi.getClasses().then(data => setClasses(data.classes || []))
  }, [])

  useEffect(() => { loadRecords() }, [page, gameType, classId, search])

  const loadRecords = async () => {
    setIsLoading(true)
    try {
      const data = await wordGameRecordsApi.getRecords({
        page, limit, gameType: gameType || undefined, classId, search: search || undefined,
      })
      setRecords(data.records)
      setTotal(data.total)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await wordGameRecordsApi.deleteRecord(id)
      message.success('删除成功')
      loadRecords()
    } catch {
      message.error('删除失败')
    }
  }

  const columns: ColumnsType<WordGameRecord> = [
    {
      title: '学生',
      key: 'student',
      width: 140,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.student.name}</div>
          <div style={{ fontSize: 12, color: '#999' }}>{r.student.studentNo}</div>
        </div>
      ),
    },
    {
      title: '班级',
      key: 'class',
      width: 120,
      render: (_, r) => r.student.class?.name || '-',
    },
    {
      title: '游戏',
      dataIndex: 'gameType',
      width: 110,
      render: (type: string) => {
        const info = GAME_TYPE_MAP[type]
        return info ? <Tag color={info.color}>{info.label}</Tag> : type
      },
    },
    {
      title: '词包',
      dataIndex: 'packName',
      width: 130,
    },
    {
      title: '得分',
      dataIndex: 'score',
      width: 80,
      render: (score: number) => <span style={{ fontWeight: 700, color: '#4f46e5' }}>{score}</span>,
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (t: string) => new Date(t).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <a onClick={() => setDetailRecord(r)}>详情</a>
          <Popconfirm
            title="确认删除"
            description="确定要删除这条游戏记录吗？"
            onConfirm={() => handleDelete(r.id)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="link" size="small" danger style={{ padding: 0 }}>删除</Button>
          </Popconfirm>
        </div>
      ),
    },
  ]

  return (
    <div className="word-game-records-page">
      <div className="page-header">
        <h2>游戏记录</h2>
      </div>

      <div className="filter-bar">
        <Input.Search
          placeholder="搜索学生姓名/学号"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onSearch={v => { setSearch(v); setPage(1) }}
          allowClear
          style={{ width: 200 }}
        />
        <Select
          value={classId || undefined}
          onChange={v => { setClassId(v); setPage(1) }}
          placeholder="全部班级"
          allowClear
          style={{ width: 140 }}
          options={classes.map(c => ({ value: c.id, label: c.name }))}
        />
        <Select
          value={gameType}
          onChange={v => { setGameType(v); setPage(1) }}
          style={{ width: 140 }}
          options={GAME_TYPE_OPTIONS}
        />
      </div>

      <Table
        columns={columns}
        dataSource={records}
        rowKey="id"
        loading={isLoading}
        pagination={{
          current: page,
          pageSize: limit,
          total,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p) => setPage(p),
        }}
        size="middle"
      />

      <Modal
        open={!!detailRecord}
        onCancel={() => setDetailRecord(null)}
        title={detailRecord ? `${detailRecord.student.name} - ${GAME_TYPE_MAP[detailRecord.gameType]?.label || detailRecord.gameType}` : ''}
        footer={null}
        width={560}
      >
        {detailRecord && (
          <div className="record-detail">
            <div className="detail-meta">
              <span>词包: <strong>{detailRecord.packName}</strong></span>
              <span>得分: <strong>{detailRecord.score} 分</strong></span>
              <span>时间: {new Date(detailRecord.createdAt).toLocaleString('zh-CN')}</span>
            </div>
            <div className="detail-summary" dangerouslySetInnerHTML={{
              __html: detailRecord.summary
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br/>')
            }} />
          </div>
        )}
      </Modal>
    </div>
  )
}
