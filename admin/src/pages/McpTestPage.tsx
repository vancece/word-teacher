import { useState, useRef, useEffect } from 'react'
import { Card, Select, Input, Button, Table, Tag, Space, message, Descriptions, Typography } from 'antd'
import { PlayCircleOutlined, CopyOutlined, ClearOutlined } from '@ant-design/icons'
import { apiClient } from '../api/client'

import './McpTestPage.scss'

const { TextArea } = Input
const { Text, Title } = Typography

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

export default function McpTestPage() {
  const [tools, setTools] = useState<ToolDef[]>([])
  const [selectedTool, setSelectedTool] = useState<string>('')
  const [argsJson, setArgsJson] = useState('{}')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string>('')
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const logIdRef = useRef(0)

  // 加载工具列表
  useEffect(() => {
    loadTools()
  }, [])

  const loadTools = async () => {
    try {
      const data = await apiClient.get('/admin/assistant/tools') as any
      setTools(data || [])
    } catch (err: any) {
      message.error('加载工具列表失败: ' + err.message)
    }
  }

  // 选择工具时，自动生成参数模板
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
    setResult('')
  }

  // 执行工具
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

    // 移除空值参数
    const cleanArgs: Record<string, any> = {}
    for (const [k, v] of Object.entries(parsedArgs)) {
      if (v !== null && v !== '' && v !== undefined) {
        cleanArgs[k] = v
      }
    }

    setLoading(true)
    const startTime = Date.now()

    try {
      const data = await apiClient.post('/admin/assistant/test-tool', {
        toolName: selectedTool,
        args: cleanArgs,
      }) as any

      const duration = Date.now() - startTime
      const resultStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      setResult(resultStr)

      const log: ExecutionLog = {
        id: ++logIdRef.current,
        toolName: selectedTool,
        args: JSON.stringify(cleanArgs),
        result: resultStr.slice(0, 200) + (resultStr.length > 200 ? '...' : ''),
        status: 'success',
        duration,
        timestamp: new Date().toLocaleTimeString('zh-CN'),
      }
      setLogs(prev => [log, ...prev])
    } catch (err: any) {
      const duration = Date.now() - startTime
      const errMsg = err.message || '执行失败'
      setResult(`❌ 错误: ${errMsg}`)

      const log: ExecutionLog = {
        id: ++logIdRef.current,
        toolName: selectedTool,
        args: JSON.stringify(cleanArgs),
        result: errMsg,
        status: 'error',
        duration,
        timestamp: new Date().toLocaleTimeString('zh-CN'),
      }
      setLogs(prev => [log, ...prev])
    } finally {
      setLoading(false)
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
    <div className="mcp-test-page">
      <Title level={4}>🔧 MCP 工具测试台</Title>
      <Text type="secondary">逐个测试已注册的 MCP 工具，验证参数和返回值是否正确</Text>

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
                label: `${t.name}`,
                title: t.description,
              }))}
            />

            {selectedToolDef && (
              <Descriptions column={1} size="small" style={{ marginTop: 12 }} bordered>
                <Descriptions.Item label="描述">{selectedToolDef.description}</Descriptions.Item>
                <Descriptions.Item label="必填参数">
                  {selectedToolDef.inputSchema.required?.join(', ') || '无'}
                </Descriptions.Item>
                <Descriptions.Item label="参数列表">
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
              rows={8}
              style={{ fontFamily: 'monospace', fontSize: 13 }}
              placeholder='{"key": "value"}'
            />
            <Space style={{ marginTop: 8 }}>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={executeTool}
                loading={loading}
              >
                执行
              </Button>
              <Button
                icon={<ClearOutlined />}
                onClick={() => { setResult(''); setArgsJson('{}') }}
              >
                清空
              </Button>
            </Space>
          </Card>
        </div>

        <div className="test-right">
          <Card
            title="执行结果"
            size="small"
            extra={
              result && (
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => { navigator.clipboard.writeText(result); message.success('已复制') }}
                >
                  复制
                </Button>
              )
            }
          >
            <pre className="result-pre">
              {result || '点击"执行"查看结果...'}
            </pre>
          </Card>
        </div>
      </div>

      <Card title="执行历史" size="small" style={{ marginTop: 16 }}>
        <Table
          dataSource={logs}
          columns={logColumns}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ y: 240 }}
        />
      </Card>
    </div>
  )
}
