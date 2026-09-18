import { useEffect, useMemo, useRef, useState } from 'react'
import { filterCommands, type Command } from './commands'

export type ImagePart = { mimeType: string; data: string; name: string }

export default function Composer({
  draft,
  setDraft,
  streaming,
  disabled,
  placeholder,
  commands,
  images,
  setImages,
  queue,
  onSend,
  onStop,
  onAttach,
  onCommand,
  onPasteFiles
}: {
  draft: string
  setDraft: (value: string) => void
  streaming: boolean
  disabled: boolean
  placeholder?: string
  commands: Command[]
  images: ImagePart[]
  setImages: (value: ImagePart[]) => void
  queue: string[]
  onSend: () => void
  onStop: () => void
  onAttach: () => void
  onCommand: (name: string, rest: string) => boolean
  onPasteFiles?: (files: File[]) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [active, setActive] = useState(0)
  const slash = draft.startsWith('/') && !draft.includes('\n')
  const query = slash ? draft.slice(1) : ''
  const matches = useMemo(() => (slash ? filterCommands(commands, query.split(/\s/)[0] ?? '') : []), [commands, query, slash])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [draft])

  useEffect(() => {
    setActive(0)
  }, [query])

  const pick = (item: Command) => {
    if (item.hint) {
      setDraft(`/${item.name} `)
      ref.current?.focus()
      return
    }
    if (onCommand(item.name, '')) setDraft('')
    else setDraft(`/${item.name} `)
  }

  return (
    <div className="composer-wrap">
      {queue.length ? (
        <div className="queue">
          {queue.map((item, i) => (
            <span key={i} className="queue-chip" title={item}>
              排队 {item.slice(0, 40)}
            </span>
          ))}
        </div>
      ) : null}
      {images.length ? (
        <div className="attach-row">
          {images.map((img, i) => (
            <button
              key={i}
              className="thumb"
              title={img.name}
              onClick={() => setImages(images.filter((_, idx) => idx !== i))}
            >
              <img src={`data:${img.mimeType};base64,${img.data}`} alt="" />
            </button>
          ))}
        </div>
      ) : null}
      <div className="composer">
        <button className="icon-btn" title="附加文件" onClick={onAttach} disabled={disabled}>
          +
        </button>
        <textarea
          ref={ref}
          rows={1}
          autoFocus
          placeholder={placeholder ?? '给 Grok Build 下任务，/ 打开命令。'}
          value={draft}
          disabled={disabled}
          onPaste={(e) => {
            const files = [...e.clipboardData.files]
            if (files.length) {
              e.preventDefault()
              onPasteFiles?.(files)
            }
          }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (slash && matches.length) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => (i + 1) % matches.length)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => (i - 1 + matches.length) % matches.length)
                return
              }
              if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && draft.trim().split(/\s/).length === 1)) {
                e.preventDefault()
                pick(matches[active] ?? matches[0])
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setDraft('')
                return
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (slash) {
                const [name, ...rest] = draft.slice(1).trim().split(/\s+/)
                if (name && onCommand(name, rest.join(' '))) {
                  setDraft('')
                  return
                }
              }
              if (streaming) onSend()
              else onSend()
            }
          }}
        />
        {streaming ? (
          <button className="btn danger" onClick={onStop}>
            停止
          </button>
        ) : (
          <button className="btn primary" onClick={onSend} disabled={disabled || (!draft.trim() && !images.length)}>
            发送
          </button>
        )}
      </div>
      {slash && matches.length ? (
        <div className="slash-menu">
          {matches.slice(0, 10).map((item, i) => (
            <button
              key={item.name}
              className={`slash-item ${i === active ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(item)
              }}
            >
              <strong>/{item.name}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
