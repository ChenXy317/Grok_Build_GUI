import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function sessionsRoot(): string {
  return join(process.env.GROK_HOME || join(homedir(), '.grok'), 'sessions')
}

function findSessionDir(sessionId: string): string | null {
  const root = sessionsRoot()
  if (!existsSync(root) || !sessionId) return null
  for (const group of readdirSync(root, { withFileTypes: true })) {
    if (!group.isDirectory()) continue
    const dir = join(root, group.name, sessionId)
    if (existsSync(join(dir, 'summary.json'))) return dir
  }
  return null
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
}

/** 从磁盘删除会话目录。 */
export function deleteSessionDir(sessionId: string): boolean {
  const dir = findSessionDir(sessionId)
  if (!dir) return false
  rmSync(dir, { recursive: true, force: true })
  return true
}

/** 改写 summary.json 中的标题。 */
export function renameSessionDir(sessionId: string, title: string): boolean {
  const dir = findSessionDir(sessionId)
  if (!dir) return false
  const file = join(dir, 'summary.json')
  const summary = readJson(file)
  const next = title.trim()
  if (!next) return false
  summary.session_summary = next
  summary.generated_title = next
  writeFileSync(file, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  return true
}

export type SessionUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  turnCount?: number
  modelCalls?: number
}

/** 读取会话 usage.json。 */
export function readSessionUsage(sessionId: string): SessionUsage | null {
  const dir = findSessionDir(sessionId)
  if (!dir) return null
  const file = join(dir, 'usage.json')
  if (!existsSync(file)) return null
  try {
    const raw = readJson(file)
    const session = (raw.session ?? raw) as SessionUsage
    return {
      inputTokens: Number(session.inputTokens) || 0,
      outputTokens: Number(session.outputTokens) || 0,
      totalTokens: Number(session.totalTokens) || 0,
      turnCount: Number(session.turnCount) || 0,
      modelCalls: Number(session.modelCalls) || 0
    }
  } catch {
    return null
  }
}
