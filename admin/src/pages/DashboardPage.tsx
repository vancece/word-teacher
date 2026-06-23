import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Mic2, MessageSquare, TrendingUp, Calendar, Award, Activity, CheckCircle, AlertTriangle, XCircle, UserCheck, Wifi, Bell, Wallet, AudioLines } from 'lucide-react'
import { Card, Spin, Tag, Tooltip } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useRequest } from 'ahooks'
import { adminApi, dashboardApi } from '../api'

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

  // 近 7 天趋势
  const { data: trendsData } = useRequest(() => dashboardApi.getTrends())

  // 服务器资源 — 10 秒自动轮询
  const { data: serverMetrics } = useRequest(
    () => dashboardApi.getServerMetrics(),
    { pollingInterval: 10000 }
  )

  // 最近异常
  const { data: errorsData } = useRequest(() => dashboardApi.getRecentErrors())



  // AI 连通性 — 30 秒自动轮询（不消耗 token，只是健康检查）
  const { data: aiTestResult } = useRequest(
    () => dashboardApi.testAiConnectivity(),
    { pollingInterval: 30000 }
  )

  // 阿里云账户余额 — 每 5 分钟刷新
  const { data: cloudBalance } = useRequest(
    () => dashboardApi.getCloudBalance(),
    { pollingInterval: 5 * 60 * 1000 }
  )

  // 讯飞 ISE 额度 — 每 1 分钟刷新
  const { data: iseQuota } = useRequest(
    () => dashboardApi.getIseQuota(),
    { pollingInterval: 60 * 1000 }
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

  // 趋势折线图配置
  const trendChartOption = useMemo(() => {
    const days = trendsData?.days || []
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, data: ['跟读', '对话', '单词游戏'] },
      grid: { left: 40, right: 20, top: 20, bottom: 40 },
      xAxis: {
        type: 'category',
        data: days.map(d => {
          const date = new Date(d.date)
          return `${date.getMonth() + 1}/${date.getDate()}`
        }),
        axisLabel: { fontSize: 11 },
      },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        { name: '跟读', type: 'line', smooth: true, data: days.map(d => d.readAloud), itemStyle: { color: '#10b981' } },
        { name: '对话', type: 'line', smooth: true, data: days.map(d => d.dialogue), itemStyle: { color: '#8b5cf6' } },
        { name: '单词游戏', type: 'line', smooth: true, data: days.map(d => d.wordGame), itemStyle: { color: '#f59e0b' } },
      ],
    }
  }, [trendsData])

  const statCards = [
    { icon: Users, label: '学生总数', value: stats?.totalStudents || 0, color: '#3b82f6', prompt: '请帮我总结一下当前的学生总数情况，包括各班级人数分布' },
    { icon: Mic2, label: '跟读练习', value: stats?.totalReadAlouds || 0, color: '#10b981', prompt: '请帮我分析一下跟读练习的总体情况，包括完成率和平均分' },
    { icon: MessageSquare, label: '对话练习', value: stats?.totalPractices || 0, color: '#8b5cf6', prompt: '请帮我分析一下对话练习的总体情况' },
    { icon: TrendingUp, label: '平均分', value: stats?.averageScore?.toFixed(1) || '0', color: '#f59e0b', prompt: '请帮我分析当前学生的平均分情况，哪些学生成绩较低需要关注？' },
    { icon: Calendar, label: '今日跟读', value: stats?.todayReadAlouds || 0, color: '#ec4899', prompt: '今天有多少学生完成了跟读练习？哪些学生还没有完成？' },
    { icon: Award, label: '完成跟读', value: stats?.completedReadAlouds || 0, color: '#06b6d4', prompt: '请帮我统计跟读完成情况，哪些学生完成得比较好？' },
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
                {aiTestResult?.services && (() => {
                  const minio = aiTestResult.services.find(s => s.name.includes('MinIO'))
                  if (!minio) return null
                  const ok = minio.status === 'ok'
                  return (
                    <Tooltip title={ok ? '正常' : minio.message}>
                      <span className="status-check" style={{ color: ok ? '#10b981' : '#ef4444' }}>
                        <span className="status-dot" style={{ background: ok ? '#10b981' : '#ef4444' }} />
                        MinIO
                      </span>
                    </Tooltip>
                  )
                })()}
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
            <Card
              key={index}
              className="stat-card"
              hoverable
              onClick={() => navigate('/assistant', { state: { prefillPrompt: card.prompt } })}
            >
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
          {/* 近 7 天趋势 */}
          <Card className="section-card section-card-wide">
            <h3><TrendingUp size={18} style={{ marginRight: 8 }} />近 7 天学习趋势</h3>
            {trendsData?.days?.length ? (
              <ReactECharts option={trendChartOption} style={{ height: 220 }} />
            ) : (
              <div className="empty-hint">暂无数据</div>
            )}
          </Card>

          {/* 练习分布 */}
          <Card className="section-card">
            <h3>练习分布</h3>
            <ReactECharts option={pieChartOption} style={{ height: 220 }} />
          </Card>

          {/* 平均成绩 */}
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

          {/* 最近异常 */}
          <Card className="section-card">
            <h3><Bell size={18} style={{ marginRight: 8 }} />最近异常</h3>
            {errorsData?.errors?.length ? (
              <div className="errors-list">
                {errorsData.errors.slice(0, 8).map((err, i) => (
                  <div key={i} className="error-item">
                    <Tag color={err.level === 'fatal' ? 'red' : 'orange'} className="error-tag">
                      {err.level}
                    </Tag>
                    <span className="error-module">[{err.module}]</span>
                    <span className="error-message">{err.message}</span>
                    <span className="error-time">{formatErrorTime(err.time)}</span>
                  </div>
                ))}
                {errorsData.total > 8 && (
                  <div className="errors-more" onClick={() => navigate('/logs')}>
                    查看全部 {errorsData.total} 条 →
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-hint success-hint">
                <CheckCircle size={16} />
                暂无异常，系统运行正常
              </div>
            )}
          </Card>

          {/* AI 连通性测试 */}
          <Card className="section-card">
            <h3><Wifi size={18} style={{ marginRight: 8 }} />AI 服务连通性</h3>
            {aiTestResult?.services ? (
              <div className="ai-services-list">
                {aiTestResult.services.map((svc, i) => (
                  <div key={i} className="ai-service-item">
                    <span className="ai-service-dot" style={{ background: svc.status === 'ok' ? '#10b981' : '#ef4444' }} />
                    <span className="ai-service-name">{svc.name}</span>
                    <span className="ai-service-status">
                      {svc.status === 'ok' ? (
                        <Tag color="success">{svc.latency}ms</Tag>
                      ) : (
                        <Tooltip title={svc.message}>
                          <Tag color="error">异常</Tag>
                        </Tooltip>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-hint">检测中...</div>
            )}
          </Card>

          {/* 阿里云账户余额 */}
          <Card className="section-card">
            <h3><Wallet size={18} style={{ marginRight: 8 }} />阿里云账户</h3>
            {cloudBalance ? (
              cloudBalance.available ? (
                <div className="cloud-balance">
                  <div className="balance-main">
                    <span className="balance-label">可用余额</span>
                    <span className="balance-amount">
                      ¥ {parseFloat(cloudBalance.availableAmount || '0').toFixed(2)}
                    </span>
                  </div>
                  <div className="balance-details">
                    <div className="balance-item">
                      <span className="balance-item-label">现金余额</span>
                      <span className="balance-item-value">¥ {parseFloat(cloudBalance.availableCashAmount || '0').toFixed(2)}</span>
                    </div>
                    <div className="balance-item">
                      <span className="balance-item-label">代金券</span>
                      <span className="balance-item-value">¥ {parseFloat(cloudBalance.creditAmount || '0').toFixed(2)}</span>
                    </div>
                  </div>
                  {parseFloat(cloudBalance.availableAmount || '0') < 50 && (
                    <Tag color="warning" style={{ marginTop: 8 }}>余额不足，请及时充值</Tag>
                  )}
                </div>
              ) : (
                <div className="empty-hint">
                  <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                  <span style={{ marginLeft: 4 }}>{cloudBalance.error || '查询失败'}</span>
                </div>
              )
            ) : (
              <div className="empty-hint">加载中...</div>
            )}
          </Card>

          {/* 讯飞 ISE 额度 */}
          <Card className="section-card">
            <h3><AudioLines size={18} style={{ marginRight: 8 }} />讯飞语音评测额度</h3>
            {iseQuota ? (
              <div className="ise-quota">
                <div className="ise-quota-summary">
                  <div className="ise-quota-main">
                    <span className="ise-quota-remaining">{iseQuota.remainingToday}</span>
                    <span className="ise-quota-total">/ {iseQuota.totalDailyQuota}</span>
                  </div>
                  <span className="ise-quota-label">今日剩余 / 每日总额度</span>
                  <div className="ise-quota-bar">
                    <div
                      className="ise-quota-bar-fill"
                      style={{
                        width: `${iseQuota.usagePercent}%`,
                        background: iseQuota.usagePercent > 80 ? '#ef4444' : iseQuota.usagePercent > 50 ? '#f59e0b' : '#10b981',
                      }}
                    />
                  </div>
                  <span className="ise-quota-percent">已用 {iseQuota.usagePercent}%</span>
                </div>
                <div className="ise-quota-details">
                  <div className="ise-quota-detail-item">
                    <span className="ise-quota-detail-label">启用账号</span>
                    <span className="ise-quota-detail-value">{iseQuota.enabledAccounts} / {iseQuota.totalAccounts}</span>
                  </div>
                  <div className="ise-quota-detail-item">
                    <span className="ise-quota-detail-label">已耗尽账号</span>
                    <span className="ise-quota-detail-value" style={{ color: iseQuota.exhaustedCount > 0 ? '#ef4444' : undefined }}>
                      {iseQuota.exhaustedCount}
                    </span>
                  </div>
                  <div className="ise-quota-detail-item">
                    <span className="ise-quota-detail-label">今日已用</span>
                    <span className="ise-quota-detail-value">{iseQuota.totalUsedToday}</span>
                  </div>
                  <div className="ise-quota-detail-item">
                    <span className="ise-quota-detail-label">累计总用量</span>
                    <span className="ise-quota-detail-value">{iseQuota.totalUsedAll.toLocaleString()}</span>
                  </div>
                </div>
                {iseQuota.exhaustedCount > 0 && (
                  <Tag color="error" style={{ marginTop: 8 }}>
                    {iseQuota.exhaustedCount} 个账号今日额度已耗尽
                  </Tag>
                )}
                {iseQuota.usagePercent > 80 && iseQuota.exhaustedCount === 0 && (
                  <Tag color="warning" style={{ marginTop: 8 }}>今日额度使用已超 80%</Tag>
                )}
              </div>
            ) : (
              <div className="empty-hint">加载中...</div>
            )}
          </Card>

          {/* 服务器资源 */}
          <Card className="section-card">
            <h3><Activity size={18} style={{ marginRight: 8 }} />服务器资源</h3>
            {serverMetrics ? (
              <div className="server-metrics">
                <div className="metric-item">
                  <div className="metric-header">
                    <span className="metric-label">CPU</span>
                    <span className="metric-value">{serverMetrics.cpu.usage.toFixed(1)}%</span>
                  </div>
                  <div className="metric-bar">
                    <div className="metric-bar-fill" style={{ width: `${serverMetrics.cpu.usage}%`, background: serverMetrics.cpu.usage > 80 ? '#ef4444' : '#10b981' }} />
                  </div>
                  <span className="metric-detail">{serverMetrics.cpu.cores} 核</span>
                </div>
                <div className="metric-item">
                  <div className="metric-header">
                    <span className="metric-label">内存</span>
                    <span className="metric-value">{serverMetrics.memory.usedPercent.toFixed(1)}%</span>
                  </div>
                  <div className="metric-bar">
                    <div className="metric-bar-fill" style={{ width: `${serverMetrics.memory.usedPercent}%`, background: serverMetrics.memory.usedPercent > 80 ? '#ef4444' : '#3b82f6' }} />
                  </div>
                  <span className="metric-detail">{serverMetrics.memory.used} / {serverMetrics.memory.total}</span>
                </div>
                <div className="metric-item">
                  <div className="metric-header">
                    <span className="metric-label">网络</span>
                  </div>
                  <div className="metric-network">
                    <span>↑ {serverMetrics.network.txRate}</span>
                    <span>↓ {serverMetrics.network.rxRate}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-hint">加载中...</div>
            )}
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

function formatErrorTime(time: string): string {
  if (!time) return ''
  try {
    const d = new Date(time)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch {
    return time
  }
}
