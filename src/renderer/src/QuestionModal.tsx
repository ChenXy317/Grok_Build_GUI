import { useEffect, useMemo, useState } from 'react'
import type { QuestionRequest, UserQuestion } from '../../preload/index.d'

type Props = {
  request: QuestionRequest
  onSubmit: (answers: Record<string, string[]>, annotations?: Record<string, { notes?: string }>) => void
  onCancel: () => void
  onChat?: (partial: Record<string, string>) => void
  onSkip?: (partial: Record<string, string>) => void
}

function questionKey(item: UserQuestion): string {
  return item.id || item.question
}

export default function QuestionModal({ request, onSubmit, onCancel, onChat, onSkip }: Props) {
  const questions = request.questions
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const current = questions[index]
  const key = current ? questionKey(current) : ''
  const selected = picked[key] ?? []
  const plan = request.mode === 'plan'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (index < questions.length - 1) setIndex((i) => i + 1)
        else finish()
        return
      }
      if (e.key === 'ArrowRight' && index < questions.length - 1) setIndex((i) => i + 1)
      if (e.key === 'ArrowLeft' && index > 0) setIndex((i) => i - 1)
      const n = Number(e.key)
      if (n >= 1 && n <= current.options.length) {
        e.preventDefault()
        toggle(current.options[n - 1].label)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const preview = useMemo(() => {
    if (!current || current.multiSelect) return ''
    const hit = current.options.find((item) => selected.includes(item.label))
    return hit?.preview || ''
  }, [current, selected])

  const toggle = (label: string) => {
    if (!current) return
    setPicked((prev) => {
      const cur = prev[key] ?? []
      if (current.multiSelect) {
        const next = cur.includes(label) ? cur.filter((item) => item !== label) : [...cur, label]
        return { ...prev, [key]: next }
      }
      return { ...prev, [key]: [label] }
    })
  }

  const finish = () => {
    const annotations: Record<string, { notes?: string }> = {}
    for (const [q, text] of Object.entries(notes)) {
      if (text.trim()) annotations[q] = { notes: text.trim() }
    }
    onSubmit(picked, Object.keys(annotations).length ? annotations : undefined)
  }

  const partial = () => {
    const out: Record<string, string> = {}
    for (const [q, labels] of Object.entries(picked)) {
      if (labels[0]) out[q] = labels[0]
    }
    return out
  }

  if (!current) return null

  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <div className="modal-kicker">需要你选择 {index + 1} / {questions.length}</div>
        <h2>{current.question}</h2>
        <div className="choice-list">
          {current.options.map((option, i) => {
            const on = selected.includes(option.label)
            return (
              <button
                key={`${option.label}-${i}`}
                className={`choice ${on ? 'active' : ''}`}
                onClick={() => toggle(option.label)}
              >
                <strong>
                  {i + 1}. {option.label}
                </strong>
                {option.description ? <span>{option.description}</span> : null}
              </button>
            )
          })}
        </div>
        <label className="field">
          其他（可选）
          <input
            value={notes[key] ?? ''}
            placeholder="补充说明，或填写自定义答案"
            onChange={(e) => setNotes((prev) => ({ ...prev, [key]: e.target.value }))}
          />
        </label>
        {preview ? <pre className="choice-preview">{preview}</pre> : null}
        <p className="hint">数字键选择，Enter 下一题，Esc 取消。</p>
        <div className="modal-actions">
          <button className="btn" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            上一题
          </button>
          {index < questions.length - 1 ? (
            <button className="btn primary" onClick={() => setIndex((i) => i + 1)}>
              下一题
            </button>
          ) : (
            <button className="btn primary" onClick={finish}>
              提交
            </button>
          )}
          {plan && onChat ? (
            <button className="btn" onClick={() => onChat(partial())}>
              再聊聊
            </button>
          ) : null}
          {plan && onSkip ? (
            <button className="btn" onClick={() => onSkip(partial())}>
              跳过访谈
            </button>
          ) : null}
          <button className="btn" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
