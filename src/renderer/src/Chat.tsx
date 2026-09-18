import { useEffect, useRef } from 'react'
import Markdown from './Markdown'
import { toolSummary, type Block, type ToolBlock } from './blocks'

function statusLabel(status: string): string {
  if (status === 'completed') return '完成'
  if (status === 'failed') return '失败'
  if (status === 'in_progress') return '进行中'
  if (status === 'cancelled') return '已取消'
  return status || '等待'
}

function DiffView({ item }: { item: { path?: string; oldText?: string; newText?: string } }) {
  const oldLines = (item.oldText ?? '').split('\n')
  const newLines = (item.newText ?? '').split('\n')
  return (
    <div className="diff">
      {item.path ? <div className="diff-path">{item.path}</div> : null}
      {oldLines.filter(Boolean).slice(0, 40).map((line, i) => (
        <div key={`o-${i}`} className="diff-del">
          - {line}
        </div>
      ))}
      {newLines.filter(Boolean).slice(0, 40).map((line, i) => (
        <div key={`n-${i}`} className="diff-add">
          + {line}
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

  return (
    <details className={`tool ${block.status}`} open={block.status === 'in_progress' || block.status === 'pending'}>
      <summary>
        <span className={`dot ${block.status}`} />
        <span className="tool-title">{block.title}</span>
        <span className="tool-status">{statusLabel(block.status)}</span>
      </summary>
      {summary ? <div className="tool-summary">{summary}</div> : null}
      {diffs.map((diff, i) => (
        <DiffView key={i} item={diff} />
      ))}
      {texts.map((item, i) =>
        item.content?.text ? (
          <pre key={i} className="tool-out">
            {item.content.text.slice(0, 4000)}
          </pre>
        ) : null
      )}
      {!diffs.length && !texts.length && block.rawOutput ? (
        <pre className="tool-out">{typeof block.rawOutput === 'string' ? block.rawOutput : JSON.stringify(block.rawOutput, null, 2).slice(0, 4000)}</pre>
      ) : null}
    </details>
  )
}

export default function Chat({
  blocks,
  streaming,
  emptyHint
}: {
  blocks: Block[]
  streaming: boolean
  emptyHint: string
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pin = useRef(true)

  useEffect(() => {
    if (pin.current) endRef.current?.scrollIntoView({ block: 'end' })
  }, [blocks, streaming])

  return (
    <div
      className="chat"
      ref={scrollerRef}
      onScroll={(e) => {
        const el = e.currentTarget
        pin.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96
      }}
    >
      {blocks.length === 0 ? <div className="empty">{emptyHint}</div> : null}
      {blocks.map((block) => {
        if (block.type === 'user') {
          return (
            <div key={block.id} className="msg user">
              <div className="msg-label">你</div>
              <div className="bubble">{block.text}</div>
            </div>
          )
        }
        if (block.type === 'thought') {
          return (
            <details key={block.id} className="thought" open={!block.collapsed}>
              <summary>思考过程</summary>
              <pre>{block.text}</pre>
            </details>
          )
        }
        if (block.type === 'assistant') {
          return (
            <div key={block.id} className="msg assistant">
              <div className="msg-label">Grok</div>
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
      {streaming ? <div className="typing">Grok 正在工作…</div> : null}
      <div ref={endRef} />
    </div>
  )
}
