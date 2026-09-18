export type ToolBlock = {
  id: string
  type: 'tool'
  toolCallId: string
  title: string
  kind?: string
  status: string
  rawInput?: Record<string, unknown>
  rawOutput?: unknown
  content?: unknown[]
  locations?: { path?: string; line?: number }[]
}

export type Block =
  | { id: string; type: 'user'; text: string; pending?: boolean }
  | { id: string; type: 'assistant'; text: string }
  | { id: string; type: 'thought'; text: string; collapsed: boolean }
  | ToolBlock
  | { id: string; type: 'plan'; entries: { content?: string; status?: string; priority?: string }[] }

let seq = 0
const uid = (): string => `b-${++seq}`

function textOf(update: Record<string, unknown>): string {
  const content = update.content as { text?: string } | undefined
  return content?.text ?? ''
}

function mergeTool(prev: ToolBlock, update: Record<string, unknown>): ToolBlock {
  return {
    ...prev,
    title: (update.title as string) ?? prev.title,
    kind: (update.kind as string) ?? prev.kind,
    status: (update.status as string) ?? prev.status,
    rawInput: (update.rawInput as Record<string, unknown>) ?? prev.rawInput,
    rawOutput: update.rawOutput ?? prev.rawOutput,
    content: (update.content as unknown[]) ?? prev.content,
    locations: (update.locations as ToolBlock['locations']) ?? prev.locations
  }
}

/** 将 ACP session/update 合并进对话块列表。 */
export function applyUpdate(blocks: Block[], update: Record<string, unknown>): Block[] {
  const kind = String(update.sessionUpdate ?? '')

  if (kind === 'user_message_chunk') {
    const chunk = textOf(update)
    const last = blocks[blocks.length - 1]
    if (last?.type === 'user') {
      if (last.pending) return blocks
      return [...blocks.slice(0, -1), { ...last, text: last.text + chunk }]
    }
    return [...blocks, { id: uid(), type: 'user', text: chunk }]
  }

  if (kind === 'agent_thought_chunk') {
    const last = blocks[blocks.length - 1]
    if (last?.type === 'thought') {
      return [...blocks.slice(0, -1), { ...last, text: last.text + textOf(update), collapsed: false }]
    }
    return [...blocks, { id: uid(), type: 'thought', text: textOf(update), collapsed: false }]
  }

  if (kind === 'agent_message_chunk') {
    const next = blocks.map((b) => (b.type === 'thought' ? { ...b, collapsed: true } : b))
    const last = next[next.length - 1]
    if (last?.type === 'assistant') {
      return [...next.slice(0, -1), { ...last, text: last.text + textOf(update) }]
    }
    return [...next, { id: uid(), type: 'assistant', text: textOf(update) }]
  }

  if (kind === 'tool_call' || kind === 'tool_call_update') {
    const toolCallId = String(update.toolCallId ?? '')
    const idx = blocks.findIndex((b) => b.type === 'tool' && b.toolCallId === toolCallId)
    const base: ToolBlock =
      idx >= 0 && blocks[idx].type === 'tool'
        ? (blocks[idx] as ToolBlock)
        : {
            id: toolCallId || uid(),
            type: 'tool',
            toolCallId,
            title: String(update.title ?? '工具调用'),
            kind: update.kind as string | undefined,
            status: String(update.status ?? 'pending')
          }
    const merged = mergeTool(base, update)
    if (idx >= 0) {
      const next = [...blocks]
      next[idx] = merged
      return next
    }
    return [...blocks, merged]
  }

  if (kind === 'plan') {
    const entries = (update.entries as { content?: string; status?: string; priority?: string }[]) ?? []
    const idx = blocks.findIndex((b) => b.type === 'plan')
    const plan: Block = { id: idx >= 0 ? blocks[idx].id : uid(), type: 'plan', entries }
    if (idx >= 0) {
      const next = [...blocks]
      next[idx] = plan
      return next
    }
    return [...blocks, plan]
  }

  return blocks
}

export function applyHistory(history: Record<string, unknown>[]): Block[] {
  return history.reduce<Block[]>((acc, update) => applyUpdate(acc, update), [])
}

export function formatAtPath(filePath: string): string {
  if (/[\s"]/.test(filePath)) return `@"${filePath.replaceAll('"', '\\"')}"`
  return `@${filePath}`
}

export function toolSummary(input?: Record<string, unknown>): string {
  if (!input) return ''
  const keys = ['command', 'path', 'query', 'pattern', 'url', 'file_path', 'target_file']
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  try {
    return JSON.stringify(input).slice(0, 280)
  } catch {
    return ''
  }
}

export function folderName(cwd: string): string {
  const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || cwd
}

/** 统一斜杠；仅 Windows 忽略大小写。 */
export function samePath(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  const win = typeof window !== 'undefined' && window.grok?.platform === 'win32'
  const n = (p: string) => {
    const s = p.replace(/[\\/]+$/, '').replace(/\\/g, '/')
    return win ? s.toLowerCase() : s
  }
  return n(a) === n(b)
}

export function latestSession<T extends { sessionId: string; cwd?: string; updatedAt?: string }>(
  sessions: T[],
  cwd?: string | null,
  sessionId?: string | null
): T | undefined {
  if (sessionId) {
    const exact = sessions.find((item) => item.sessionId === sessionId)
    if (exact) return exact
  }
  const pool = cwd ? sessions.filter((item) => samePath(item.cwd, cwd)) : sessions
  return [...pool].sort((a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? ''))[0]
}

export function relTime(iso?: string): string {
  if (!iso) return ''
  const delta = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(delta)) return ''
  if (delta < 60_000) return '刚刚'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`
  if (delta < 86_400_000 * 7) return `${Math.floor(delta / 86_400_000)} 天前`
  return new Date(iso).toLocaleDateString()
}
