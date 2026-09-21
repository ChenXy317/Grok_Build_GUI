import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('找不到根节点')
const root = rootEl

function showBootError(err: unknown): void {
  const message = err instanceof Error ? err.stack || err.message : String(err)
  root.innerHTML = `<div style="padding:40px;color:#ececf1;font:14px/1.5 Segoe UI,sans-serif;white-space:pre-wrap">启动失败\n\n${message.replaceAll('<', '&lt;')}</div>`
}

window.addEventListener('error', (event) => {
  if (!root.childElementCount) showBootError(event.error ?? event.message)
})
window.addEventListener('unhandledrejection', (event) => {
  if (!root.childElementCount) showBootError(event.reason)
})

try {
  if (!window.grok) throw new Error('预加载失败：window.grok 不可用')
  createRoot(root).render(<App />)
} catch (err) {
  showBootError(err)
}
