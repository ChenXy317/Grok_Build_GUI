import { useState } from 'react'
import { folderName, relTime, samePath } from './blocks'
import type { SessionInfo } from '../../preload/index.d'

export default function Sidebar({
  sessions,
  cwd,
  sessionId,
  recents,
  filter,
  collapsed,
  onFilter,
  onSelect,
  onNew,
  onOpenProject,
  onOpenRecent,
  onRename,
  onDelete,
  onToggle
}: {
  sessions: SessionInfo[]
  cwd: string
  sessionId: string | null
  recents: string[]
  filter: string
  collapsed: boolean
  onFilter: (value: string) => void
  onSelect: (session: SessionInfo) => void
  onNew: () => void
  onOpenProject: () => void
  onOpenRecent: (path: string) => void
  onRename: (session: SessionInfo, title: string) => void
  onDelete: (session: SessionInfo) => void
  onToggle: () => void
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; session: SessionInfo } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState('')

  if (collapsed) {
    return (
      <aside className="sidebar collapsed">
        <button className="icon-btn" title="展开侧栏" onClick={onToggle}>
          ›
        </button>
        <button className="icon-btn" title="新会话" onClick={onNew} disabled={!cwd}>
          +
        </button>
        <button className="icon-btn" title="打开项目" onClick={onOpenProject}>
          ⧉
        </button>
      </aside>
    )
  }

  const q = filter.trim().toLowerCase()
  const visible = sessions.filter((s) => {
    if (!q) return true
    return `${s.title ?? ''} ${s.cwd ?? ''} ${s.sessionId}`.toLowerCase().includes(q)
  })
  const current = visible.filter((s) => samePath(s.cwd, cwd))
  const others = visible.filter((s) => !samePath(s.cwd, cwd))
  const recentVisible = recents.filter((path) => !cwd || !samePath(path, cwd)).slice(0, 6)

  const renderList = (items: SessionInfo[]) =>
    items.map((session) => (
      <div key={session.sessionId} className="session-row">
        {editing === session.sessionId ? (
          <input
            className="search"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim()) onRename(session, title.trim())
              setEditing(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (title.trim()) onRename(session, title.trim())
                setEditing(null)
              }
              if (e.key === 'Escape') setEditing(null)
            }}
          />
        ) : (
          <button
            className={`session ${session.sessionId === sessionId ? 'active' : ''}`}
            onClick={() => onSelect(session)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, session })
            }}
          >
            <span className="session-title">{session.title || '未命名会话'}</span>
            <span className="session-meta">
              {folderName(session.cwd ?? '')} · {relTime(session.updatedAt)}
            </span>
          </button>
        )}
      </div>
    ))

  return (
    <aside className="sidebar" onClick={() => setMenu(null)}>
      <div className="sidebar-actions">
        <button className="btn primary" onClick={onNew} disabled={!cwd}>
          新会话
        </button>
        <button className="btn" onClick={onOpenProject}>
          打开项目
        </button>
        <button className="icon-btn" title="收起侧栏" onClick={onToggle}>
          ‹
        </button>
      </div>
      <input
        className="search"
        placeholder="搜索会话"
        value={filter}
        onChange={(e) => onFilter(e.target.value)}
      />
      {recentVisible.length ? (
        <div className="session-group">
          <div className="group-label">最近项目</div>
          {recentVisible.map((path) => (
            <button key={path} className="session" title={path} onClick={() => onOpenRecent(path)}>
              <span className="session-title">{folderName(path)}</span>
              <span className="session-meta">{path}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="session-group">
        <div className="group-label">当前项目</div>
        {cwd ? current.length ? renderList(current) : <div className="muted">此目录还没有会话</div> : <div className="muted">打开或拖入一个项目</div>}
      </div>
      {others.length ? (
        <div className="session-group">
          <div className="group-label">其他项目</div>
          {renderList(others)}
        </div>
      ) : null}
      {menu ? (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setTitle(menu.session.title || '')
              setEditing(menu.session.sessionId)
              setMenu(null)
            }}
          >
            重命名
          </button>
          {menu.session.cwd ? (
            <button
              onClick={() => {
                void window.grok.openPath(menu.session.cwd!)
                setMenu(null)
              }}
            >
              打开目录
            </button>
          ) : null}
          <button
            onClick={() => {
              void window.grok.clipboardWrite(menu.session.sessionId)
              setMenu(null)
            }}
          >
            复制会话 ID
          </button>
          <button
            className="danger-text"
            onClick={() => {
              onDelete(menu.session)
              setMenu(null)
            }}
          >
            删除
          </button>
        </div>
      ) : null}
    </aside>
  )
}
