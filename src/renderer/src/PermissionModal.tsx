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
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-kicker">需要批准</div>
        <h2>{title}</h2>
        <p className="muted">{toolSummary(input) || 'Grok 想执行一项可能修改环境的操作。'}</p>
        <div className="modal-actions">
          {request.options.map((option) => {
            const reject = String(option.kind ?? '').startsWith('reject')
            return (
              <button
                key={option.optionId}
                className={`btn ${reject ? 'danger' : 'primary'}`}
                onClick={() => onChoose(option.optionId)}
              >
                {option.name}
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
