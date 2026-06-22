import { useState, useRef, useCallback, useEffect } from 'react'
import { Avatar, Button, Tooltip } from 'antd'
import {
  UserOutlined,
  TeamOutlined, BarChartOutlined, FileExcelOutlined,
  SearchOutlined, DatabaseOutlined, PlusOutlined,
} from '@ant-design/icons'
import { Bubble, Sender, ThoughtChain } from '@ant-design/x'
import Markdown from '@ant-design/x-markdown'
import ReactECharts from 'echarts-for-react'
import './AssistantPage.scss'

interface ChatMessage {
  key: string
  role: 'user' | 'ai'
  content: string
  thinking?: string
  toolCalls?: ToolCallInfo[]
}

interface ToolCallInfo {
  id: string
  name: string
  args?: string
  result?: string
  status: 'loading' | 'success' | 'error'
}

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

// 小妹专家头像路径
const XIAOMEI_AVATAR = `${import.meta.env.BASE_URL}xiaomei-avatar.jpg`

// 能力分类
const CAPABILITY_GROUPS = [
  {
    title: '数据查询',
    icon: <SearchOutlined />,
    color: '#667eea',
    questions: [
      '三年级1班今天有多少人完成了跟读作业？',
      '最近7天没有练习的学生有哪些？',
    ],
  },
  {
    title: '数据分析',
    icon: <BarChartOutlined />,
    color: '#f5576c',
    questions: [
      '对比各班本周的平均分和完成率',
      '三年级2班上周和这周的成绩趋势',
    ],
  },
  {
    title: '导出报表',
    icon: <FileExcelOutlined />,
    color: '#10b981',
    questions: [
      '导出全部学生的游戏成绩排名',
      '导出3年级1班今天已完成的学习记录',
    ],
  },
  {
    title: '操作管理',
    icon: <TeamOutlined />,
    color: '#f59e0b',
    questions: [
      '帮我重置学生张三的登录密码',
      '怎么创建一个新的跟读场景？',
    ],
  },
]

const STORAGE_KEY = 'assistant_chat_history'

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function saveHistory(msgs: ChatMessage[]) {
  try {
    // 只保存有内容的消息，并剔除 thinking 字段（不需要持久化，也不需要回传给大模型）
    const toSave = msgs
      .filter(m => m.content.trim() !== '')
      .map(({ thinking, ...rest }) => rest)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch {}
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory)
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const msgIdRef = useRef(0)
  const senderRef = useRef<HTMLDivElement>(null)
  const genMsgId = () => `msg-${++msgIdRef.current}`

  // 消息变化时持久化到 localStorage
  useEffect(() => {
    saveHistory(messages)
  }, [messages])

  const handleNewChat = useCallback(() => {
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || loading) return
    setInputValue('')

    const userMsg: ChatMessage = { key: genMsgId(), role: 'user', content: question }
    const aiMsgKey = genMsgId()
    const aiMsg: ChatMessage = { key: aiMsgKey, role: 'ai', content: '', toolCalls: [] }

    // 从已有消息中提取最近 3 轮对话作为历史（排除当前正在创建的消息）
    const history: { role: 'user' | 'assistant'; content: string }[] = []
    const finishedMessages = messages.filter(m => m.content.trim() !== '')
    const recentPairs = finishedMessages.slice(-6) // 最多 3 轮 = 6 条消息
    for (const m of recentPairs) {
      history.push({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })
    }

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
        body: JSON.stringify({ question, history }),
      })

      if (!response.ok) throw new Error('请求失败')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      let thinkingContent = ''
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

              if (data.type === 'thinking') {
                thinkingContent += data.content
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  updated[updated.length - 1] = { ...last, thinking: thinkingContent }
                  return updated
                })
              } else if (data.type === 'text') {
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
  }, [loading, messages])

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

  return (
    <div className="assistant-page">
      <div className="chat-container">
        {messages.length === 0 ? (
          <div className="welcome-area">
            <div className="welcome-hero">
              <div className="hero-glow" />
              <div className="welcome-icon-wrapper">
                <img src={XIAOMEI_AVATAR} alt="小妹专家" />
              </div>
              <h2>Hi，我是牛马小妹</h2>
              <p className="hero-subtitle">
                查数据、出报表、搞分析、答问题 — 脏活累活我全包，你对我动嘴就行，<em>就是不要找本人。</em>
              </p>
            </div>

            <div className="capability-grid">
              {CAPABILITY_GROUPS.map((group, gi) => (
                <div key={gi} className="capability-card" style={{ '--accent': group.color } as React.CSSProperties}>
                  <div className="capability-header">
                    <span className="capability-icon">{group.icon}</span>
                    <span className="capability-title">{group.title}</span>
                  </div>
                  <div className="capability-questions">
                    {group.questions.map((q, qi) => (
                      <button
                        key={qi}
                        className="question-btn"
                        onClick={() => { setInputValue(q); setTimeout(() => senderRef.current?.querySelector('textarea')?.focus(), 0) }}
                      >
                        <span>{q}</span>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="welcome-footer">
              <DatabaseOutlined style={{ fontSize: 13, opacity: 0.5 }} />
              <span>由 LanceDB 向量知识库 + MCP 工具协议驱动</span>
            </div>
          </div>
        ) : (
          <div className="messages-area">
            <div className="messages-toolbar">
              <Tooltip title="新建会话">
                <Button
                  type="text"
                  icon={<PlusOutlined />}
                  onClick={handleNewChat}
                  className="new-chat-btn"
                >
                  新建会话
                </Button>
              </Tooltip>
            </div>
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
                  avatar: <Avatar src={XIAOMEI_AVATAR} size={36} />,
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
                        {msg.thinking && (
                          <details className="thinking-block">
                            <summary>💭 思考过程</summary>
                            <div className="thinking-content">{msg.thinking}</div>
                          </details>
                        )}
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

        <div className="input-area" ref={senderRef}>
          <Sender
            value={inputValue}
            onChange={setInputValue}
            placeholder="输入你的问题...（Enter 发送，Shift+Enter 换行）"
            loading={loading}
            onSubmit={sendMessage}
            onCancel={() => {}}
          />
        </div>
      </div>
    </div>
  )
}
