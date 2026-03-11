import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, Modal, Form, Input, Select, Popconfirm, message, Space, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined } from '@ant-design/icons'
import { useRequest } from 'ahooks'
import type { ColumnsType } from 'antd/es/table'
import { adminApi, type Class, type Teacher } from '../../api'
import { useAuth } from '../../contexts/AuthContext'
import AdminTip from '../../components/AdminTip'
import './index.scss'

export default function ClassesPage() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [form] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingClass, setEditingClass] = useState<Class | null>(null)
  const [teachers, setTeachers] = useState<Teacher[]>([])

  // 获取班级列表
  const { data, loading, refresh } = useRequest(adminApi.getClasses)
  const classes = data?.classes || []

  // 管理员获取教师列表用于分配
  useEffect(() => {
    if (isAdmin) {
      adminApi.getTeachers().then(setTeachers).catch(() => {})
    }
  }, [isAdmin])

  // 打开新增/编辑弹窗
  const openModal = (cls?: Class) => {
    if (cls) {
      setEditingClass(cls)
      form.setFieldsValue({
        ...cls,
        teacherIds: cls.teachers?.map(t => t.id) || [],
      })
    } else {
      setEditingClass(null)
      form.resetFields()
    }
    setModalOpen(true)
  }

  // 保存班级
  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      if (editingClass) {
        await adminApi.updateClass(editingClass.id, values)
        message.success('班级更新成功')
      } else {
        await adminApi.createClass(values)
        message.success('班级创建成功')
      }
      setModalOpen(false)
      refresh()
    } catch (err: any) {
      if (err?.response?.data?.message) {
        message.error(err.response.data.message)
      }
    }
  }

  // 删除班级
  const handleDelete = async (id: number) => {
    try {
      await adminApi.deleteClass(id)
      message.success('班级删除成功')
      refresh()
    } catch (err: any) {
      message.error(err?.response?.data?.message || '删除失败')
    }
  }

  // 查看班级学生
  const viewStudents = (classId: number) => {
    navigate(`/classes/${classId}/students`)
  }

  const gradeOptions = [
    { label: '一年级', value: '一年级' },
    { label: '二年级', value: '二年级' },
    { label: '三年级', value: '三年级' },
    { label: '四年级', value: '四年级' },
    { label: '五年级', value: '五年级' },
    { label: '六年级', value: '六年级' },
    { label: '七年级', value: '七年级' },
    { label: '八年级', value: '八年级' },
    { label: '九年级', value: '九年级' },
    { label: '高一', value: '高一' },
    { label: '高二', value: '高二' },
    { label: '高三', value: '高三' },
  ]

  const columns: ColumnsType<Class> = [
    { title: '班级名称', dataIndex: 'name', key: 'name' },
    { title: '年级', dataIndex: 'grade', key: 'grade' },
    { title: '班级描述', dataIndex: 'description', key: 'description', render: (v) => v || '-' },
    {
      title: '所属教师',
      dataIndex: 'teachers',
      key: 'teachers',
      render: (teachers: Class['teachers']) => (
        teachers && teachers.length > 0
          ? teachers.map(t => <Tag key={t.id} color="blue">{t.name}</Tag>)
          : <span style={{ color: '#999' }}>-</span>
      ),
    },
    {
      title: '学生人数',
      dataIndex: 'studentCount',
      key: 'studentCount',
      render: (count, record) => (
        <Button type="link" onClick={() => viewStudents(record.id)}>
          {count} 人
        </Button>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v) => new Date(v).toLocaleDateString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="primary" icon={<TeamOutlined />} onClick={() => viewStudents(record.id)}>
            学生管理
          </Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => openModal(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定删除该班级吗？"
            description={
              record.studentCount > 0 ? (
                <span style={{ color: '#ff4d4f' }}>
                  该班级有 {record.studentCount} 名学生，删除后所有学生及其练习记录将被一并删除！
                </span>
              ) : undefined
            }
            onConfirm={() => handleDelete(record.id)}
            okText="确定删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="classes-page">
      <div className="page-header">
        <h1>班级管理</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          新增班级
        </Button>
      </div>

      <AdminTip
        adminMessage="您可以查看和管理所有班级，并分配教师"
        teacherMessage="您只能查看和管理自己负责的班级"
        showForTeacher
      />

      <Table
        columns={columns}
        dataSource={classes}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 个班级` }}
      />

      <Modal
        title={editingClass ? '编辑班级' : '新增班级'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="班级名称" rules={[{ required: true, message: '请输入班级名称' }]}>
            <Input placeholder="如：三年级1班" />
          </Form.Item>
          <Form.Item name="grade" label="年级" rules={[{ required: true, message: '请选择年级' }]}>
            <Select placeholder="请选择年级" options={gradeOptions} />
          </Form.Item>
          <Form.Item name="description" label="班级描述">
            <Input.TextArea placeholder="可选，班级备注信息" rows={3} />
          </Form.Item>
          {isAdmin && (
            <Form.Item name="teacherIds" label="所属教师">
              <Select
                mode="multiple"
                placeholder="选择负责该班级的教师（可多选）"
                options={teachers.map(t => ({ label: t.name, value: t.id }))}
                allowClear
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  )
}

