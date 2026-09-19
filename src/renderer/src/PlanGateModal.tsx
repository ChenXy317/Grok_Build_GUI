import { useEffect, useState } from 'react'
import Markdown from './Markdown'
import type { PlanGateRequest } from '../../preload/index.d'

export default function PlanGateModal({
  request,
  onApprove,
  onRevise,
  onQuit
}: {
  request: PlanGateRequest
  onApprove: () => void
  onRevise: (feedback: string) => void
  onQuit: () => void
}) {
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onQuit()
      }
      if (e.key.toLowerCase() === 'a' && (e.ctrlKey || e.metaKey)) return
      if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'a' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        onApprove()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onApprove, onQuit])

  return (
    <div className="modal-backdrop">
      <div className="modal wide plan-gate">
        <div className="modal-kicker">计划待批准</div>
        <h2>审阅计划后开始实现</h2>
        <div className="plan-preview">
          {request.planContent ? (
            <Markdown text={request.planContent} />
          ) : request.entries?.length ? (
            <ul>
              {request.entries.map((entry, i) => (
                <li key={i}>{entry.content}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">还没有写入计划文件。仍可批准开始，或要求修改。</p>
          )}
        </div>
        <label className="field">
          修改意见（可选）
          <textarea
            rows={3}
            value={feedback}
            placeholder="指出要改的地方，发送后会继续规划"
            onChange={(e) => setFeedback(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button className="btn primary" onClick={onApprove}>
            批准并开始
          </button>
          <button className="btn" onClick={() => onRevise(feedback.trim())} disabled={!feedback.trim()}>
            要求修改
          </button>
          <button
            className="ghost"
            onClick={() => {
              if (request.planContent) void window.grok.clipboardWrite(request.planContent)
            }}
          >
            复制计划
          </button>
          <button className="btn" onClick={onQuit}>
            放弃计划
          </button>
        </div>
      </div>
    </div>
  )
}
