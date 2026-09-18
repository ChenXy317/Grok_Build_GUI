import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

const MAX_READ = 400_000
const MAX_WRITE = 8_000_000

function assertAbs(path: string): string {
  if (typeof path !== 'string' || !path || !isAbsolute(path)) {
    throw new Error('路径必须是绝对路径')
  }
  return path
}

function pathKey(p: string): string {
  const n = resolve(p)
  return process.platform === 'win32' ? n.toLowerCase() : n
}

function containedIn(file: string, root: string): boolean {
  const a = pathKey(root)
  const b = pathKey(file)
  const rel = relative(a, b)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function assertWritable(path: string, roots: string[]): string {
  const file = resolve(assertAbs(path))
  const allowed = roots.filter(Boolean).some((root) => containedIn(file, root))
  if (!allowed) throw new Error('写入路径必须在项目目录内')
  return file
}

/** ACP fs/read_text_file：按行切片读取文本。 */
export function readTextFile(path: string, line?: number, limit?: number): { content: string } {
  const file = assertAbs(path)
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`找不到文件：${file}`)
  if (statSync(file).size > MAX_WRITE) throw new Error('文件过大，无法读取')
  let content = readFileSync(file, 'utf8')
  if (line != null || limit != null) {
    const lines = content.split('\n')
    const start = Math.max(0, (line ?? 1) - 1)
    content = lines.slice(start, limit != null ? start + Math.max(0, limit) : undefined).join('\n')
  }
  if (content.length > MAX_READ) content = `${content.slice(0, MAX_READ)}\n…（已截断）`
  return { content }
}

/** ACP fs/write_text_file：仅允许写入会话 cwd / GROK_HOME。 */
export function writeTextFile(path: string, content: string, roots: string[]): Record<string, never> {
  const file = assertWritable(path, roots)
  if (typeof content !== 'string') throw new Error('内容必须是文本')
  if (content.length > MAX_WRITE) throw new Error('写入内容过大')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content, 'utf8')
  return {}
}
