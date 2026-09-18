import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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
          pre: ({ children }) => <pre className="md-pre">{children}</pre>
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
