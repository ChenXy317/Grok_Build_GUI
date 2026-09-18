import type { SlashCommand } from '../../preload/index.d'

export type Command = {
  name: string
  description: string
  hint?: string
  local?: boolean
}

export const LOCAL_COMMANDS: Command[] = [
  { name: 'new', description: '新建会话并清空当前对话', local: true },
  { name: 'clear', description: '新建会话并清空当前对话', local: true },
  { name: 'copy', description: '复制上一条助手回复', local: true },
  { name: 'export', description: '导出当前对话为 Markdown', local: true },
  { name: 'always-approve', description: '切换始终批准', local: true },
  { name: 'help', description: '显示快捷键', local: true },
  { name: 'compact', description: '压缩上下文', hint: '保留重点（可选）' }
]

export function mergeCommands(agent: SlashCommand[]): Command[] {
  const seen = new Set(LOCAL_COMMANDS.map((item) => item.name.toLowerCase()))
  const extra = agent
    .filter((item) => item.name && !seen.has(item.name.replace(/^\//, '').toLowerCase()))
    .map((item) => ({
      name: item.name.replace(/^\//, ''),
      description: item.description || '',
      hint: item.input?.hint
    }))
  return [...LOCAL_COMMANDS, ...extra]
}

export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.replace(/^\//, '').toLowerCase()
  if (!q) return commands
  return commands.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(q))
}

export function parseSlash(draft: string): { name: string; rest: string } | null {
  const match = draft.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/)
  if (!match) return null
  return { name: match[1], rest: (match[2] ?? '').trim() }
}
