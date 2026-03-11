import { useState, useMemo } from 'react'
import { TrendingUp, ArrowUp, ArrowDown, Minus, Users, Activity, Award, AlertTriangle, Star, Calendar, Sparkles, ThumbsUp, AlertCircle, Lightbulb, Download, FileText, FileSpreadsheet } from 'lucide-react'
import { Select, Card, Spin, Button, message, Table, Tag, Dropdown, Modal } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { MenuProps } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useRequest } from 'ahooks'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import { adminApi, type StudentProgress, type StudentSummary, type StudentStat, type ProgressOverview } from '../api'
import AdminTip from '../components/AdminTip'
import './ProgressPage.scss'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

export default function ProgressPage() {
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [selectedDays, setSelectedDays] = useState<number>(30)
  const [selectedPracticeType, setSelectedPracticeType] = useState<string>('')
  const [selectedScene, setSelectedScene] = useState<string>('')
  const [selectedStudent, setSelectedStudent] = useState<StudentProgress | null>(null)
  const [studentSummary, setStudentSummary] = useState<StudentSummary | null>(null)

  // 获取班级统计数据
  const { data: overview, loading: isLoading } = useRequest(
    () => adminApi.getProgressOverview({
      classId: selectedClass ? parseInt(selectedClass) : undefined,
      days: selectedDays,
      practiceType: selectedPracticeType || undefined,
      sceneId: selectedScene || undefined,
    }),
    { refreshDeps: [selectedClass, selectedDays, selectedPracticeType, selectedScene] }
  )

  // 获取场景选项（根据练习类型）
  const sceneOptions = useMemo(() => {
    if (!overview) return []
    if (selectedPracticeType === 'dialogue') {
      return overview.dialogueScenes?.map(s => ({ label: s.name, value: s.id })) || []
    }
    if (selectedPracticeType === 'readAloud') {
      return overview.readAloudScenes?.map(s => ({ label: s.name, value: s.id })) || []
    }
    return []
  }, [overview, selectedPracticeType])

  const { run: loadStudentProgress, loading: studentLoading } = useRequest(
    (id: number) => adminApi.getStudentProgress(id),
    {
      manual: true,
      onSuccess: (data) => {
        setSelectedStudent(data)
        setStudentSummary(null)
      },
    }
  )

  // AI 学习总结请求
  const { run: loadStudentSummary, loading: summaryLoading } = useRequest(
    (id: number) => adminApi.getStudentSummary(id),
    {
      manual: true,
      onSuccess: (data) => {
        setStudentSummary(data)
        message.success('AI 总结生成成功')
      },
      onError: () => {
        message.error('生成总结失败，请稍后重试')
      },
    }
  )

  // ECharts 配置 - 整体趋势图
  const trendChartOption = useMemo(() => {
    if (!overview?.progressData?.length) return {}

    const weeks = overview.progressData.map(d => dayjs(d.week).format('M/D'))
    const scores = overview.progressData.map(d => d.avgScore)

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const data = params[0]
          return `${data.name}<br/>平均分：<b>${data.value}</b> 分`
        },
      },
      grid: { left: '3%', right: '4%', bottom: '8%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: weeks,
        axisLabel: { color: '#64748b', fontSize: 11 },
        axisLine: { lineStyle: { color: '#e2e8f0' } },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: { color: '#64748b', formatter: '{value}' },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      series: [{
        type: 'line',
        data: scores,
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: '#10b981' },
        lineStyle: { width: 3, color: '#10b981' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.05)' },
            ],
          },
        },
      }],
    }
  }, [overview])

  // 学生表格列定义
  const studentColumns: ColumnsType<StudentStat> = [
    {
      title: '学生',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      ellipsis: true,
      render: (name: string, record) => (
        <div className="student-cell">
          <div className="avatar">{name[0]}</div>
          <div className="info">
            <span className="name">{name}</span>
            <span className="class">{record.className}</span>
          </div>
        </div>
      ),
    },
    {
      title: '对话',
      dataIndex: 'practiceCount',
      key: 'practiceCount',
      width: 50,
      align: 'center',
      render: (count: number) => <span className="count-badge dialogue">{count}</span>,
    },
    {
      title: '跟读',
      dataIndex: 'readAloudCount',
      key: 'readAloudCount',
      width: 50,
      align: 'center',
      render: (count: number) => <span className="count-badge readAloud">{count}</span>,
    },
    {
      title: '均分',
      dataIndex: 'avgScore',
      key: 'avgScore',
      width: 50,
      align: 'center',
      sorter: (a, b) => (a.avgScore || 0) - (b.avgScore || 0),
      render: (score: number | null) => score !== null ? (
        <span className={`score ${score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low'}`}>{score}</span>
      ) : <span className="no-data">-</span>,
    },
    {
      title: '趋势',
      dataIndex: 'improvement',
      key: 'improvement',
      width: 60,
      align: 'center',
      sorter: (a, b) => a.improvement - b.improvement,
      render: (improvement: number) => (
        <span className={`trend ${improvement > 0 ? 'up' : improvement < 0 ? 'down' : 'neutral'}`}>
          {improvement > 0 ? <ArrowUp size={12} /> : improvement < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
          {improvement > 0 ? '+' : ''}{improvement}
        </span>
      ),
    },
  ]

  // 学生详情图表配置
  const studentChartOption = useMemo(() => {
    if (!selectedStudent) return {}

    const practiceData = selectedStudent.practiceProgress.slice(-10)
    const readAloudData = selectedStudent.readAloudProgress.slice(-10)

    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['对话练习', '跟读练习'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: practiceData.map((_, i) => `第${i + 1}次`),
        axisLabel: { color: '#64748b', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: { color: '#64748b', formatter: '{value}' },
      },
      series: [
        {
          name: '对话练习',
          type: 'line',
          data: practiceData.map(p => p.score),
          smooth: true,
          itemStyle: { color: '#10b981' },
          areaStyle: { color: 'rgba(16, 185, 129, 0.1)' },
        },
        {
          name: '跟读练习',
          type: 'line',
          data: readAloudData.map(p => p.score),
          smooth: true,
          itemStyle: { color: '#6366f1' },
          areaStyle: { color: 'rgba(99, 102, 241, 0.1)' },
        },
      ],
    }
  }, [selectedStudent])

  const stats = overview?.classStats

  // 导出功能
  const handleExport = (type: 'excel' | 'pdf') => {
    if (!overview) {
      message.warning('暂无数据可导出')
      return
    }

    if (type === 'excel') {
      exportToExcel(overview)
    } else {
      exportToPDF(overview)
    }
  }

  // 导出为 Excel
  const exportToExcel = (data: ProgressOverview) => {
    const className = selectedClass
      ? data.classes.find(c => String(c.id) === selectedClass)?.name || '全部班级'
      : '全部班级'

    // 构建 CSV 内容
    let csv = '\uFEFF' // BOM for UTF-8
    csv += `班级学习情况报告 - ${className}\n`
    csv += `统计时间：近${selectedDays}天\n`
    csv += `导出时间：${dayjs().format('YYYY-MM-DD HH:mm')}\n\n`

    csv += `=== 班级统计 ===\n`
    csv += `学生数量,${data.classStats.studentCount}\n`
    csv += `活跃人数,${data.classStats.activeCount}\n`
    csv += `参与率,${data.classStats.participationRate}%\n`
    csv += `对话练习次数,${data.classStats.totalPracticeCount}\n`
    csv += `跟读练习次数,${data.classStats.totalReadAloudCount}\n`
    csv += `平均分,${data.classStats.avgScore}\n`
    csv += `趋势变化,${data.classStats.scoreTrend > 0 ? '+' : ''}${data.classStats.scoreTrend}\n\n`

    csv += `=== 学生明细 ===\n`
    csv += `姓名,班级,对话次数,跟读次数,平均分,趋势变化\n`
    data.students.forEach(s => {
      csv += `${s.name},${s.className},${s.practiceCount},${s.readAloudCount},${s.avgScore || '-'},${s.improvement > 0 ? '+' : ''}${s.improvement}\n`
    })

    if (data.needAttention.length > 0) {
      csv += `\n=== 需要关注 ===\n`
      csv += `姓名,原因\n`
      data.needAttention.forEach(s => {
        csv += `${s.name},${s.reason}\n`
      })
    }

    if (data.topPerformers.length > 0) {
      csv += `\n=== 表现优秀 ===\n`
      csv += `姓名,亮点\n`
      data.topPerformers.forEach(s => {
        csv += `${s.name},${s.highlight}\n`
      })
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `学习报告_${className}_${dayjs().format('YYYYMMDD')}.csv`
    link.click()
    message.success('导出成功')
  }

  // 导出为 PDF（简化版 - 使用 HTML 打印）
  const exportToPDF = (data: ProgressOverview) => {
    const className = selectedClass
      ? data.classes.find(c => String(c.id) === selectedClass)?.name || '全部班级'
      : '全部班级'

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>学习报告</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #333; }
          h1 { color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px; }
          h2 { color: #374151; margin-top: 30px; }
          .meta { color: #666; margin-bottom: 20px; }
          .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
          .stat-box { background: #f8fafc; padding: 15px; border-radius: 8px; text-align: center; }
          .stat-value { font-size: 28px; font-weight: bold; color: #10b981; }
          .stat-label { color: #666; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          th { background: #f8fafc; font-weight: 600; }
          .trend-up { color: #10b981; }
          .trend-down { color: #ef4444; }
          .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
          .tag-warning { background: #fef3c7; color: #92400e; }
          .tag-success { background: #d1fae5; color: #065f46; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <h1>📊 班级学习情况报告</h1>
        <p class="meta">班级：${className} | 统计时间：近${selectedDays}天 | 导出时间：${dayjs().format('YYYY-MM-DD HH:mm')}</p>

        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-value">${data.classStats.studentCount}</div>
            <div class="stat-label">学生数量（活跃 ${data.classStats.activeCount} 人）</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${data.classStats.totalPracticeCount + data.classStats.totalReadAloudCount}</div>
            <div class="stat-label">总训练次数</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${data.classStats.avgScore}<small>分</small></div>
            <div class="stat-label">平均分 <span class="${data.classStats.scoreTrend >= 0 ? 'trend-up' : 'trend-down'}">(${data.classStats.scoreTrend > 0 ? '+' : ''}${data.classStats.scoreTrend})</span></div>
          </div>
        </div>

        <h2>📋 学生明细</h2>
        <table>
          <thead>
            <tr><th>姓名</th><th>班级</th><th>对话</th><th>跟读</th><th>平均分</th><th>趋势</th></tr>
          </thead>
          <tbody>
            ${data.students.map(s => `
              <tr>
                <td>${s.name}</td>
                <td>${s.className}</td>
                <td>${s.practiceCount}</td>
                <td>${s.readAloudCount}</td>
                <td>${s.avgScore || '-'}</td>
                <td class="${s.improvement >= 0 ? 'trend-up' : 'trend-down'}">${s.improvement > 0 ? '+' : ''}${s.improvement}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        ${data.needAttention.length > 0 ? `
          <h2>⚠️ 需要关注</h2>
          <table>
            <thead><tr><th>姓名</th><th>原因</th></tr></thead>
            <tbody>
              ${data.needAttention.map(s => `<tr><td>${s.name}</td><td><span class="tag tag-warning">${s.reason}</span></td></tr>`).join('')}
            </tbody>
          </table>
        ` : ''}

        ${data.topPerformers.length > 0 ? `
          <h2>⭐ 表现优秀</h2>
          <table>
            <thead><tr><th>姓名</th><th>亮点</th></tr></thead>
            <tbody>
              ${data.topPerformers.map(s => `<tr><td>${s.name}</td><td><span class="tag tag-success">${s.highlight}</span></td></tr>`).join('')}
            </tbody>
          </table>
        ` : ''}
      </body>
      </html>
    `

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(printContent)
      printWindow.document.close()
      printWindow.onload = () => {
        printWindow.print()
      }
      message.success('请在打印对话框中选择"另存为 PDF"')
    }
  }

  const exportMenuItems: MenuProps['items'] = [
    { key: 'excel', label: '导出 Excel (CSV)', icon: <FileSpreadsheet size={16} /> },
    { key: 'pdf', label: '导出 PDF', icon: <FileText size={16} /> },
  ]

  return (
    <div className="progress-page">
      <div className="page-header">
        <h1><TrendingUp size={28} /> 学习进步情况</h1>
        <Dropdown menu={{ items: exportMenuItems, onClick: ({ key }) => handleExport(key as 'excel' | 'pdf') }}>
          <Button icon={<Download size={16} />}>导出报告</Button>
        </Dropdown>
      </div>

      <AdminTip
        adminMessage="您可以查看所有班级的学习进步数据和趋势分析"
        teacherMessage="您只能查看自己负责班级的学习进步数据"
        showForTeacher
      />

      {/* 筛选条件 */}
      <Card className="filters-card">
        <div className="filters">
          <div className="filter-group">
            <label>选择班级</label>
            <Select
              value={selectedClass || undefined}
              placeholder="全部班级"
              allowClear
              style={{ width: 180 }}
              onChange={(value) => setSelectedClass(value || '')}
              options={overview?.classes.map((c) => ({ label: `${c.name}${c.grade ? ` (${c.grade})` : ''}`, value: String(c.id) })) || []}
            />
          </div>
          <div className="filter-group">
            <label>时间范围</label>
            <Select
              value={selectedDays}
              style={{ width: 140 }}
              onChange={(value) => setSelectedDays(value)}
              options={[
                { label: '近7天', value: 7 },
                { label: '近30天', value: 30 },
                { label: '近90天', value: 90 },
              ]}
            />
          </div>
          <div className="filter-group">
            <label>练习类型</label>
            <Select
              value={selectedPracticeType || undefined}
              placeholder="全部类型"
              allowClear
              style={{ width: 140 }}
              onChange={(value) => { setSelectedPracticeType(value || ''); setSelectedScene('') }}
              options={[
                { label: '对话练习', value: 'dialogue' },
                { label: '跟读练习', value: 'readAloud' },
              ]}
            />
          </div>
          {selectedPracticeType && sceneOptions.length > 0 && (
            <div className="filter-group">
              <label>场景</label>
              <Select
                value={selectedScene || undefined}
                placeholder="全部场景"
                allowClear
                style={{ width: 180 }}
                onChange={(value) => setSelectedScene(value || '')}
                options={sceneOptions}
              />
            </div>
          )}
        </div>
      </Card>

      <Spin spinning={isLoading}>
        {/* 统计卡片 */}
        <div className="stats-cards">
          <div className="stat-card students">
            <div className="stat-icon"><Users size={24} /></div>
            <div className="stat-content">
              <span className="stat-label">学生数量</span>
              <span className="stat-value">{stats?.studentCount || 0}</span>
              <span className="stat-sub">活跃 {stats?.activeCount || 0} 人 ({stats?.participationRate || 0}%)</span>
            </div>
          </div>
          <div className="stat-card practice">
            <div className="stat-icon"><Activity size={24} /></div>
            <div className="stat-content">
              <span className="stat-label">训练次数</span>
              <span className="stat-value">{(stats?.totalPracticeCount || 0) + (stats?.totalReadAloudCount || 0)}</span>
              <span className="stat-sub">对话 {stats?.totalPracticeCount || 0} · 跟读 {stats?.totalReadAloudCount || 0}</span>
            </div>
          </div>
          <div className="stat-card score">
            <div className="stat-icon"><Award size={24} /></div>
            <div className="stat-content">
              <span className="stat-label">平均分</span>
              <span className="stat-value">{stats?.avgScore || 0}<small>分</small></span>
              <span className={`stat-trend ${(stats?.scoreTrend || 0) >= 0 ? 'up' : 'down'}`}>
                {(stats?.scoreTrend || 0) >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                {(stats?.scoreTrend || 0) > 0 ? '+' : ''}{stats?.scoreTrend || 0} 分
              </span>
            </div>
          </div>
        </div>

        {/* 主要内容区 */}
        <div className="page-main-content">
          {/* 左侧：趋势图 + 关注列表 */}
          <div className="left-section">
            <Card className="trend-card">
              <h3><Calendar size={18} /> 成绩趋势</h3>
              {overview?.progressData && overview.progressData.length > 0 ? (
                <ReactECharts option={trendChartOption} style={{ height: 280 }} />
              ) : (
                <div className="empty">暂无数据</div>
              )}
            </Card>

            <div className="attention-grid">
              {/* 需要关注 */}
              <Card className="attention-card warning">
                <h3><AlertTriangle size={18} /> 需要关注</h3>
                {overview?.needAttention && overview.needAttention.length > 0 ? (
                  <div className="attention-list">
                    {overview.needAttention.map(s => (
                      <div key={s.id} className="attention-item" onClick={() => loadStudentProgress(s.id)}>
                        <div className="avatar">{s.name[0]}</div>
                        <div className="info">
                          <span className="name">{s.name}</span>
                          <Tag color="orange">{s.reason}</Tag>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-small">暂无需要关注的学生 🎉</div>
                )}
              </Card>

              {/* 表现优秀 */}
              <Card className="attention-card success">
                <h3><Star size={18} /> 表现优秀</h3>
                {overview?.topPerformers && overview.topPerformers.length > 0 ? (
                  <div className="attention-list">
                    {overview.topPerformers.map(s => (
                      <div key={s.id} className="attention-item" onClick={() => loadStudentProgress(s.id)}>
                        <div className="avatar">{s.name[0]}</div>
                        <div className="info">
                          <span className="name">{s.name}</span>
                          <Tag color="green">{s.highlight}</Tag>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-small">暂无数据</div>
                )}
              </Card>
            </div>
          </div>

          {/* 右侧：学生列表表格 */}
          <Card className="students-table-card">
            <h3><Users size={18} /> 学生列表</h3>
            <Table
              columns={studentColumns}
              dataSource={overview?.students || []}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 10, showSizeChanger: false, size: 'small' }}
              scroll={{ x: 350, y: 420 }}
              onRow={(record) => ({
                onClick: () => loadStudentProgress(record.id),
                style: { cursor: 'pointer' },
              })}
            />
          </Card>
        </div>
      </Spin>

      {/* 学生详情弹窗 */}
      <Modal
        open={!!selectedStudent}
        onCancel={() => setSelectedStudent(null)}
        footer={null}
        width={1100}
        className="student-detail-modal"
        title={null}
        destroyOnClose
      >
        {selectedStudent && (
          <Spin spinning={studentLoading}>
            <div className="student-detail-content">
              {/* 头部信息 */}
              <div className="detail-header">
                <div className="student-avatar-large">
                  {selectedStudent.student.name[0]}
                </div>
                <div className="student-meta">
                  <h2>{selectedStudent.student.name}</h2>
                  <div className="meta-tags">
                    <Tag color="blue">{selectedStudent.student.className || '未分配班级'}</Tag>
                    <Tag>{selectedStudent.student.username}</Tag>
                    <Tag color="cyan">加入于 {dayjs(selectedStudent.student.createdAt).format('YYYY-MM-DD')}</Tag>
                  </div>
                </div>
              </div>

              {/* 左右布局主体 */}
              <div className="detail-body-layout">
                {/* 左侧：统计和图表 */}
                <div className="detail-left">
                  {/* 统计卡片 */}
                  <div className="detail-stats">
                    <div className="detail-stat-card dialogue">
                      <div className="stat-header">
                        <Activity size={20} />
                        <span>对话练习</span>
                      </div>
                      <div className="stat-body">
                        <div className="stat-main">
                          <span className="number">{selectedStudent.stats.practiceCount}</span>
                          <span className="unit">次</span>
                        </div>
                        <div className="stat-details">
                          <div className="detail-row">
                            <span className="label">平均分</span>
                            <span className="value">{selectedStudent.stats.practiceAvg} 分</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">趋势</span>
                            <span className={`value trend ${selectedStudent.stats.practiceImprovement >= 0 ? 'up' : 'down'}`}>
                              {selectedStudent.stats.practiceImprovement > 0 ? '+' : ''}{selectedStudent.stats.practiceImprovement}
                              {selectedStudent.stats.practiceImprovement >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="detail-stat-card readAloud">
                      <div className="stat-header">
                        <Award size={20} />
                        <span>跟读练习</span>
                      </div>
                      <div className="stat-body">
                        <div className="stat-main">
                          <span className="number">{selectedStudent.stats.readAloudCount}</span>
                          <span className="unit">次</span>
                        </div>
                        <div className="stat-details">
                          <div className="detail-row">
                            <span className="label">平均分</span>
                            <span className="value">{selectedStudent.stats.readAloudAvg} 分</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">趋势</span>
                            <span className={`value trend ${selectedStudent.stats.readAloudImprovement >= 0 ? 'up' : 'down'}`}>
                              {selectedStudent.stats.readAloudImprovement > 0 ? '+' : ''}{selectedStudent.stats.readAloudImprovement}
                              {selectedStudent.stats.readAloudImprovement >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 成绩趋势图 */}
                  <div className="detail-chart">
                    <h3><Calendar size={18} /> 成绩趋势</h3>
                    {(selectedStudent.practiceProgress.length > 0 || selectedStudent.readAloudProgress.length > 0) ? (
                      <ReactECharts option={studentChartOption} style={{ height: 220 }} />
                    ) : (
                      <div className="empty-chart">暂无练习记录</div>
                    )}
                  </div>
                </div>

                {/* 右侧：AI 学习总结 */}
                <div className="detail-right">
                  <div className="detail-ai-summary">
                    <div className="ai-header">
                      <h3><Sparkles size={18} /> AI 学习总结</h3>
                      <Button
                        type="primary"
                        size="small"
                        icon={<Sparkles size={14} />}
                        loading={summaryLoading}
                        onClick={() => loadStudentSummary(selectedStudent.student.id)}
                      >
                        {studentSummary ? '刷新' : '生成'}
                      </Button>
                    </div>

                    {summaryLoading && (
                      <div className="ai-loading">
                        <Spin tip="AI 分析中..." />
                      </div>
                    )}

                    {!summaryLoading && !studentSummary && (
                      <div className="ai-empty">
                        <Sparkles size={32} />
                        <p>点击上方按钮生成 AI 学习总结</p>
                      </div>
                    )}

                    {studentSummary && !summaryLoading && (
                      <div className="ai-content">
                        <div className="ai-overall">
                          <p>{studentSummary.overallComment}</p>
                        </div>

                        <div className="ai-card strengths">
                          <div className="ai-card-header">
                            <ThumbsUp size={14} />
                            <span>优点</span>
                          </div>
                          <ul>
                            {studentSummary.strengths.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="ai-card weaknesses">
                          <div className="ai-card-header">
                            <AlertCircle size={14} />
                            <span>待改进</span>
                          </div>
                          <ul>
                            {studentSummary.weaknesses.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>

                        {studentSummary.suggestions && studentSummary.suggestions.length > 0 && (
                          <div className="ai-card suggestions">
                            <div className="ai-card-header">
                              <Lightbulb size={14} />
                              <span>学习建议</span>
                            </div>
                            <ul>
                              {studentSummary.suggestions.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Spin>
        )}
      </Modal>
    </div>
  )
}

