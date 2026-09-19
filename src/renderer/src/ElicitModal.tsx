import { useEffect, useMemo, useState } from 'react'
import type { ElicitRequest } from '../../preload/index.d'

type Field = {
  name: string
  type: string
  title?: string
  description?: string
  required?: boolean
  enum?: string[]
}

function fieldsOf(schema?: Record<string, unknown>): Field[] {
  const properties = (schema?.properties ?? {}) as Record<string, Record<string, unknown>>
  const required = new Set(Array.isArray(schema?.required) ? schema.required.map(String) : [])
  return Object.entries(properties).map(([name, spec]) => ({
    name,
    type: String(spec.type ?? 'string'),
    title: spec.title ? String(spec.title) : undefined,
    description: spec.description ? String(spec.description) : undefined,
    required: required.has(name),
    enum: Array.isArray(spec.enum) ? spec.enum.map(String) : undefined
  }))
}

export default function ElicitModal({
  request,
  onAccept,
  onDecline,
  onCancel
}: {
  request: ElicitRequest
  onAccept: (content?: Record<string, unknown>) => void
  onDecline: () => void
  onCancel: () => void
}) {
  const fields = useMemo(() => fieldsOf(request.requestedSchema), [request.requestedSchema])
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (request.mode === 'url' && request.url) void window.grok.openExternal(request.url)
  }, [request.mode, request.url])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const submit = () => {
    const content: Record<string, unknown> = {}
    for (const field of fields) {
      const raw = values[field.name] ?? ''
      if (!raw && field.required) return
      if (!raw) continue
      if (field.type === 'boolean') content[field.name] = raw === 'true'
      else if (field.type === 'number' || field.type === 'integer') content[field.name] = Number(raw)
      else content[field.name] = raw
    }
    onAccept(fields.length ? content : undefined)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <div className="modal-kicker">{request.serverName || 'MCP'}</div>
        <h2>{request.message || '需要补充信息'}</h2>
        {request.mode === 'url' ? (
          <>
            <p className="muted">已在浏览器打开授权页。完成后点接受，或拒绝这次请求。</p>
            {request.url ? <p className="hint">{request.url}</p> : null}
          </>
        ) : (
          fields.map((field) => (
            <label key={field.name} className="field">
              {field.title || field.name}
              {field.required ? ' *' : ''}
              {field.enum ? (
                <select
                  value={values[field.name] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                >
                  <option value="">选择</option>
                  {field.enum.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              ) : field.type === 'boolean' ? (
                <select
                  value={values[field.name] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                >
                  <option value="">选择</option>
                  <option value="true">是</option>
                  <option value="false">否</option>
                </select>
              ) : (
                <input
                  value={values[field.name] ?? ''}
                  placeholder={field.description || field.name}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                />
              )}
            </label>
          ))
        )}
        <div className="modal-actions">
          <button className="btn primary" onClick={submit}>
            接受
          </button>
          <button className="btn danger" onClick={onDecline}>
            拒绝
          </button>
          <button className="btn" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
