import { useState, useEffect } from 'react'
import { Button, Table, Modal, Form, Input, InputNumber, Switch, Tag, Popconfirm, message, Space, Tooltip } from 'antd'
import { Plus, RotateCcw, Trash2, Edit3, ShieldCheck } from 'lucide-react'
import { iseAccountsApi, type IseAccount } from '../api/admin'
import './IseAccountsPage.scss'

export default function IseAccountsPage() {
  const [accounts, setAccounts] = useState<IseAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<IseAccount | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const loadAccounts = async () => {
    setLoading(true)
    try {
      const data = await iseAccountsApi.getAll()
      setAccounts(data)
    } catch (err: any) {
      message.error('加载失败: ' + (err?.message || '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAccounts() }, [])

  const handleAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ dailyQuota: 500 })
    setModalOpen(true)
  }

  const handleEdit = (record: IseAccount) => {
    setEditing(record)
    form.setFieldsValue({
      appId: record.appId,
      apiKey: record.apiKey,
      apiSecret: '',  // 不回显密钥
      label: record.label,
      dailyQuota: record.dailyQuota,
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      if (editing) {
        // 编辑模式：如果 apiSecret 为空则不更新
        const data: any = { ...values }
        if (!data.apiSecret) delete data.apiSecret
        await iseAccountsApi.update(editing.id, data)
        message.success('已更新（凭证验证通过）')
      } else {
        await iseAccountsApi.create(values)
        message.success('已添加（凭证验证通过）')
      }

      setModalOpen(false)
      loadAccounts()
    } catch (err: any) {
      if (err?.errorFields) return  // 表单校验失败
      const errMsg = err?.message || '未知错误'
      if (errMsg.includes('凭证验证失败')) {
        message.error(errMsg, 5)
      } else {
        message.error('保存失败: ' + errMsg)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleVerify = async (record: IseAccount) => {
    const hide = message.loading('正在验证凭证...', 0)
    try {
      const result = await iseAccountsApi.verify(record.id)
      hide()
      if (result.valid) {
        message.success(`「${record.label}」凭证有效 ✓`)
      } else {
        message.error(`「${record.label}」凭证无效: ${result.error}`)
      }
    } catch (err: any) {
      hide()
      message.error('验证请求失败: ' + (err?.message || '未知错误'))
    }
  }

  const handleToggle = async (record: IseAccount) => {
    try {
      await iseAccountsApi.toggle(record.id)
      loadAccounts()
    } catch (err: any) {
      message.error('操作失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await iseAccountsApi.delete(id)
      message.success('已删除')
      loadAccounts()
    } catch (err: any) {
      message.error('删除失败')
    }
  }

  const handleResetDaily = async () => {
    try {
      await iseAccountsApi.resetDaily()
      message.success('已重置所有账号每日用量')
      loadAccounts()
    } catch (err: any) {
      message.error('重置失败')
    }
  }

  const columns = [
    {
      title: '备注',
      dataIndex: 'label',
      key: 'label',
      width: 120,
    },
    {
      title: 'AppID',
      dataIndex: 'appId',
      key: 'appId',
      width: 120,
    },
    {
      title: 'API Key',
      dataIndex: 'apiKey',
      key: 'apiKey',
      width: 160,
      render: (v: string) => (
        <Tooltip title={v}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v.slice(0, 8)}...</span>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_: any, record: IseAccount) => {
        if (!record.enabled) return <Tag color="default">已禁用</Tag>
        if (record.exhaustedAt) return <Tag color="red">已耗尽</Tag>
        return <Tag color="green">可用</Tag>
      },
    },
    {
      title: '今日用量',
      key: 'usage',
      width: 120,
      render: (_: any, record: IseAccount) => (
        <span>
          {record.usedToday} / {record.dailyQuota}
        </span>
      ),
    },
    {
      title: '累计调用',
      dataIndex: 'totalUsed',
      key: 'totalUsed',
      width: 90,
    },
    {
      title: '启用',
      key: 'enabled',
      width: 70,
      render: (_: any, record: IseAccount) => (
        <Switch
          checked={record.enabled}
          size="small"
          onChange={() => handleToggle(record)}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_: any, record: IseAccount) => (
        <Space size="small">
          <Tooltip title="验证凭证">
            <Button type="text" size="small" icon={<ShieldCheck size={14} />} onClick={() => handleVerify(record)} />
          </Tooltip>
          <Button type="text" size="small" icon={<Edit3 size={14} />} onClick={() => handleEdit(record)} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)} okText="删除" cancelText="取消">
            <Button type="text" size="small" danger icon={<Trash2 size={14} />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const totalAvailable = accounts.filter(a => a.enabled && !a.exhaustedAt).length
  const totalUsedToday = accounts.reduce((sum, a) => sum + a.usedToday, 0)

  return (
    <div className="ise-accounts-page">
      <div className="page-header">
        <div>
          <h2>讯飞 ISE 账号池</h2>
          <p className="subtitle">
            共 {accounts.length} 个账号，{totalAvailable} 个可用，今日已用 {totalUsedToday} 次
          </p>
        </div>
        <Space>
          <Popconfirm title="确定重置所有账号的每日用量？" onConfirm={handleResetDaily} okText="重置" cancelText="取消">
            <Button icon={<RotateCcw size={14} />}>重置每日用量</Button>
          </Popconfirm>
          <Button type="primary" icon={<Plus size={14} />} onClick={handleAdd}>
            添加账号
          </Button>
        </Space>
      </div>

      <Table
        dataSource={accounts}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="middle"
      />

      <Modal
        title={editing ? '编辑账号' : '添加账号'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="label" label="备注名称">
            <Input placeholder="如：张三的账号" />
          </Form.Item>
          <Form.Item name="appId" label="APPID" rules={[{ required: !editing, message: '必填' }]}>
            <Input placeholder="如：a4282bed" />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key" rules={[{ required: !editing, message: '必填' }]}>
            <Input placeholder="如：952289d06b122d8607d36155eb4a61b0" />
          </Form.Item>
          <Form.Item
            name="apiSecret"
            label="API Secret"
            rules={[{ required: !editing, message: '必填' }]}
            extra={editing ? '留空则不修改' : undefined}
          >
            <Input.Password placeholder={editing ? '留空不修改' : '如：MGQ2YjE5YzRiNGY0...'} />
          </Form.Item>
          <Form.Item name="dailyQuota" label="每日额度上限（仅展示参考）">
            <InputNumber min={1} max={100000} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
