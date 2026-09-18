import { folderName, relTime } from './blocks'
import type { SessionInfo } from '../../preload/index.d'

export default function Sidebar({
  sessions,
  cwd,
  sessionId,
  filter,
  onFilter,
  onSelect,
  onNew,
  onOpenProject
}: {
  sessions: SessionInfo[]
  cwd: string
  sessionId: string | null
  filter: string
  onFilter: (value: string) => void
  onSelect: (session: SessionInfo) => void
  onNew: () => void
  onOpenProject: () => void
}) {
  const q = filter.trim().toLowerCase()
  const visible = sessions.filter((s) => {
    if (!q) return true
    return `${s.title ?? ''} ${s.cwd ?? ''} ${s.sessionId}`.toLowerCase().includes(q)
  })
  const current = visible.filter((s) => s.cwd === cwd)
  const others = visible.filter((s) => s.cwd !== cwd)

  const renderList = (items: SessionInfo[]) =>
    items.map((session) => (
      <button
        key={session.sessionId}
        className={`session ${session.sessionId === sessionId ? 'active' : ''}`}
        onClick={() => onSelect(session)}
      >
        <span className="session-title">{session.title || '未命名会话'}</span>
        <span className="session-meta">
          {folderName(session.cwd ?? '')} · {relTime(session.updatedAt)}
        </span>
      </button>
    ))

  return (
    <aside className="sidebar">
      <div className="sidebar-actions">
        <button className="btn primary" onClick={onNew}>
          新会话
        </button>
        <button className="btn" onClick={onOpenProject}>
          打开项目
        </button>
      </div>
      <input
        className="search"
        placeholder="搜索会话"
        value={filter}
        onChange={(e) => onFilter(e.target.value)}
      />
      <div className="session-group">
        <div className="group-label">当前项目</div>
        {current.length ? renderList(current) : <div className="muted">此目录还没有会话</div>}
      </div>
      {others.length ? (
        <div className="session-group">
          <div className="group-label">其他项目</div>
          {renderList(others)}
        </div>
      ) : null}
    </aside>
  )
}
