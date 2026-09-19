import { useEffect } from 'react'
import type { TrustRequest } from '../../preload/index.d'

export default function TrustModal({
  request,
  onTrust,
  onReject
}: {
  request: TrustRequest
  onTrust: () => void
  onReject: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onReject()
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        onTrust()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onReject, onTrust])

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-kicker">项目信任</div>
        <h2>信任这个目录吗？</h2>
        <p className="muted">{request.workspace || request.cwd}</p>
        {request.configKinds.length ? (
          <p className="hint">检测到：{request.configKinds.join('、')}。信任后才会加载仓库内的 MCP / 钩子 / 技能。</p>
        ) : (
          <p className="hint">信任后才会启用仓库内的项目配置。Enter 信任，Esc 拒绝。</p>
        )}
        <div className="modal-actions">
          <button className="btn primary" autoFocus onClick={onTrust}>
            信任
          </button>
          <button className="btn" onClick={onReject}>
            不信任
          </button>
        </div>
      </div>
    </div>
  )
}
