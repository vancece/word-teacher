import { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, Switch, Popconfirm, message, Tag, Card, Space } from 'antd'
import { Plus, Trash2, Edit2, Shield, User } from 'lucide-react'
import { adminApi, type Teacher } from '../api'
import './TeachersPage.scss'

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadTeachers()
  }, [])

  const loadTeachers = async () => {
    try {
      setLoading(true)
      const data = await adminApi.getTeachers()
      setTeachers(data)
    } catch (err) {
      message.error('加载教师列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingTeacher(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher)
    form.setFieldsValue({
      name: teacher.name,
      isAdmin: teacher.isAdmin,
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await adminApi.deleteTeacher(id)
      message.success('删除成功')
      loadTeachers()
    } catch (err: any) {
      message.error(err.response?.data?.message || '删除失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingTeacher) {
        await adminApi.updateTeacher(editingTeacher.id, {
          name: values.name,
          isAdmin: values.isAdmin,
          password: values.password || undefined,
        })
        message.success('更新成功')
      } else {
        await adminApi.createTeacher({
          username: values.username,
          password: values.password,
          name: values.name,
          isAdmin: values.isAdmin || false,
        })
        message.success('创建成功')
      }
      setModalVisible(false)
      loadTeachers()
    } catch (err: any) {
      message.error(err.response?.data?.message || '操作失败')
    }
  }

  const columns = [
    { title: '账号', dataIndex: 'username', key: 'username' },
    { title: '姓名', dataIndex: 'name', key: 'name' },
    {
      title: '角色',
      key: 'isAdmin',
      render: (_: any, record: Teacher) => (
        record.isAdmin
          ? <Tag color="gold" icon={<Shield size={12} />}>管理员</Tag>
          : <Tag color="blue" icon={<User size={12} />}>普通教师</Tag>
      ),
    },
    {
      title: '负责班级',
      key: 'classes',
      render: (_: any, record: Teacher) => (
        record.classes?.length > 0
          ? record.classes.map(c => <Tag key={c.id}>{c.name}</Tag>)
          : <span style={{ color: '#999' }}>-</span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: Teacher) => (
        <Space>
          <Button size="small" icon={<Edit2 size={14} />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除此教师?" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<Trash2 size={14} />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="teachers-page">
      <Card
        title="教师管理"
        extra={<Button type="primary" icon={<Plus size={16} />} onClick={handleAdd}>添加教师</Button>}
      >
        <Table columns={columns} dataSource={teachers} rowKey="id" loading={loading} pagination={false} />
      </Card>

      <Modal
        title={editingTeacher ? '编辑教师' : '添加教师'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          {!editingTeacher && (
            <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
              <Input placeholder="用于登录的账号" />
            </Form.Item>
          )}
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="教师姓名" />
          </Form.Item>
          <Form.Item
            name="password"
            label={editingTeacher ? '新密码' : '密码'}
            rules={editingTeacher ? [] : [{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder={editingTeacher ? '不修改请留空' : '登录密码'} />
          </Form.Item>
          <Form.Item name="isAdmin" label="管理员权限" valuePropName="checked">
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

