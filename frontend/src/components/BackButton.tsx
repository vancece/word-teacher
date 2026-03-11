import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import './BackButton.scss'

interface Props {
  to?: string  // 目标路径，默认返回首页
  label?: string  // 按钮文字，默认"返回"
}

export default function BackButton({ to = '/', label = '返回' }: Props) {
  const navigate = useNavigate()

  const handleClick = () => {
    navigate(to)
  }

  return (
    <button className="back-button" onClick={handleClick}>
      <ArrowLeft size={16} />
      <span>{label}</span>
    </button>
  )
}

