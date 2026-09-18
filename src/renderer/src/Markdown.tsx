import { useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object' && 'props' in node) return textOf((node as { props?: { children?: ReactNode } }).props?.children)
  return ''
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const text = textOf(children).replace(/\n$/, '')
  return (
    <div className="md-pre-wrap">
      <button
        className="ghost copy-btn"
        onClick={() => {
          void window.grok.clipboardWrite(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
      >
        {copied ? '已复制' : '复制'}
      </button>
      <pre className="md-pre">{children}</pre>
    </div>
  )
}

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                if (href) void window.grok.openExternal(href)
              }}
            >
              {children}
            </a>
          ),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
