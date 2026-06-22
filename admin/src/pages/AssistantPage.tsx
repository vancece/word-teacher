import { useState, useRef, useCallback, useEffect } from 'react'
import { Avatar, Card, Select, Input, Button, Table, Tag, Space, Descriptions, Collapse, Typography, message } from 'antd'
import {
  UserOutlined,
  MessageOutlined, ThunderboltOutlined, BookOutlined,
  QuestionCircleOutlined, KeyOutlined, FileExcelOutlined,
  PlayCircleOutlined, CopyOutlined, ClearOutlined, ToolOutlined,
} from '@ant-design/icons'
import { Bubble, Sender, ThoughtChain } from '@ant-design/x'
import Markdown from '@ant-design/x-markdown'
import ReactECharts from 'echarts-for-react'
import { useAuth } from '../contexts/AuthContext'
import { apiClient } from '../api/client'
import './AssistantPage.scss'

const { TextArea } = Input
const { Text } = Typography

interface ChatMessage {
  key: string
  role: 'user' | 'ai'
  content: string
  toolCalls?: ToolCallInfo[]
}

interface ToolCallInfo {
  id: string
  name: string
  args?: string
  result?: string
  status: 'loading' | 'success' | 'error'
}

interface ToolDef {
  name: string
  description: string
  inputSchema: {
    type: string
    properties: Record<string, any>
    required?: string[]
  }
}

interface ExecutionLog {
  id: number
  toolName: string
  args: string
  result: string
  status: 'success' | 'error'
  duration: number
  timestamp: string
}

// 工具名称中文映射
const TOOL_NAME_MAP: Record<string, string> = {
  searchKnowledge: '搜索知识库',
  queryStudents: '查询学生',
  queryLearningRecords: '查询学习记录',
  queryDatabase: '数据库查询',
  classAnalysis: '班级分析',
  resetStudentPassword: '重置密码',
  contentManage: '内容管理',
  createStudent: '创建学生',
  createTeacher: '创建教师',
  getStudentSummary: '生成学习报告',
}

// AI 头像 SVG（简洁的星光图标）
const AiAvatarIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
  </svg>
)

export default function AssistantPage() {
  const { isAdmin } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [conversationId] = useState<number | undefined>()
  const msgIdRef = useRef(0)
  const genMsgId = () => `msg-${++msgIdRef.current}`

  // MCP 测试状态（仅管理员）
  const [tools, setTools] = useState<ToolDef[]>([])
  const [selectedTool, setSelectedTool] = useState<string>('')
  const [argsJson, setArgsJson] = useState('{}')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<string>('')
  const [testLogs, setTestLogs] = useState<ExecutionLog[]>([])
  const logIdRef = useRef(0)

  useEffect(() => {
    if (isAdmin) {
      apiClient.get('/admin/assistant/tools').then((data: any) => {
        setTools(data || [])
      }).catch(() => {})
    }
  }, [isAdmin])

  const handleToolSelect = (toolName: string) => {
    setSelectedTool(toolName)
    const tool = tools.find(t => t.name === toolName)
    if (tool) {
      const template: Record<string, any> = {}
      for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
        if (schema.type === 'number') template[key] = null
        else if (schema.type === 'boolean') template[key] = false
        else if (schema.enum) template[key] = schema.enum[0]
        else template[key] = ''
      }
      setArgsJson(JSON.stringify(template, null, 2))
    }
    setTestResult('')
  }

  const executeTool = async () => {
    if (!selectedTool) {
      message.warning('请先选择一个工具')
      return
    }
    let parsedArgs: any
    try {
      parsedArgs = JSON.parse(argsJson)
    } catch {
      message.error('参数 JSON 格式错误')
      return
    }
    const cleanArgs: Record<string, any> = {}
    for (const [k, v] of Object.entries(parsedArgs)) {
      if (v !== null && v !== '' && v !== undefined) cleanArgs[k] = v
    }
    setTestLoading(true)
    const startTime = Date.now()
    try {
      const data = await apiClient.post('/admin/assistant/test-tool', {
        toolName: selectedTool,
        args: cleanArgs,
      }) as any
      const duration = Date.now() - startTime
      const resultStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      setTestResult(resultStr)
      setTestLogs(prev => [{
        id: ++logIdRef.current,
        toolName: selectedTool,
        args: JSON.stringify(cleanArgs),
        result: resultStr.slice(0, 200) + (resultStr.length > 200 ? '...' : ''),
        status: 'success',
        duration,
        timestamp: new Date().toLocaleTimeString('zh-CN'),
      }, ...prev])
    } catch (err: any) {
      const duration = Date.now() - startTime
      const errMsg = err.message || '执行失败'
      setTestResult(`❌ 错误: ${errMsg}`)
      setTestLogs(prev => [{
        id: ++logIdRef.current,
        toolName: selectedTool,
        args: JSON.stringify(cleanArgs),
        result: errMsg,
        status: 'error',
        duration,
        timestamp: new Date().toLocaleTimeString('zh-CN'),
      }, ...prev])
    } finally {
      setTestLoading(false)
    }
  }

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || loading) return

    const userMsg: ChatMessage = { key: genMsgId(), role: 'user', content: question }
    const aiMsgKey = genMsgId()
    const aiMsg: ChatMessage = { key: aiMsgKey, role: 'ai', content: '', toolCalls: [] }

    setMessages(prev => [...prev, userMsg, aiMsg])
    setLoading(true)

    try {
      const token = localStorage.getItem('admin_token')
      const isProd = import.meta.env.PROD
      const baseURL = isProd ? '/teacher-admin/api' : '/api'

      const response = await fetch(`${baseURL}/admin/assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ question, conversationId }),
      })

      if (!response.ok) throw new Error('请求失败')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      let currentToolCalls: ToolCallInfo[] = []

      if (reader) {
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6))

              if (data.type === 'text') {
                assistantContent += data.content
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  updated[updated.length - 1] = { ...last, content: assistantContent }
                  return updated
                })
              } else if (data.type === 'tool_start') {
                currentToolCalls = [...currentToolCalls, {
                  id: data.toolCallId,
                  name: data.toolName,
                  args: data.args,
                  status: 'loading',
                }]
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  updated[updated.length - 1] = { ...last, toolCalls: [...currentToolCalls] }
                  return updated
                })
              } else if (data.type === 'tool_end') {
                currentToolCalls = currentToolCalls.map(tc =>
                  tc.id === data.toolCallId
                    ? { ...tc, status: 'success' as const, result: data.result }
                    : tc
                )
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  updated[updated.length - 1] = { ...last, toolCalls: [...currentToolCalls] }
                  return updated
                })
              }
            } catch {}
          }
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        updated[updated.length - 1] = { ...last, content: '抱歉，AI 服务暂时不可用，请稍后再试。' }
        return updated
      })
    } finally {
      setLoading(false)
    }
  }, [loading, conversationId])

  const quickQuestions = [
    { icon: <MessageOutlined />, text: '查看各班学生数量' },
    { icon: <ThunderboltOutlined />, text: '分析一班本周学习情况' },
    { icon: <FileExcelOutlined />, text: '导出全部学生成绩' },
    { icon: <FileExcelOutlined />, text: '导出本月学习记录' },
    { icon: <BookOutlined />, text: '哪些学生最近没练习？' },
    { icon: <QuestionCircleOutlined />, text: '怎么创建跟读场景？' },
    { icon: <KeyOutlined />, text: '重置学生张三的密码' },
  ]

  // 解析 AI 回复中的图表 JSON 块
  const parseCharts = (content: string): { text: string; charts: any[] } => {
    const charts: any[] = []
    const text = content.replace(/```chart\n([\s\S]*?)```/g, (_, json) => {
      try {
        const chartData = JSON.parse(json.trim())
        charts.push(chartData)
      } catch {}
      return ''
    })
    return { text: text.trim(), charts }
  }

  // 构造 ECharts option
  const buildChartOption = (chartData: any) => {
    const { type, title, xAxis, series } = chartData
    const colors = ['#667eea', '#f5576c', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6']

    if (type === 'pie') {
      return {
        title: { text: title, left: 'center', textStyle: { fontSize: 14 } },
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        series: [{
          type: 'pie',
          radius: ['35%', '65%'],
          data: (series?.[0]?.data || []).map((val: number, i: number) => ({
            value: val,
            name: xAxis?.[i] || `项${i + 1}`,
            itemStyle: { color: colors[i % colors.length] },
          })),
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: true, fontSize: 12 },
        }],
      }
    }

    return {
      title: { text: title, left: 'center', textStyle: { fontSize: 14 } },
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      xAxis: { type: 'category', data: xAxis || [] },
      yAxis: { type: 'value' },
      series: (series || []).map((s: any, i: number) => ({
        name: s.name,
        type: type === 'line' ? 'line' : 'bar',
        data: s.data,
        smooth: type === 'line',
        itemStyle: { color: colors[i % colors.length] },
        ...(type === 'bar' ? { barMaxWidth: 40, borderRadius: [4, 4, 0, 0] } : {}),
      })),
    }
  }

  // 处理下载链接：带上 JWT token 下载文件
  const renderToolChain = (toolCalls: ToolCallInfo[]) => {
    if (!toolCalls || toolCalls.length === 0) return null
    return (
      <ThoughtChain
        items={toolCalls.map(tc => ({
          key: tc.id,
          title: TOOL_NAME_MAP[tc.name] || tc.name,
          description: tc.status === 'loading' ? '执行中...' : '已完成',
          status: tc.status === 'loading' ? 'loading' : 'success',
        }))}
        style={{ marginBottom: 8, fontSize: 12 }}
      />
    )
  }

  const selectedToolDef = tools.find(t => t.name === selectedTool)

  const logColumns = [
    { title: '时间', dataIndex: 'timestamp', width: 90 },
    { title: '工具', dataIndex: 'toolName', width: 160, render: (name: string) => <Tag color="blue">{name}</Tag> },
    { title: '参数', dataIndex: 'args', width: 200, ellipsis: true },
    { title: '结果', dataIndex: 'result', ellipsis: true },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (s: string) => <Tag color={s === 'success' ? 'green' : 'red'}>{s === 'success' ? '成功' : '失败'}</Tag>,
    },
    { title: '耗时', dataIndex: 'duration', width: 80, render: (ms: number) => `${ms}ms` },
  ]

  return (
    <div className="assistant-page">
      <div className="assistant-header">
        <div className="header-title">
          <div className="title-icon"><AiAvatarIcon /></div>
          <span>AI 助手</span>
        </div>
      </div>

      <div className="chat-container">
        {messages.length === 0 ? (
          <div className="welcome-area">
            <div className="welcome-icon-wrapper">
              <AiAvatarIcon />
            </div>
            <h3>你好，有什么可以帮你？</h3>
            <p>我可以帮你查数据、管理学生、分析班级情况、导出 Excel 报表，也可以解答系统使用问题</p>
            <div className="quick-questions">
              {quickQuestions.map((q, i) => (
                <div
                  key={i}
                  className="quick-card"
                  onClick={() => sendMessage(q.text)}
                >
                  <span className="quick-card-icon">{q.icon}</span>
                  <span className="quick-card-text">{q.text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages-area">
            <Bubble.List
              autoScroll
              role={{
                user: {
                  placement: 'end',
                  avatar: <Avatar icon={<UserOutlined />} size={36} style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }} />,
                  variant: 'filled',
                  shape: 'round',
                  style: { maxWidth: '70%' },
                },
                ai: {
                  placement: 'start',
                  avatar: <Avatar icon={<AiAvatarIcon />} size={36} style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }} />,
                  variant: 'outlined',
                  shape: 'round',
                  style: { maxWidth: '75%' },
                },
              }}
              items={messages.map(msg => ({
                key: msg.key,
                role: msg.role === 'user' ? 'user' as const : 'ai' as const,
                content: msg.content,
                loading: msg.role === 'ai' && !msg.content && loading && msg.key === messages[messages.length - 1]?.key && (!msg.toolCalls || msg.toolCalls.length === 0),
                ...(msg.role === 'ai' ? {
                  contentRender: (_content: any) => {
                    const rawContent = msg.content || ''
                    const { text, charts } = parseCharts(rawContent)

                    const cleanedText = text.replace(/\n{3,}/g, '\n\n').trim()

                    return (
                      <div>
                        {msg.toolCalls && msg.toolCalls.length > 0 && renderToolChain(msg.toolCalls)}
                        {cleanedText ? <Markdown>{cleanedText}</Markdown> : null}
                        {charts.map((chartData, i) => (
                          <div key={i} className="ai-chart-wrapper">
                            <ReactECharts
                              option={buildChartOption(chartData)}
                              style={{ height: 280, marginTop: 12 }}
                              opts={{ renderer: 'svg' }}
                            />
                          </div>
                        ))}
                      </div>
                    )
                  },
                } : {}),
              }))}
            />
          </div>
        )}

        <div className="input-area">
          <Sender
            placeholder="输入你的问题...（Enter 发送，Shift+Enter 换行）"
            loading={loading}
            onSubmit={sendMessage}
            onCancel={() => {}}
          />
        </div>
      </div>

      {isAdmin && (
        <div className="mcp-test-section">
          <Collapse
            items={[{
              key: 'mcp',
              label: <span><ToolOutlined style={{ marginRight: 8 }} />MCP 工具测试台</span>,
              children: (
                <div className="mcp-test-content">
                  <div className="test-layout">
                    <div className="test-left">
                      <Card title="选择工具" size="small">
                        <Select
                          placeholder="选择要测试的工具"
                          value={selectedTool || undefined}
                          onChange={handleToolSelect}
                          style={{ width: '100%' }}
                          showSearch
                          optionFilterProp="label"
                          options={tools.map(t => ({
                            value: t.name,
                            label: t.name,
                            title: t.description,
                          }))}
                        />
                        {selectedToolDef && (
                          <Descriptions column={1} size="small" style={{ marginTop: 12 }} bordered>
                            <Descriptions.Item label="描述">{selectedToolDef.description}</Descriptions.Item>
                            <Descriptions.Item label="必填">
                              {selectedToolDef.inputSchema.required?.join(', ') || '无'}
                            </Descriptions.Item>
                            <Descriptions.Item label="参数">
                              {Object.entries(selectedToolDef.inputSchema.properties).map(([key, schema]: [string, any]) => (
                                <div key={key} style={{ marginBottom: 4 }}>
                                  <Tag>{key}</Tag>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    ({schema.type}{schema.enum ? `: ${schema.enum.join('|')}` : ''})
                                    {schema.description && ` - ${schema.description}`}
                                  </Text>
                                </div>
                              ))}
                            </Descriptions.Item>
                          </Descriptions>
                        )}
                      </Card>
                      <Card title="参数 (JSON)" size="small" style={{ marginTop: 12 }}>
                        <TextArea
                          value={argsJson}
                          onChange={e => setArgsJson(e.target.value)}
                          rows={6}
                          style={{ fontFamily: 'monospace', fontSize: 13 }}
                          placeholder='{"key": "value"}'
                        />
                        <Space style={{ marginTop: 8 }}>
                          <Button type="primary" icon={<PlayCircleOutlined />} onClick={executeTool} loading={testLoading}>
                            执行
                          </Button>
                          <Button icon={<ClearOutlined />} onClick={() => { setTestResult(''); setArgsJson('{}') }}>
                            清空
                          </Button>
                        </Space>
                      </Card>
                    </div>
                    <div className="test-right">
                      <Card
                        title="执行结果"
                        size="small"
                        extra={testResult && (
                          <Button size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(testResult); message.success('已复制') }}>
                            复制
                          </Button>
                        )}
                      >
                        <pre className="result-pre">
                          {testResult || '点击"执行"查看结果...'}
                        </pre>
                      </Card>
                    </div>
                  </div>
                  {testLogs.length > 0 && (
                    <Card title="执行历史" size="small" style={{ marginTop: 12 }}>
                      <Table
                        dataSource={testLogs}
                        columns={logColumns}
                        rowKey="id"
                        size="small"
                        pagination={false}
                        scroll={{ y: 200 }}
                      />
                    </Card>
                  )}
                </div>
              ),
            }]}
          />
        </div>
      )}
    </div>
  )
}
