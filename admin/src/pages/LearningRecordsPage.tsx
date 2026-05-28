import { useState, useEffect } from 'react'
import { Select, Table, Tag, Progress, Button, Input } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { adminApi, type LearningRecord, type Class } from '../api'
import AdminTip from '../components/AdminTip'
import ReadAloudDetailModal from '../components/ReadAloudDetailModal'
import DialogueDetailModal from '../components/DialogueDetailModal'
import './ReadAloudRecordsPage.scss'

export default function LearningRecordsPage() {
  const [records, setRecords] = useState<LearningRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string>('')
  const [type, setType] = useState<string>('')
  const [classId, setClassId] = useState<number | undefined>()
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [classes, setClasses] = useState<Class[]>([])
  const [detailRecord, setDetailRecord] = useState<LearningRecord | null>(null)
  const limit = 15

  useEffect(() => {
    adminApi.getClasses().then(data => setClasses(data.classes || []))
  }, [])

  useEffect(() => {
    loadRecords()
  }, [page, status, type, classId, search])

  const loadRecords = async () => {
    setIsLoading(true)
    try {
      const data = await adminApi.getLearningRecords({
        page,
        limit,
        status: status || undefined,
        type: type || undefined,
        classId: classId || undefined,
        search: search || undefined,
      })
      setRecords(data.records)
      setTotal(data.total)
    } catch (err) {
      console.error('Failed to load records:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const renderScore = (score: number | undefined | null) => {
    if (score == null) return <span className="score-badge no-score">-</span>
    const colorClass = score >= 80 ? 'good' : score >= 60 ? 'medium' : 'low'
    return <span className={`score-badge ${colorClass}`}>{score} 分</span>
  }

  const getStatusTag = (recordStatus: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      COMPLETED: { label: '已完成', color: 'success' },
      IN_PROGRESS: { label: '未完成', color: 'processing' },
      ABANDONED: { label: '已放弃', color: 'error' },
    }
    const info = statusMap[recordStatus] || { label: recordStatus, color: 'default' }
    return <Tag color={info.color}>{info.label}</Tag>
  }

  const getTypeTag = (recordType: string) => {
    if (recordType === 'readAloud') {
      return <Tag color="blue">跟读</Tag>
    }
    return <Tag color="purple">对话</Tag>
  }

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(1)
  }

  const columns: ColumnsType<LearningRecord> = [
    {
      title: '学生',
      dataIndex: 'student',
      key: 'student',
      render: (student) => (
        <div className="student-info">
          <span className="name">{student?.name || '-'}</span>
          <span className="class">{student?.className || ''}</span>
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (t) => getTypeTag(t),
    },
    {
      title: '场景',
      dataIndex: 'scene',
      key: 'scene',
      render: (scene) => scene?.name || '-',
    },
    {
      title: '得分',
      dataIndex: 'totalScore',
      key: 'totalScore',
      render: (score) => renderScore(score),
    },
    {
      title: '完成度',
      key: 'progress',
      render: (_, record) => {
        if (record.type === 'dialogue') {
          return record.completedCount > 0 ? `${record.completedCount} 轮` : '-'
        }
        return (
          <Progress
            percent={record.totalCount > 0 ? Math.round((record.completedCount / record.totalCount) * 100) : 0}
            size="small"
            format={() => `${record.completedCount}/${record.totalCount}`}
          />
        )
      },
      width: 150,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s) => getStatusTag(s),
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          onClick={() => setDetailRecord(record)}
          disabled={record.status !== 'COMPLETED'}
        >
          查看详情
        </Button>
      ),
    },
  ]

  return (
    <div className="records-page">
      <div className="page-header">
        <h1>学习记录</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Input.Search
            placeholder="搜索学生姓名/学号"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 200 }}
            allowClear
            onClear={() => { setSearchInput(''); setSearch(''); setPage(1) }}
          />
          <Select
            value={classId || undefined}
            placeholder="全部班级"
            allowClear
            style={{ width: 140 }}
            onChange={(value) => { setClassId(value || undefined); setPage(1) }}
            options={classes.map(c => ({ label: c.name, value: c.id }))}
          />
          <Select
            value={type || undefined}
            placeholder="全部类型"
            allowClear
            style={{ width: 120 }}
            onChange={(value) => { setType(value || ''); setPage(1) }}
            options={[
              { label: '跟读', value: 'readAloud' },
              { label: '对话', value: 'dialogue' },
            ]}
          />
          <Select
            value={status || undefined}
            placeholder="全部状态"
            allowClear
            style={{ width: 120 }}
            onChange={(value) => { setStatus(value || ''); setPage(1) }}
            options={[
              { label: '已完成', value: 'COMPLETED' },
              { label: '未完成', value: 'IN_PROGRESS' },
            ]}
          />
        </div>
      </div>

      <AdminTip
        adminMessage="您可以查看所有班级学生的学习记录"
        teacherMessage="您只能查看自己负责班级的学生记录"
        showForTeacher
      />

      <Table
        columns={columns}
        dataSource={records}
        rowKey={(r) => `${r.type}-${r.id}`}
        loading={isLoading}
        pagination={{
          current: page,
          pageSize: limit,
          total,
          showTotal: (total) => `共 ${total} 条`,
          showSizeChanger: false,
          onChange: (p) => setPage(p),
        }}
      />

      {detailRecord && detailRecord.type === 'readAloud' && (
        <ReadAloudDetailModal
          studentId={detailRecord.studentId}
          recordId={detailRecord.id}
          studentName={detailRecord.student?.name || '学生'}
          onClose={() => setDetailRecord(null)}
        />
      )}

      {detailRecord && detailRecord.type === 'dialogue' && (
        <DialogueDetailModal
          studentId={detailRecord.studentId}
          recordId={detailRecord.id}
          studentName={detailRecord.student?.name || '学生'}
          onClose={() => setDetailRecord(null)}
        />
      )}
    </div>
  )
}
