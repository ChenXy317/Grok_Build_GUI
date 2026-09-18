import type { Block } from './blocks'

/** 将对话块导出为 Markdown。 */
export function blocksToMarkdown(blocks: Block[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    if (block.type === 'user') parts.push(`## 你\n\n${block.text}\n`)
    else if (block.type === 'assistant') parts.push(`## Grok\n\n${block.text}\n`)
    else if (block.type === 'thought') parts.push(`<details><summary>思考过程</summary>\n\n\`\`\`\n${block.text}\n\`\`\`\n</details>\n`)
    else if (block.type === 'plan') {
      parts.push(`## 计划\n\n${block.entries.map((e) => `- [${e.status === 'completed' ? 'x' : ' '}] ${e.content ?? ''}`).join('\n')}\n`)
    } else {
      parts.push(`### 工具：${block.title}（${block.status}）\n`)
      if (block.rawInput) parts.push(`\`\`\`json\n${JSON.stringify(block.rawInput, null, 2)}\n\`\`\`\n`)
    }
  }
  return parts.join('\n')
}

export function formatTokens(n?: number): string {
  if (!n) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function lastAssistant(blocks: Block[]): string {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]
    if (block.type === 'assistant') return block.text
  }
  return ''
}
