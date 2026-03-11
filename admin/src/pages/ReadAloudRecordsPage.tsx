import { useState, useEffect } from 'react'
import { Select, Table, Tag, Progress } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { adminApi, type ReadAloudRecord } from '../api'
import AdminTip from '../components/AdminTip'
import './ReadAloudRecordsPage.scss'

export default function ReadAloudRecordsPage() {
  const [records, setRecords] = useState<ReadAloudRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const limit = 15

  useEffect(() => {
    loadRecords()
  }, [page, status])

  const loadRecords = async () => {
    setIsLoading(true)
    try {
      const data = await adminApi.getReadAloudRecords({
        page,
        limit,
        status: status || undefined,
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

  const columns: ColumnsType<ReadAloudRecord> = [
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
      render: (_, record) => (
        <Progress
          percent={Math.round((record.completedCount / record.totalCount) * 100)}
          size="small"
          format={() => `${record.completedCount}/${record.totalCount}`}
        />
      ),
      width: 150,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => getStatusTag(status),
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date) => new Date(date).toLocaleString(),
    },
  ]

  return (
    <div className="records-page">
      <div className="page-header">
        <h1>跟读记录</h1>
        <Select
          value={status || undefined}
          placeholder="全部状态"
          allowClear
          style={{ width: 140 }}
          onChange={(value) => { setStatus(value || ''); setPage(1) }}
          options={[
            { label: '已完成', value: 'COMPLETED' },
            { label: '未完成', value: 'IN_PROGRESS' },
          ]}
        />
      </div>

      <AdminTip
        adminMessage="您可以查看所有班级学生的跟读练习记录"
        teacherMessage="您只能查看自己负责班级的学生记录"
        showForTeacher
      />

      <Table
        columns={columns}
        dataSource={records}
        rowKey="id"
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
    </div>
  )
}

