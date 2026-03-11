import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Eye, ArrowLeft, Trash2, Upload, Download, Key, UserPlus } from 'lucide-react'
import { Input, Table, Button, Card, Space, Breadcrumb, Popconfirm, message, Modal, Form, Alert } from 'antd'
import { useRequest } from 'ahooks'
import type { ColumnsType } from 'antd/es/table'
import * as XLSX from 'xlsx'
import { adminApi, type Student, type Class } from '../../api'
import StudentDetailModal from '../../components/StudentDetailModal'
import './StudentsPage.scss'

const { Search } = Input

interface ImportStudent {
  studentNo: string  // 学号
  name: string
  password: string
  seatNo?: number
}

export default function ClassStudentsPage() {
  const { classId } = useParams<{ classId: string }>()
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null)
  const [currentClass, setCurrentClass] = useState<Class | null>(null)
  const limit = 10

  // 导入相关
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [importData, setImportData] = useState<ImportStudent[]>([])
  const [importing, setImporting] = useState(false)

  // 修改密码相关
  const [passwordModalVisible, setPasswordModalVisible] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [passwordForm] = Form.useForm()

  // 编辑学生信息相关
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editForm] = Form.useForm()

  // 添加学生相关
  const [addModalVisible, setAddModalVisible] = useState(false)
  const [addForm] = Form.useForm()
  const [adding, setAdding] = useState(false)

  // 获取班级信息
  const { data: classesData } = useRequest(adminApi.getClasses)

  useEffect(() => {
    if (classesData?.classes && classId) {
      const cls = classesData.classes.find(c => c.id === parseInt(classId))
      setCurrentClass(cls || null)
    }
  }, [classesData, classId])

  useEffect(() => {
    loadStudents()
  }, [page, classId, search])

  const loadStudents = async () => {
    if (!classId) return
    setIsLoading(true)
    try {
      const data = await adminApi.getStudents({
        page,
        limit,
        search: search || undefined,
        classId: parseInt(classId),
      })
      setStudents(data.students)
      setTotal(data.total)
    } catch (err) {
      console.error('Failed to load students:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1)
    // 不需要手动调用 loadStudents，useEffect 会在 search 变化时自动触发
  }

  const handleDeleteStudent = async (id: number) => {
    try {
      await adminApi.deleteStudent(id)
      message.success('学生已删除，相关练习记录已清理')
      loadStudents()
    } catch (err: any) {
      message.error(err?.response?.data?.message || '删除失败')
    }
  }

  // 下载 Excel 模板
  const downloadTemplate = () => {
    const template = [
      { 序号: 1, 学号: 'student001', 姓名: '张三', 密码: '123456' },
      { 序号: 2, 学号: 'student002', 姓名: '李四', 密码: '123456' },
    ]
    const ws = XLSX.utils.json_to_sheet(template)
    ws['!cols'] = [{ wch: 8 }, { wch: 15 }, { wch: 10 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '学生导入模板')
    XLSX.writeFile(wb, `学生导入模板_${currentClass?.name || '班级'}.xlsx`)
  }

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        // 使用 defval 确保空单元格有默认值，raw:false 确保数字转为字符串
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '', raw: false })

        console.log('Excel 原始数据:', json) // 调试用

        // 转换数据格式，支持多种列名格式
        const students: ImportStudent[] = json.map((row, index) => {
          // 获取列值，支持多种可能的列名
          const studentNo = String(row['学号'] || row['studentNo'] || row['username'] || row['Username'] || row['账号'] || '').trim()
          const name = String(row['姓名'] || row['name'] || row['Name'] || row['名字'] || '').trim()
          const password = String(row['密码'] || row['password'] || row['Password'] || '123456').trim()
          const seatNoStr = String(row['序号'] || row['座位号'] || row['seatNo'] || row['SeatNo'] || '').trim()
          const seatNo = seatNoStr ? parseInt(seatNoStr) : undefined

          console.log(`第${index + 1}行:`, { studentNo, name, password, seatNo }) // 调试用

          return { studentNo, name, password, seatNo: isNaN(seatNo as number) ? undefined : seatNo }
        }).filter(s => s.studentNo && s.name)

        if (students.length === 0) {
          message.error('未找到有效的学生数据，请检查 Excel 列名是否为：学号、姓名、密码')
          return
        }

        setImportData(students)
        setImportModalVisible(true)
      } catch (err) {
        console.error('Excel 解析错误:', err)
        message.error('Excel 解析失败，请检查文件格式')
      }
    }
    reader.readAsArrayBuffer(file)
    // 清空 input 以便重复选择同一文件
    e.target.value = ''
  }

  // 执行导入
  const handleImport = async () => {
    if (!classId || importData.length === 0) return
    setImporting(true)
    try {
      console.log('准备导入数据:', importData) // 调试用
      const result = await adminApi.batchImportStudents({
        students: importData,
        classId: parseInt(classId),
      })
      console.log('导入结果:', result) // 调试用

      if (result.created > 0) {
        let msg = `成功导入 ${result.created} 名学生`
        if (result.duplicates.length > 0) {
          msg += `（${result.duplicates.join(', ')} 已存在被跳过）`
        }
        message.success(msg)
      } else if (result.duplicates.length > 0) {
        message.warning(`所有学号都已存在：${result.duplicates.join(', ')}`)
      } else {
        message.warning('没有有效数据可导入')
      }

      setImportModalVisible(false)
      setImportData([])
      loadStudents()
    } catch (err: any) {
      console.error('导入失败:', err)
      message.error(err?.response?.data?.message || '导入失败')
    } finally {
      setImporting(false)
    }
  }

  // 打开修改密码弹窗
  const openPasswordModal = (student: Student) => {
    setEditingStudent(student)
    passwordForm.resetFields()
    setPasswordModalVisible(true)
  }

  // 提交修改密码
  const handleUpdatePassword = async () => {
    if (!editingStudent) return
    try {
      const values = await passwordForm.validateFields()
      await adminApi.updateStudentPassword(editingStudent.id, values.password)
      message.success('密码修改成功')
      setPasswordModalVisible(false)
    } catch (err: any) {
      if (err?.response?.data?.message) {
        message.error(err.response.data.message)
      }
    }
  }

  // 打开编辑学生信息弹窗
  const openEditModal = (student: Student) => {
    setEditingStudent(student)
    editForm.setFieldsValue({
      name: student.name,
      seatNo: student.seatNo || undefined,
    })
    setEditModalVisible(true)
  }

  // 提交编辑学生信息
  const handleUpdateStudent = async () => {
    if (!editingStudent) return
    try {
      const values = await editForm.validateFields()
      await adminApi.updateStudent(editingStudent.id, {
        name: values.name,
        seatNo: values.seatNo ? parseInt(values.seatNo) : null,
      })
      message.success('更新成功')
      setEditModalVisible(false)
      loadStudents()
    } catch (err: any) {
      if (err?.response?.data?.message) {
        message.error(err.response.data.message)
      }
    }
  }

  // 添加单个学生
  const handleAddStudent = async () => {
    if (!classId) return
    try {
      const values = await addForm.validateFields()
      setAdding(true)

      const result = await adminApi.batchImportStudents({
        students: [{
          studentNo: values.studentNo,
          name: values.name,
          password: values.password || '123456',
          seatNo: values.seatNo ? parseInt(values.seatNo) : undefined,
        }],
        classId: parseInt(classId),
      })

      if (result.created > 0) {
        message.success('学生添加成功')
        setAddModalVisible(false)
        addForm.resetFields()
        loadStudents()
      } else if (result.duplicates.length > 0) {
        message.error(`学号 ${result.duplicates[0]} 已存在`)
      } else {
        message.error('添加失败')
      }
    } catch (err: any) {
      if (err?.response?.data?.message) {
        message.error(err.response.data.message)
      }
    } finally {
      setAdding(false)
    }
  }

  const columns: ColumnsType<Student> = [
    {
      title: '序号',
      dataIndex: 'seatNo',
      key: 'seatNo',
      width: 70,
      render: (seatNo) => seatNo || '-',
    },
    { title: '学号', dataIndex: 'studentNo', key: 'studentNo' },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (name) => <span className="student-name">{name}</span>,
    },
    {
      title: '对话练习',
      dataIndex: 'practiceCount',
      key: 'practiceCount',
      render: (count) => `${count || 0} 次`,
    },
    {
      title: '跟读练习',
      dataIndex: 'readAloudCount',
      key: 'readAloudCount',
      render: (count) => `${count || 0} 次`,
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date) => new Date(date).toLocaleDateString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<Eye size={16} />} onClick={() => setSelectedStudent(record.id)}>
            查看
          </Button>
          <Button type="link" onClick={() => openEditModal(record)}>
            编辑
          </Button>
          <Button type="link" icon={<Key size={16} />} onClick={() => openPasswordModal(record)}>
            改密
          </Button>
          <Popconfirm
            title="确定删除该学生吗？"
            description={
              <span style={{ color: '#ff4d4f' }}>
                该学生的所有练习记录也会被删除，此操作不可恢复！
              </span>
            }
            onConfirm={() => handleDeleteStudent(record.id)}
            okText="确定删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger icon={<Trash2 size={16} />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="class-students-page">
      <div className="page-header">
        <div className="header-left">
          <Button type="text" icon={<ArrowLeft size={18} />} onClick={() => navigate('/classes')}>
            返回班级列表
          </Button>
          <Breadcrumb
            items={[
              { title: <a onClick={() => navigate('/classes')}>班级管理</a> },
              { title: currentClass?.name || '加载中...' },
              { title: '学生管理' },
            ]}
          />
        </div>
      </div>

      <Card
        title={
          <Space>
            <span>{currentClass?.name || '班级'}</span>
            <span style={{ fontSize: 14, color: '#666', fontWeight: 'normal' }}>
              （{currentClass?.grade}）
            </span>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<Download size={16} />} onClick={downloadTemplate}>
              下载模板
            </Button>
            <Button icon={<Upload size={16} />} onClick={() => fileInputRef.current?.click()}>
              批量导入
            </Button>
            <Button type="primary" icon={<UserPlus size={16} />} onClick={() => { addForm.resetFields(); setAddModalVisible(true) }}>
              添加学生
            </Button>
            <Search
              placeholder="搜索学生姓名、学号..."
              allowClear
              style={{ width: 240 }}
              onSearch={handleSearch}
              enterButton
            />
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={students}
          rowKey="id"
          loading={isLoading}
          pagination={{
            current: page,
            pageSize: limit,
            total,
            showTotal: (total) => `共 ${total} 名学生`,
            showSizeChanger: false,
            onChange: (p) => setPage(p),
          }}
        />
      </Card>

      {/* 隐藏的文件输入 */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".xlsx,.xls"
        onChange={handleFileSelect}
      />

      {/* 导入预览弹窗 */}
      <Modal
        title="导入学生预览"
        open={importModalVisible}
        onOk={handleImport}
        onCancel={() => { setImportModalVisible(false); setImportData([]) }}
        okText={`确认导入 ${importData.length} 名学生`}
        cancelText="取消"
        confirmLoading={importing}
        width={600}
      >
        <Alert
          message="请确认以下学生信息"
          description="学号已存在的学生将被自动跳过"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Table
          dataSource={importData}
          rowKey="studentNo"
          size="small"
          pagination={{ pageSize: 5 }}
          columns={[
            { title: '序号', dataIndex: 'seatNo', key: 'seatNo', render: (v) => v || '-' },
            { title: '学号', dataIndex: 'studentNo', key: 'studentNo' },
            { title: '姓名', dataIndex: 'name', key: 'name' },
            { title: '密码', dataIndex: 'password', key: 'password', render: () => '******' },
          ]}
        />
      </Modal>

      {/* 修改密码弹窗 */}
      <Modal
        title={`修改密码 - ${editingStudent?.name}`}
        open={passwordModalVisible}
        onOk={handleUpdatePassword}
        onCancel={() => setPasswordModalVisible(false)}
        okText="确认修改"
        cancelText="取消"
      >
        <Form form={passwordForm} layout="vertical">
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码长度至少6位' },
            ]}
          >
            <Input.Password placeholder="请输入新密码（至少6位）" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑学生信息弹窗 */}
      <Modal
        title={`编辑学生 - ${editingStudent?.name}`}
        open={editModalVisible}
        onOk={handleUpdateStudent}
        onCancel={() => setEditModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="seatNo"
            label="座位号/序号"
          >
            <Input type="number" placeholder="请输入座位号（用于班级内排序）" min={1} />
          </Form.Item>
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加学生弹窗 */}
      <Modal
        title="添加学生"
        open={addModalVisible}
        onOk={handleAddStudent}
        onCancel={() => setAddModalVisible(false)}
        okText="添加"
        cancelText="取消"
        confirmLoading={adding}
      >
        <Form form={addForm} layout="vertical" initialValues={{ password: '123456' }}>
          <Form.Item
            name="studentNo"
            label="学号"
            rules={[{ required: true, message: '请输入学号' }]}
          >
            <Input placeholder="请输入学号" />
          </Form.Item>
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item
            name="seatNo"
            label="座位号/序号"
            tooltip="可选，用于班级内排序"
          >
            <Input type="number" placeholder="可选" min={1} />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            tooltip="默认密码 123456"
          >
            <Input.Password placeholder="默认 123456" />
          </Form.Item>
        </Form>
      </Modal>

      {selectedStudent && (
        <StudentDetailModal studentId={selectedStudent} onClose={() => setSelectedStudent(null)} />
      )}
    </div>
  )
}

