import { useState, useEffect, useRef } from 'react'
import {
  Table, Card, Select, Input, DatePicker, Button, Space, Tag, Tabs,
  Statistic, Row, Col, Switch, Empty, Spin, Modal,
} from 'antd'
import {
  ReloadOutlined, DownloadOutlined, SearchOutlined,
  WarningOutlined, CloseCircleOutlined, InfoCircleOutlined,
  BarChartOutlined,
} from '@ant-design/icons'
import { FileText, Activity } from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import dayjs from 'dayjs'
import { useRequest } from 'ahooks'
import { adminApi } from '../api'
import './LogsPage.scss'

const { Option } = Select
const { Search } = Input

interface LogEntry {
  level: number
  time: string
  msg: string
  module?: string
  raw?: string
  err?: { message: string; stack?: string }
  req?: { method: string; url: string }
  res?: { statusCode: number }
  responseTime?: number
}

interface LogFile {
  filename: string
  size: number
  sizeHuman: string
  lastModified: string
  date: string
}



const LEVEL_COLORS: Record<number, string> = {
  10: '#8c8c8c', // trace
  20: '#1890ff', // debug
  30: '#52c41a', // info
  40: '#faad14', // warn
  50: '#ff4d4f', // error
  60: '#cf1322', // fatal
}

const LEVEL_NAMES: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
}

const LEVEL_OPTIONS = [
  { value: 'debug', label: 'DEBUG' },
  { value: 'info', label: 'INFO' },
  { value: 'warn', label: 'WARN' },
  { value: 'error', label: 'ERROR' },
  { value: 'fatal', label: 'FATAL' },
]

export default function LogsPage() {
  const [activeTab, setActiveTab] = useState('realtime')
  const [date, setDate] = useState(dayjs())
  const [level, setLevel] = useState<string | undefined>(undefined)
  const [module, setModule] = useState<string | undefined>(undefined)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
  const autoRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // 实时日志
  const { data: tailData, loading: tailLoading, run: fetchTail } = useRequest(
    () => adminApi.getLogsTail({ lines: 100, level }),
    { manual: true }
  )

  // 日志查询
  const { data: queryData, loading: queryLoading, run: fetchQuery } = useRequest(
    () => adminApi.getLogsQuery({
      date: date.format('YYYY-MM-DD'),
      level,
      module,
      keyword: keyword || undefined,
      page,
      limit: 100,
    }),
    { manual: true }
  )

  // 文件列表
  const { data: filesData, loading: filesLoading, run: fetchFiles } = useRequest(
    () => adminApi.getLogsFiles(),
    { manual: true }
  )

  // 统计
  const { data: statsData, loading: statsLoading, run: fetchStats } = useRequest(
    () => adminApi.getLogsStats({ date: date.format('YYYY-MM-DD') }),
    { manual: true }
  )

  // 切换 tab 时加载对应数据
  useEffect(() => {
    if (activeTab === 'realtime') fetchTail()
    else if (activeTab === 'query') fetchQuery()
    else if (activeTab === 'files') fetchFiles()
    else if (activeTab === 'stats') fetchStats()
  }, [activeTab])

  // 自动刷新
  useEffect(() => {
    if (autoRefresh && activeTab === 'realtime') {
      autoRefreshTimer.current = setInterval(fetchTail, 5000)
    }
    return () => {
      if (autoRefreshTimer.current) {
        clearInterval(autoRefreshTimer.current)
        autoRefreshTimer.current = null
      }
    }
  }, [autoRefresh, activeTab])

  // 筛选条件变化时重新查询
  useEffect(() => {
    if (activeTab === 'query') {
      setPage(1)
      fetchQuery()
    }
  }, [date, level, module])

  useEffect(() => {
    if (activeTab === 'realtime') {
      fetchTail()
    }
  }, [level])

  const handleSearch = () => {
    setPage(1)
    fetchQuery()
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    fetchQuery()
  }

  const handleDownload = (filename: string) => {
    const baseUrl = import.meta.env.DEV ? 'http://localhost:3001' : ''
    const token = localStorage.getItem('admin_token')
    window.open(`${baseUrl}/api/admin/logs/download/${filename}?token=${token}`, '_blank')
  }

  // 日志表格列
  const logColumns = [
    {
      title: '时间',
      dataIndex: 'time',
      key: 'time',
      width: 180,
      render: (time: string) => time ? dayjs(time).format('HH:mm:ss.SSS') : '-',
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 80,
      render: (lv: number) => (
        <Tag color={LEVEL_COLORS[lv]} style={{ fontWeight: 600 }}>
          {LEVEL_NAMES[lv] || 'UNKNOWN'}
        </Tag>
      ),
    },
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 100,
      render: (mod: string) => mod ? <Tag>{mod}</Tag> : '-',
    },
    {
      title: '消息',
      dataIndex: 'msg',
      key: 'msg',
      ellipsis: true,
      render: (msg: string, record: LogEntry) => (
        <span
          className="log-msg"
          style={{ color: record.level >= 50 ? '#ff4d4f' : record.level >= 40 ? '#faad14' : undefined }}
        >
          {msg}
          {record.err && <Tag color="red" style={{ marginLeft: 8 }}>有错误详情</Tag>}
          {record.responseTime && (
            <Tag color="blue" style={{ marginLeft: 8 }}>{record.responseTime}ms</Tag>
          )}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 60,
      render: (_: any, record: LogEntry) => (
        <Button type="link" size="small" onClick={() => setSelectedLog(record)}>
          详情
        </Button>
      ),
    },
  ]

  // 文件列表列
  const fileColumns = [
    {
      title: '文件名',
      dataIndex: 'filename',
      key: 'filename',
      render: (name: string) => <span style={{ fontFamily: 'monospace' }}>{name}</span>,
    },
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
    },
    {
      title: '大小',
      dataIndex: 'sizeHuman',
      key: 'size',
      width: 100,
    },
    {
      title: '最后修改',
      dataIndex: 'lastModified',
      key: 'lastModified',
      width: 180,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: LogFile) => (
        <Button
          type="link"
          icon={<DownloadOutlined />}
          onClick={() => handleDownload(record.filename)}
        >
          下载
        </Button>
      ),
    },
  ]

  // 统计图表配置
  const getHourlyChartOption = () => {
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`)
    return {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: hours },
      yAxis: { type: 'value', name: '错误数' },
      series: [{
        name: '错误数',
        type: 'bar',
        data: statsData?.hourlyErrors || [],
        itemStyle: { color: '#ff4d4f' },
      }],
      grid: { left: 60, right: 20, top: 40, bottom: 40 },
    }
  }

  const getLevelPieOption = () => {
    const data = Object.entries(statsData?.levelCounts || {})
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name: name.toUpperCase(), value }))
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        data,
        itemStyle: {
          color: (params: any) => {
            const colors: Record<string, string> = {
              DEBUG: '#1890ff', INFO: '#52c41a', WARN: '#faad14', ERROR: '#ff4d4f', FATAL: '#cf1322',
            }
            return colors[params.name] || '#8c8c8c'
          },
        },
      }],
    }
  }

  const renderRealtimeTab = () => (
    <div className="realtime-tab">
      <div className="toolbar">
        <Space>
          <Select
            placeholder="级别筛选"
            allowClear
            value={level}
            onChange={setLevel}
            style={{ width: 120 }}
          >
            {LEVEL_OPTIONS.map(opt => (
              <Option key={opt.value} value={opt.value}>{opt.label}</Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={fetchTail}>刷新</Button>
          <span className="auto-refresh">
            <Switch size="small" checked={autoRefresh} onChange={setAutoRefresh} />
            <span style={{ marginLeft: 6 }}>自动刷新 (5s)</span>
          </span>
        </Space>
        {tailData && (
          <span className="log-count">
            共 {tailData.total} 条，显示最新 {tailData.logs?.length || 0} 条
          </span>
        )}
      </div>
      <Spin spinning={tailLoading}>
        <Table
          columns={logColumns}
          dataSource={tailData?.logs || []}
          rowKey={(_, index) => String(index)}
          pagination={false}
          size="small"
          scroll={{ y: 'calc(100vh - 320px)' }}
          rowClassName={(record: LogEntry) =>
            record.level >= 50 ? 'log-row-error' : record.level >= 40 ? 'log-row-warn' : ''
          }
        />
      </Spin>
    </div>
  )

  const renderQueryTab = () => (
    <div className="query-tab">
      <div className="toolbar">
        <Space wrap>
          <DatePicker
            value={date}
            onChange={(d) => d && setDate(d)}
            allowClear={false}
          />
          <Select
            placeholder="级别"
            allowClear
            value={level}
            onChange={setLevel}
            style={{ width: 100 }}
          >
            {LEVEL_OPTIONS.map(opt => (
              <Option key={opt.value} value={opt.value}>{opt.label}</Option>
            ))}
          </Select>
          <Select
            placeholder="模块"
            allowClear
            value={module}
            onChange={setModule}
            style={{ width: 120 }}
          >
            <Option value="database">database</Option>
            <Option value="auth">auth</Option>
            <Option value="api">api</Option>
            <Option value="agent">agent</Option>
          </Select>
          <Search
            placeholder="关键词搜索"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onSearch={handleSearch}
            enterButton={<SearchOutlined />}
            style={{ width: 240 }}
          />
        </Space>
      </div>
      <Spin spinning={queryLoading}>
        <Table
          columns={logColumns}
          dataSource={queryData?.logs || []}
          rowKey={(_, index) => String(index)}
          pagination={{
            current: page,
            pageSize: 100,
            total: queryData?.total || 0,
            onChange: handlePageChange,
            showTotal: (total) => `共 ${total} 条`,
            showSizeChanger: false,
          }}
          size="small"
          scroll={{ y: 'calc(100vh - 380px)' }}
          rowClassName={(record: LogEntry) =>
            record.level >= 50 ? 'log-row-error' : record.level >= 40 ? 'log-row-warn' : ''
          }
        />
      </Spin>
    </div>
  )

  const renderFilesTab = () => (
    <div className="files-tab">
      <div className="toolbar">
        <Button icon={<ReloadOutlined />} onClick={fetchFiles}>刷新</Button>
      </div>
      <Spin spinning={filesLoading}>
        {filesData?.length ? (
          <Table
            columns={fileColumns}
            dataSource={filesData}
            rowKey="filename"
            pagination={false}
            size="small"
          />
        ) : (
          <Empty description="暂无日志文件" />
        )}
      </Spin>
    </div>
  )

  const renderStatsTab = () => (
    <div className="stats-tab">
      <div className="toolbar">
        <Space>
          <DatePicker value={date} onChange={(d) => { if (d) { setDate(d); setTimeout(fetchStats, 0) } }} allowClear={false} />
          <Button icon={<ReloadOutlined />} onClick={fetchStats}>刷新</Button>
        </Space>
      </div>
      <Spin spinning={statsLoading}>
        {statsData ? (
          <>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={6}>
                <Card size="small">
                  <Statistic title="总日志条数" value={statsData.totalLines} prefix={<FileText size={16} />} />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="错误数"
                    value={(statsData.levelCounts?.error || 0) + (statsData.levelCounts?.fatal || 0)}
                    prefix={<CloseCircleOutlined />}
                    valueStyle={{ color: '#ff4d4f' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="警告数"
                    value={statsData.levelCounts?.warn || 0}
                    prefix={<WarningOutlined />}
                    valueStyle={{ color: '#faad14' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="模块数"
                    value={Object.keys(statsData.moduleCounts || {}).length}
                    prefix={<InfoCircleOutlined />}
                  />
                </Card>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={14}>
                <Card title="每小时错误趋势" size="small">
                  <ReactECharts option={getHourlyChartOption()} style={{ height: 280 }} />
                </Card>
              </Col>
              <Col span={10}>
                <Card title="日志级别分布" size="small">
                  <ReactECharts option={getLevelPieOption()} style={{ height: 280 }} />
                </Card>
              </Col>
            </Row>

            {Object.keys(statsData.moduleCounts || {}).length > 0 && (
              <Card title="模块日志量" size="small" style={{ marginTop: 16 }}>
                <div className="module-tags">
                  {Object.entries(statsData.moduleCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([mod, count]) => (
                      <Tag key={mod} color="blue" style={{ margin: 4 }}>
                        {mod}: {count}
                      </Tag>
                    ))
                  }
                </div>
              </Card>
            )}
          </>
        ) : (
          <Empty description="暂无统计数据" />
        )}
      </Spin>
    </div>
  )

  return (
    <div className="logs-page">
      <div className="page-header">
        <h1><Activity size={24} /> 系统日志</h1>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'realtime', label: <span><Activity size={14} style={{ marginRight: 4 }} />实时日志</span> },
          { key: 'query', label: <span><SearchOutlined style={{ marginRight: 4 }} />日志查询</span> },
          { key: 'stats', label: <span><BarChartOutlined style={{ marginRight: 4 }} />统计分析</span> },
          { key: 'files', label: <span><FileText size={14} style={{ marginRight: 4 }} />文件管理</span> },
        ]}
      />

      <div className="tab-content">
        {activeTab === 'realtime' && renderRealtimeTab()}
        {activeTab === 'query' && renderQueryTab()}
        {activeTab === 'files' && renderFilesTab()}
        {activeTab === 'stats' && renderStatsTab()}
      </div>

      <Modal
        title="日志详情"
        open={!!selectedLog}
        onCancel={() => setSelectedLog(null)}
        footer={null}
        width={700}
      >
        {selectedLog && (
          <div className="log-detail">
            <div className="detail-row">
              <span className="label">时间:</span>
              <span>{selectedLog.time ? dayjs(selectedLog.time).format('YYYY-MM-DD HH:mm:ss.SSS') : '-'}</span>
            </div>
            <div className="detail-row">
              <span className="label">级别:</span>
              <Tag color={LEVEL_COLORS[selectedLog.level]}>{LEVEL_NAMES[selectedLog.level]}</Tag>
            </div>
            {selectedLog.module && (
              <div className="detail-row">
                <span className="label">模块:</span>
                <Tag>{selectedLog.module}</Tag>
              </div>
            )}
            <div className="detail-row">
              <span className="label">消息:</span>
              <span>{selectedLog.msg}</span>
            </div>
            {selectedLog.req && (
              <div className="detail-row">
                <span className="label">请求:</span>
                <span>{selectedLog.req.method} {selectedLog.req.url}</span>
              </div>
            )}
            {selectedLog.res && (
              <div className="detail-row">
                <span className="label">响应:</span>
                <Tag color={selectedLog.res.statusCode >= 400 ? 'red' : 'green'}>
                  {selectedLog.res.statusCode}
                </Tag>
                {selectedLog.responseTime && <span style={{ marginLeft: 8 }}>{selectedLog.responseTime}ms</span>}
              </div>
            )}
            {selectedLog.err && (
              <div className="detail-row error-detail">
                <span className="label">错误:</span>
                <div className="error-content">
                  <div className="error-message">{selectedLog.err.message}</div>
                  {selectedLog.err.stack && (
                    <pre className="error-stack">{selectedLog.err.stack}</pre>
                  )}
                </div>
              </div>
            )}
            <div className="detail-row raw-row">
              <span className="label">原始:</span>
              <pre className="raw-content">{selectedLog.raw}</pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
