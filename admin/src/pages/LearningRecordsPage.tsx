import { useState, useEffect } from 'react'
import { Select, Table, Tag, Progress, Button, Input, Popconfirm, message } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import * as XLSX from 'xlsx'
import { adminApi, learningRecordsApi, type LearningRecord, type Class } from '../api'
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
  const [exporting, setExporting] = useState(false)
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

  const handleDelete = async (record: LearningRecord) => {
    try {
      await learningRecordsApi.deleteRecord(record.type, record.id)
      message.success('删除成功')
      loadRecords()
    } catch {
      message.error('删除失败')
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      // 用当前筛选条件获取所有记录（不分页）
      const data = await adminApi.getLearningRecords({
        page: 1,
        limit: 10000,
        status: status || undefined,
        type: type || undefined,
        classId: classId || undefined,
        search: search || undefined,
      })

      if (data.records.length === 0) {
        message.warning('当前筛选条件下没有数据可导出')
        return
      }

      // 构建 Excel 数据
      const exportData = data.records.map((record) => ({
        '学生姓名': record.student?.name || '-',
        '学号': record.student?.studentNo || '-',
        '班级': record.student?.className || '-',
        '类型': record.type === 'readAloud' ? '跟读' : '对话',
        '场景': record.scene?.name || '-',
        '得分': record.totalScore != null ? record.totalScore : '-',
        '完成度': record.type === 'dialogue'
          ? (record.completedCount > 0 ? `${record.completedCount} 轮` : '-')
          : (record.totalCount > 0 ? `${record.completedCount}/${record.totalCount}` : '-'),
        '状态': record.status === 'COMPLETED' ? '已完成' : record.status === 'IN_PROGRESS' ? '未完成' : record.status === 'ABANDONED' ? '已放弃' : record.status,
        '评价': record.feedback || '-',
        '时间': new Date(record.createdAt).toLocaleString('zh-CN'),
      }))

      // 生成 Excel 文件
      const worksheet = XLSX.utils.json_to_sheet(exportData)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, '学习记录')

      // 设置列宽
      worksheet['!cols'] = [
        { wch: 10 }, // 学生姓名
        { wch: 14 }, // 学号
        { wch: 12 }, // 班级
        { wch: 6 },  // 类型
        { wch: 20 }, // 场景
        { wch: 6 },  // 得分
        { wch: 10 }, // 完成度
        { wch: 8 },  // 状态
        { wch: 40 }, // 评价
        { wch: 20 }, // 时间
      ]

      // 下载
      const fileName = `学习记录_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`
      XLSX.writeFile(workbook, fileName)
      message.success(`已导出 ${data.records.length} 条记录`)
    } catch (err) {
      console.error('Export failed:', err)
      message.error('导出失败')
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnsType<LearningRecord> = [
    {
      title: '学生',
      dataIndex: 'student',
      key: 'student',
      render: (student) => (
        <div className="student-info">
          <span className="name">{student?.name || '-'}</span>
          <span className="meta">{student?.studentNo ? `${student.studentNo}` : ''}{student?.className ? ` · ${student.className}` : ''}</span>
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
      width: 150,
      render: (_, record) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            type="link"
            size="small"
            onClick={() => setDetailRecord(record)}
            disabled={record.status !== 'COMPLETED'}
          >
            详情
          </Button>
          <Popconfirm
            title="确认删除"
            description="确定要删除这条学习记录吗？"
            onConfirm={() => handleDelete(record)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </div>
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
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExport}
            loading={exporting}
          >
            导出 Excel
          </Button>
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
