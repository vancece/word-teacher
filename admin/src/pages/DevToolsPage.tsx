import { useState, useRef, useEffect } from 'react'
import { Card, Select, Input, Button, Table, Tag, Space, Descriptions, Typography, message } from 'antd'
import {
  PlayCircleOutlined, CopyOutlined, ClearOutlined,
  ApiOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { apiClient } from '../api/client'
import './DevToolsPage.scss'

const { TextArea } = Input
const { Text } = Typography

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

export default function DevToolsPage() {
  const [tools, setTools] = useState<ToolDef[]>([])
  const [selectedTool, setSelectedTool] = useState<string>('')
  const [argsJson, setArgsJson] = useState('{}')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<string>('')
  const [testLogs, setTestLogs] = useState<ExecutionLog[]>([])
  const logIdRef = useRef(0)

  useEffect(() => {
    apiClient.get('/admin/assistant/tools').then((data: any) => {
      setTools(data || [])
    }).catch(() => {})
  }, [])

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
    <div className="devtools-page">
      <div className="devtools-header">
        <div className="header-title">
          <ThunderboltOutlined />
          <span>开发调试</span>
        </div>
        <div className="header-desc">MCP 工具测试台 — 直接调用 AI 专家的底层工具，用于开发调试</div>
      </div>

      <div className="devtools-content">
        <div className="test-layout">
          <div className="test-left">
            <Card title={<><ApiOutlined style={{ marginRight: 8 }} />选择工具</>} size="small">
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
                {testResult || '选择工具并点击"执行"查看结果...'}
              </pre>
            </Card>
          </div>
        </div>
        {testLogs.length > 0 && (
          <Card title="执行历史" size="small" style={{ marginTop: 16 }}>
            <Table
              dataSource={testLogs}
              columns={logColumns}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ y: 240 }}
            />
          </Card>
        )}
      </div>
    </div>
  )
}
