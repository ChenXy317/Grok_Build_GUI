export type DiffLine = { type: 'eq' | 'del' | 'add'; text: string }

/** 按行生成带上下文的 diff。 */
export function lineDiff(oldText: string, newText: string, context = 2): DiffLine[] {
  const a = (oldText ?? '').split('\n')
  const b = (newText ?? '').split('\n')
  const n = a.length
  const m = b.length
  if (n + m > 600) {
    return [
      ...a.slice(0, 60).map((text) => ({ type: 'del' as const, text })),
      ...b.slice(0, 60).map((text) => ({ type: 'add' as const, text })),
      ...(n > 60 || m > 60 ? [{ type: 'eq' as const, text: '…' }] : [])
    ]
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const raw: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ type: 'eq', text: a[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: 'del', text: a[i] })
      i += 1
    } else {
      raw.push({ type: 'add', text: b[j] })
      j += 1
    }
  }
  while (i < n) {
    raw.push({ type: 'del', text: a[i] })
    i += 1
  }
  while (j < m) {
    raw.push({ type: 'add', text: b[j] })
    j += 1
  }

  const keep = new Array(raw.length).fill(false)
  raw.forEach((line, idx) => {
    if (line.type !== 'eq') {
      for (let k = Math.max(0, idx - context); k <= Math.min(raw.length - 1, idx + context); k++) keep[k] = true
    }
  })
  const out: DiffLine[] = []
  let skipped = 0
  raw.forEach((line, idx) => {
    if (keep[idx]) {
      if (skipped) {
        out.push({ type: 'eq', text: `… ${skipped} 行未改` })
        skipped = 0
      }
      out.push(line)
    } else skipped += 1
  })
  if (skipped) out.push({ type: 'eq', text: `… ${skipped} 行未改` })
  return out.length ? out : raw
}
