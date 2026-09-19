import { useEffect, useMemo, useState } from 'react'

export type PaletteItem = {
  id: string
  label: string
  hint?: string
  run: () => void
}

export default function CommandPalette({
  items,
  onClose
}: {
  items: PaletteItem[]
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => `${item.label} ${item.hint ?? ''} ${item.id}`.toLowerCase().includes(q))
  }, [items, query])

  useEffect(() => {
    setActive(0)
  }, [query])

  const pick = (item?: PaletteItem) => {
    if (!item) return
    item.run()
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="search"
          placeholder="搜索命令…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => (i + 1) % Math.max(matches.length, 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => (i - 1 + matches.length) % Math.max(matches.length, 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              pick(matches[active] ?? matches[0])
            }
          }}
        />
        <div className="slash-menu static">
          {matches.length ? (
            matches.slice(0, 12).map((item, i) => (
              <button
                key={item.id}
                className={`slash-item ${i === active ? 'active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(item)
                }}
              >
                <strong>{item.label}</strong>
                {item.hint ? <span>{item.hint}</span> : null}
              </button>
            ))
          ) : (
            <div className="muted" style={{ padding: 12 }}>
              没有匹配的命令
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
