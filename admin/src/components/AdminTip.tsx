import { Alert } from 'antd'
import { Shield } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface AdminTipProps {
  /** 管理员看到的提示信息 */
  adminMessage: string
  /** 普通教师看到的提示信息（可选） */
  teacherMessage?: string
  /** 是否总是显示（默认只有管理员显示） */
  showForTeacher?: boolean
}

/**
 * 管理员权限提示组件
 * 在页面顶部显示当前用户的权限范围说明
 */
export default function AdminTip({ adminMessage, teacherMessage, showForTeacher = false }: AdminTipProps) {
  const { isAdmin } = useAuth()

  // 普通教师且不需要显示时，返回 null
  if (!isAdmin && !showForTeacher) return null

  if (isAdmin) {
    return (
      <Alert
        message={
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Shield size={14} />
            <strong>管理员权限</strong>
            <span style={{ color: '#666', marginLeft: 4 }}>{adminMessage}</span>
          </span>
        }
        type="warning"
        showIcon={false}
        style={{ marginBottom: 16, background: '#fffbe6', border: '1px solid #ffe58f' }}
      />
    )
  }

  // 普通教师的提示
  if (teacherMessage) {
    return (
      <Alert
        message={teacherMessage}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
    )
  }

  return null
}

