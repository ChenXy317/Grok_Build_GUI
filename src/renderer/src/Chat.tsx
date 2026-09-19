import { useEffect, useRef, type ReactNode } from 'react'
import Markdown from './Markdown'
import { toolSummary, type Block, type ToolBlock } from './blocks'
import { lineDiff } from './diff'

function statusLabel(status: string): string {
  if (status === 'completed') return '完成'
  if (status === 'failed') return '失败'
  if (status === 'in_progress') return '进行中'
  if (status === 'cancelled') return '已取消'
  return status || '等待'
}

function highlight(text: string, query: string): ReactNode {
  if (!query) return text
  const q = query.trim()
  if (!q) return text
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const out: ReactNode[] = []
  let from = 0
  while (from < text.length) {
    const at = lower.indexOf(needle, from)
    if (at < 0) {
      out.push(text.slice(from))
      break
    }
    if (at > from) out.push(text.slice(from, at))
    out.push(
      <mark key={at} className="hit">
        {text.slice(at, at + q.length)}
      </mark>
    )
    from = at + q.length
  }
  return out
}

function DiffView({ item }: { item: { path?: string; oldText?: string; newText?: string } }) {
  const lines = lineDiff(item.oldText ?? '', item.newText ?? '')
  return (
    <div className="diff">
      {item.path ? (
        <button className="diff-path" onClick={() => item.path && window.grok.revealPath(item.path)}>
          {item.path}
        </button>
      ) : null}
      {lines.slice(0, 220).map((line, i) => (
        <div key={i} className={`diff-${line.type}`}>
          {line.type === 'del' ? '- ' : line.type === 'add' ? '+ ' : '  '}
          {line.text}
        </div>
      ))}
    </div>
  )
}

function ToolCard({ block }: { block: ToolBlock }) {
  const summary = toolSummary(block.rawInput)
  const diffs = (block.content ?? []).filter(
    (item): item is { type: string; path?: string; oldText?: string; newText?: string } =>
      Boolean(item && typeof item === 'object' && (item as { type?: string }).type === 'diff')
  )
  const texts = (block.content ?? []).filter(
    (item): item is { type: string; content?: { text?: string } } =>
      Boolean(item && typeof item === 'object' && (item as { type?: string }).type === 'content')
  )
  const loc = block.locations?.find((item) => item.path)?.path

  return (
    <details className={`tool ${block.status}`} open={block.status === 'in_progress' || block.status === 'pending'}>
      <summary>
        <span className={`dot ${block.status}`} />
        <span className="tool-title">{block.title}</span>
        <span className="tool-status">{statusLabel(block.status)}</span>
      </summary>
      {summary ? <div className="tool-summary">{summary}</div> : null}
      {loc ? (
        <button className="ghost path-link" onClick={() => window.grok.revealPath(loc)}>
          {loc}
        </button>
      ) : null}
      {diffs.map((diff, i) => (
        <DiffView key={i} item={diff} />
      ))}
      {texts.map((item, i) =>
        item.content?.text ? (
          <pre key={i} className="tool-out">
            {item.content.text.slice(0, 8000)}
          </pre>
        ) : null
      )}
      {!diffs.length && !texts.length && block.rawOutput ? (
        <pre className="tool-out">{typeof block.rawOutput === 'string' ? block.rawOutput : JSON.stringify(block.rawOutput, null, 2).slice(0, 8000)}</pre>
      ) : null}
    </details>
  )
}

function CopyBtn({ text }: { text: string }) {
  return (
    <button
      className="ghost copy-btn"
      onClick={() => void window.grok.clipboardWrite(text)}
      title="复制"
    >
      复制
    </button>
  )
}

export default function Chat({
  blocks,
  streaming,
  restoring,
  empty,
  showThinking,
  find,
  stopReason,
  statusHint
}: {
  blocks: Block[]
  streaming: boolean
  restoring?: boolean
  empty?: ReactNode
  showThinking: boolean
  find?: string
  stopReason?: string
  statusHint?: string
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pin = useRef(true)
  const q = find?.trim() ?? ''

  useEffect(() => {
    if (pin.current) endRef.current?.scrollIntoView({ block: 'end' })
  }, [blocks, streaming])

  useEffect(() => {
    if (!q) return
    const hit = scrollerRef.current?.querySelector('.hit')
    hit?.scrollIntoView({ block: 'center' })
  }, [q, blocks])

  return (
    <div
      className="chat"
      ref={scrollerRef}
      onScroll={(e) => {
        const el = e.currentTarget
        pin.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96
      }}
    >
      {blocks.length === 0 ? <div className="empty">{empty}</div> : null}
      {blocks.map((block) => {
        if (q) {
          const hay =
            block.type === 'user' || block.type === 'assistant' || block.type === 'thought'
              ? block.text
              : block.type === 'tool'
                ? `${block.title} ${toolSummary(block.rawInput)}`
                : block.entries.map((e) => e.content ?? '').join(' ')
          if (!hay.toLowerCase().includes(q.toLowerCase())) return null
        }
        if (block.type === 'user') {
          return (
            <div key={block.id} className="msg user">
              <div className="msg-label">
                你
                <CopyBtn text={block.text} />
              </div>
              <div className="bubble">{q ? highlight(block.text, q) : block.text}</div>
            </div>
          )
        }
        if (block.type === 'thought') {
          if (!showThinking) return null
          return (
            <details key={block.id} className="thought" open={!block.collapsed}>
              <summary>思考过程</summary>
              <pre>{q ? highlight(block.text, q) : block.text}</pre>
            </details>
          )
        }
        if (block.type === 'assistant') {
          return (
            <div key={block.id} className="msg assistant">
              <div className="msg-label">
                Grok
                <CopyBtn text={block.text} />
              </div>
              <Markdown text={block.text} />
            </div>
          )
        }
        if (block.type === 'plan') {
          return (
            <div key={block.id} className="plan">
              <div className="msg-label">计划</div>
              <ul>
                {block.entries.map((entry, i) => (
                  <li key={i} className={entry.status}>
                    {entry.content}
                  </li>
                ))}
              </ul>
            </div>
          )
        }
        return <ToolCard key={block.id} block={block} />
      })}
      {restoring && blocks.length > 0 ? <div className="typing">正在恢复上次会话…</div> : null}
      {streaming ? <div className="typing">{statusHint || 'Grok 正在工作…'}</div> : null}
      {stopReason && stopReason !== 'end_turn' ? <div className="muted stop-reason">停止：{stopReason}</div> : null}
      <div ref={endRef} />
    </div>
  )
}
