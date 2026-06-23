import { useState } from 'react'
import { Card, Spin, Tag, Pagination } from 'antd'
import { useRequest } from 'ahooks'
import { dashboardApi } from '../api'
import type { GitCommit } from '../api/admin'

import './ChangelogPage.scss'

const COMMIT_TYPE_MAP: Record<string, { label: string; color: string }> = {
  feat: { label: 'feat', color: '#10b981' },
  fix: { label: 'fix', color: '#ef4444' },
  docs: { label: 'docs', color: '#3b82f6' },
  style: { label: 'style', color: '#a855f7' },
  refactor: { label: 'refactor', color: '#f59e0b' },
  perf: { label: 'perf', color: '#06b6d4' },
  test: { label: 'test', color: '#8b5cf6' },
  build: { label: 'build', color: '#64748b' },
  ci: { label: 'ci', color: '#6366f1' },
  chore: { label: 'chore', color: '#94a3b8' },
  revert: { label: 'revert', color: '#dc2626' },
}

function parseCommitType(message: string): { type: string | null; label: string; color: string; rest: string } {
  const match = message.match(/^(\w+)(\(.+?\))?[!:]?\s*(.*)$/)
  if (match) {
    const type = match[1].toLowerCase()
    const config = COMMIT_TYPE_MAP[type]
    if (config) {
      return { type, label: config.label, color: config.color, rest: match[3] || message }
    }
  }
  return { type: null, label: '', color: '', rest: message }
}

export default function ChangelogPage() {
  const [page, setPage] = useState(1)
  const pageSize = 30

  const { data, loading } = useRequest(
    () => dashboardApi.getChangelog(page, pageSize),
    { refreshDeps: [page] }
  )

  const commits = data?.commits || []
  const total = data?.total || 0

  // 按日期分组
  const grouped = commits.reduce<Record<string, GitCommit[]>>((acc, commit) => {
    const date = new Date(commit.date).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric'
    })
    if (!acc[date]) acc[date] = []
    acc[date].push(commit)
    return acc
  }, {})

  return (
    <Spin spinning={loading}>
      <div className="changelog-page">
        <div className="page-header">
          <h1>版本更新日志</h1>
          <p>基于 Git 提交记录，共 {total} 条提交</p>
        </div>

        <Card className="changelog-card">
          {Object.entries(grouped).map(([date, dayCommits]) => (
            <div key={date} className="changelog-day">
              <div className="day-header">{date}</div>
              <div className="day-commits">
                {dayCommits.map((commit, i) => {
                  const parsed = parseCommitType(commit.message)
                  return (
                    <div key={i} className="commit-item">
                      <div className="commit-dot" style={parsed.type ? { background: parsed.color } : undefined} />
                      <div className="commit-content">
                        <div className="commit-message-row">
                          {parsed.type && (
                            <Tag className="commit-type-tag" style={{ background: parsed.color, color: '#fff', border: 'none' }}>
                              {parsed.label}
                            </Tag>
                          )}
                          <span className="commit-message">{parsed.rest}</span>
                        </div>
                        <div className="commit-meta">
                          <Tag className="commit-hash">{commit.shortHash}</Tag>
                          <span className="commit-author">{commit.author}</span>
                          <span className="commit-time">
                            {new Date(commit.date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {commit.refs && <Tag color="blue" className="commit-ref">{commit.refs}</Tag>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {total > pageSize && (
            <div className="changelog-pagination">
              <Pagination
                current={page}
                total={total}
                pageSize={pageSize}
                onChange={setPage}
                showSizeChanger={false}
                showTotal={(t) => `共 ${t} 条提交`}
              />
            </div>
          )}
        </Card>
      </div>
    </Spin>
  )
}
