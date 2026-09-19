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
  { name: 'auto', description: '切换自动批准模式', local: true },
  { name: 'plan', description: '进入计划模式', hint: '任务描述（可选）' },
  { name: 'view-plan', description: '查看当前计划', local: true },
  { name: 'rewind', description: '回退到之前的回合', local: true },
  { name: 'undo', description: '回退到之前的回合', local: true },
  { name: 'fork', description: '从当前对话分叉新会话', local: true },
  { name: 'rename', description: '重命名当前会话', hint: '新标题' },
  { name: 'delete', description: '删除当前会话', local: true },
  { name: 'home', description: '回到欢迎页', local: true },
  { name: 'session-info', description: '查看会话信息', local: true },
  { name: 'model', description: '切换模型', hint: '模型 ID' },
  { name: 'effort', description: '设置推理力度', hint: 'low / medium / high' },
  { name: 'docs', description: '打开文档', local: true },
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
