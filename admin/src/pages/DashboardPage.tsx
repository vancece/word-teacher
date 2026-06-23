import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Mic2, MessageSquare, TrendingUp, Calendar, Award, School, Bot, Activity, CheckCircle, AlertTriangle, XCircle, UserCheck } from 'lucide-react'
import { Card, Spin, Tag, Tooltip } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useRequest } from 'ahooks'
import { adminApi } from '../api'

import './DashboardPage.scss'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: stats, loading: isLoading } = useRequest(
    () => adminApi.getDashboardStats()
  )

  // 系统状态 30 秒自动刷新
  const { data: systemStatus, loading: statusLoading } = useRequest(
    () => adminApi.getSystemStatus(),
    { pollingInterval: 30000 }
  )

  // 饼图配置
  const pieChartOption = useMemo(() => ({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
      data: [
        { value: stats?.totalReadAlouds || 0, name: '跟读练习', itemStyle: { color: '#10b981' } },
        { value: stats?.totalPractices || 0, name: '对话练习', itemStyle: { color: '#8b5cf6' } },
      ],
    }],
  }), [stats])

  // 进度条图
  const gaugeOption = useMemo(() => ({
    series: [{
      type: 'gauge',
      startAngle: 180,
      endAngle: 0,
      min: 0,
      max: 100,
      splitNumber: 5,
      pointer: { show: false },
      progress: {
        show: true,
        overlap: false,
        roundCap: true,
        clip: false,
        itemStyle: { color: '#10b981' },
      },
      axisLine: { lineStyle: { width: 20, color: [[1, '#e5e7eb']] } },
      splitLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      detail: {
        fontSize: 24,
        fontWeight: 'bold',
        formatter: '{value}分',
        offsetCenter: [0, '-20%'],
        color: '#1e293b',
      },
      data: [{ value: Math.round(stats?.averageScore || 0) }],
    }],
  }), [stats])

  const statCards = [
    { icon: Users, label: '学生总数', value: stats?.totalStudents || 0, color: '#3b82f6' },
    { icon: Mic2, label: '跟读练习', value: stats?.totalReadAlouds || 0, color: '#10b981' },
    { icon: MessageSquare, label: '对话练习', value: stats?.totalPractices || 0, color: '#8b5cf6' },
    { icon: TrendingUp, label: '平均分', value: stats?.averageScore?.toFixed(1) || '0', color: '#f59e0b' },
    { icon: Calendar, label: '今日跟读', value: stats?.todayReadAlouds || 0, color: '#ec4899' },
    { icon: Award, label: '完成跟读', value: stats?.completedReadAlouds || 0, color: '#06b6d4' },
  ]

  // 系统健康状态渲染辅助
  const getStatusInfo = (status?: string) => {
    switch (status) {
      case 'healthy': return { color: '#10b981', icon: CheckCircle, text: '正常', tagColor: 'success' }
      case 'degraded': return { color: '#f59e0b', icon: AlertTriangle, text: '降级', tagColor: 'warning' }
      default: return { color: '#ef4444', icon: XCircle, text: '异常', tagColor: 'error' }
    }
  }

  const getCheckStatus = (check?: { status: string; latency?: number; error?: string }) => {
    if (!check) return { color: '#94a3b8', text: '未知' }
    if (check.status === 'ok') return { color: '#10b981', text: `正常${check.latency ? ` (${check.latency}ms)` : ''}` }
    if (check.status === 'degraded') return { color: '#f59e0b', text: '降级' }
    return { color: '#ef4444', text: check.error || '不可用' }
  }

  return (
    <Spin spinning={isLoading}>
      <div className="dashboard-page">
        <div className="page-header">
          <h1>仪表盘</h1>
          <p>欢迎使用 Echo Kid 管理后台</p>
        </div>

        {/* 系统状态栏 */}
        <div className="system-status-bar">
          <Card className="system-status-card" loading={statusLoading && !systemStatus}>
            <div className="status-content">
              <div className="status-main">
                <Activity size={18} className="status-icon" />
                <span className="status-title">系统状态</span>
                {systemStatus && (
                  <Tag color={getStatusInfo(systemStatus.health?.status).tagColor as any}>
                    {getStatusInfo(systemStatus.health?.status).text}
                  </Tag>
                )}
              </div>
              <div className="status-details">
                {systemStatus?.health?.checks && (
                  <>
                    <Tooltip title={getCheckStatus(systemStatus.health.checks.database).text}>
                      <span className="status-check" style={{ color: getCheckStatus(systemStatus.health.checks.database).color }}>
                        <span className="status-dot" style={{ background: getCheckStatus(systemStatus.health.checks.database).color }} />
                        数据库
                      </span>
                    </Tooltip>
                    <Tooltip title={getCheckStatus(systemStatus.health.checks.agent).text}>
                      <span className="status-check" style={{ color: getCheckStatus(systemStatus.health.checks.agent).color }}>
                        <span className="status-dot" style={{ background: getCheckStatus(systemStatus.health.checks.agent).color }} />
                        AI 助手
                      </span>
                    </Tooltip>
                  </>
                )}
                <span className="status-divider" />
                <span className="status-online">
                  <UserCheck size={14} />
                  <span>{systemStatus?.activeStudents ?? '-'} 人在线</span>
                </span>
                {systemStatus?.health?.uptime != null && (
                  <span className="status-uptime">
                    运行 {formatUptime(systemStatus.health.uptime)}
                  </span>
                )}
              </div>
            </div>
          </Card>
        </div>

        <div className="stats-grid">
          {statCards.map((card, index) => (
            <Card key={index} className="stat-card" hoverable>
              <div className="stat-icon" style={{ background: `${card.color}15`, color: card.color }}>
                <card.icon size={24} />
              </div>
              <div className="stat-info">
                <span className="stat-value">{card.value}</span>
                <span className="stat-label">{card.label}</span>
              </div>
            </Card>
          ))}
        </div>

        <div className="dashboard-sections">
          <Card className="section-card">
            <h3>练习分布</h3>
            <ReactECharts option={pieChartOption} style={{ height: 220 }} />
          </Card>

          <Card className="section-card">
            <h3>平均成绩</h3>
            <ReactECharts option={gaugeOption} style={{ height: 180 }} />
            <div className="info-list">
              <div className="info-item">
                <span className="info-label">教师总数</span>
                <span className="info-value">{stats?.totalTeachers || 0}</span>
              </div>
              <div className="info-item">
                <span className="info-label">今日对话练习</span>
                <span className="info-value">{stats?.todayPractices || 0}</span>
              </div>
            </div>
          </Card>

          <Card className="section-card quick-actions-card">
            <h3>快速操作</h3>
            <div className="quick-actions">
              <div className="action-btn" onClick={() => navigate('/classes')}>
                <School size={20} />
                <span>班级管理</span>
              </div>
              <div className="action-btn" onClick={() => navigate('/read-aloud-records')}>
                <Mic2 size={20} />
                <span>跟读记录</span>
              </div>
              <div className="action-btn" onClick={() => navigate('/scenes')}>
                <MessageSquare size={20} />
                <span>场景管理</span>
              </div>
              <div className="action-btn" onClick={() => navigate('/progress')}>
                <TrendingUp size={20} />
                <span>进步情况</span>
              </div>
              <div className="action-btn ai-btn" onClick={() => navigate('/assistant')}>
                <Bot size={20} />
                <span>AI 助手</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Spin>
  )
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天${hours}小时`
  if (hours > 0) return `${hours}小时${minutes}分钟`
  return `${minutes}分钟`
}

