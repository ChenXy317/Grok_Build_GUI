import { useEffect, useRef } from 'react'

export default function Composer({
  draft,
  setDraft,
  streaming,
  disabled,
  onSend,
  onStop,
  onAttach
}: {
  draft: string
  setDraft: (value: string) => void
  streaming: boolean
  disabled: boolean
  onSend: () => void
  onStop: () => void
  onAttach: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [draft])

  return (
    <div className="composer">
      <button className="icon-btn" title="附加文件" onClick={onAttach} disabled={disabled}>
        +
      </button>
      <textarea
        ref={ref}
        rows={1}
        placeholder="给 Grok Build 下任务，Enter 发送，Shift+Enter 换行。用 @路径 附加文件。"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (streaming) onStop()
            else onSend()
          }
        }}
      />
      {streaming ? (
        <button className="btn danger" onClick={onStop}>
          停止
        </button>
      ) : (
        <button className="btn primary" onClick={onSend} disabled={disabled || !draft.trim()}>
          发送
        </button>
      )}
    </div>
  )
}
