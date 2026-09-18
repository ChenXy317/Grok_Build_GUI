import { useEffect } from 'react'
import { toolSummary } from './blocks'
import type { PermissionRequest } from '../../preload/index.d'

export default function PermissionModal({
  request,
  onChoose
}: {
  request: PermissionRequest
  onChoose: (optionId: string | null) => void
}) {
  const input = request.toolCall.rawInput as Record<string, unknown> | undefined
  const title = String(request.toolCall.title ?? '工具调用')
  const options = request.options ?? []
  const primary = options.find((item) => !String(item.kind ?? '').startsWith('reject')) ?? options[0]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onChoose(null)
        return
      }
      if (e.key === 'Enter' && primary) {
        e.preventDefault()
        onChoose(primary.optionId)
        return
      }
      const index = Number(e.key) - 1
      if (index >= 0 && index < options.length) {
        e.preventDefault()
        onChoose(options[index].optionId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onChoose, options, primary])

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-kicker">需要批准</div>
        <h2>{title}</h2>
        <p className="muted">{toolSummary(input) || 'Grok 想执行一项可能修改环境的操作。'}</p>
        <p className="hint">Enter 批准，Esc 取消，数字键选择按钮。</p>
        <div className="modal-actions">
          {options.map((option, i) => {
            const reject = String(option.kind ?? '').startsWith('reject')
            const isPrimary = option.optionId === primary?.optionId
            return (
              <button
                key={option.optionId}
                className={`btn ${reject ? 'danger' : 'primary'}`}
                autoFocus={isPrimary}
                onClick={() => onChoose(option.optionId)}
              >
                {option.name}
                {options.length > 1 ? ` (${i + 1})` : ''}
              </button>
            )
          })}
          <button className="btn" onClick={() => onChoose(null)}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
