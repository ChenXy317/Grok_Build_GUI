import { useEffect, useState } from 'react'
import type { RewindPoint } from '../../preload/index.d'

export default function RewindModal({
  points,
  onPick,
  onClose
}: {
  points: RewindPoint[]
  onPick: (index: number) => void
  onClose: () => void
}) {
  const [active, setActive] = useState(Math.max(0, points.length - 1))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => Math.min(points.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const point = points[active]
        if (point) onPick(point.index)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, onClose, onPick, points])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-kicker">回退</div>
        <h2>回到之前的回合</h2>
        <p className="hint">只截断对话历史，磁盘上的文件改动不会还原。</p>
        <div className="rewind-list">
          {points.map((point, i) => (
            <button
              key={`${point.index}-${i}`}
              className={`choice ${i === active ? 'active' : ''}`}
              onClick={() => onPick(point.index)}
            >
              <strong>
                #{point.index + 1} {point.title.slice(0, 80)}
              </strong>
              {point.preview ? <span>{point.preview.slice(0, 160)}</span> : null}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
