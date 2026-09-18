import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'

const MAX_READ = 400_000
const MAX_WRITE = 8_000_000

function assertAbs(path: string): string {
  if (typeof path !== 'string' || !path || !isAbsolute(path)) {
    throw new Error('路径必须是绝对路径')
  }
  return path
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

/** ACP fs/write_text_file：写入文本，必要时创建父目录。 */
export function writeTextFile(path: string, content: string): Record<string, never> {
  const file = assertAbs(path)
  if (typeof content !== 'string') throw new Error('内容必须是文本')
  if (content.length > MAX_WRITE) throw new Error('写入内容过大')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content, 'utf8')
  return {}
}
