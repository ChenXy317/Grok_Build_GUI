import type { Readable, Writable } from 'node:stream'

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
  timer?: NodeJS.Timeout
}

export type JsonRpcMessage = {
  jsonrpc?: string
  id?: number | string
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

/**
 * 面向 grok agent stdio 的换行分隔 JSON-RPC 2.0 传输。
 */
export class JsonRpc {
  private nextId = 1
  private pending = new Map<number, Pending>()
  private buffer = ''
  private closed = false

  constructor(
    private readonly stdin: Writable,
    stdout: Readable,
    private readonly onRequest: (msg: JsonRpcMessage) => Promise<unknown>,
    private readonly onNotification: (msg: JsonRpcMessage) => void,
    private readonly onParseError?: (line: string, error: unknown) => void
  ) {
    stdout.setEncoding('utf8')
    stdout.on('data', (chunk: string) => this.push(chunk))
    stdout.on('end', () => this.shutdown(new Error('agent stdout closed')))
  }

  request(method: string, params?: unknown, timeoutMs = 0): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('ACP 连接已关闭'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const pending: Pending = { resolve, reject }
      if (timeoutMs > 0) {
        pending.timer = setTimeout(() => {
          this.pending.delete(id)
          reject(new Error(`${method} 超时`))
        }, timeoutMs)
      }
      this.pending.set(id, pending)
      this.write({ jsonrpc: '2.0', id, method, params: params ?? {} })
    })
  }

  notify(method: string, params?: unknown): void {
    this.write({ jsonrpc: '2.0', method, params: params ?? {} })
  }

  respond(id: number | string, result: unknown): void {
    this.write({ jsonrpc: '2.0', id, result })
  }

  respondError(id: number | string, code: number, message: string, data?: unknown): void {
    this.write({ jsonrpc: '2.0', id, error: { code, message, data } })
  }

  shutdown(error?: Error): void {
    if (this.closed) return
    this.closed = true
    for (const [, pending] of this.pending) {
      if (pending.timer) clearTimeout(pending.timer)
      pending.reject(error ?? new Error('ACP 连接已关闭'))
    }
    this.pending.clear()
  }

  private write(payload: unknown): void {
    if (this.closed) return
    try {
      this.stdin.write(`${JSON.stringify(payload)}\n`)
    } catch (error) {
      this.shutdown(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private push(chunk: string): void {
    this.buffer += chunk
    while (true) {
      const idx = this.buffer.indexOf('\n')
      if (idx < 0) break
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (!line) continue
      this.dispatch(line)
    }
  }

  private dispatch(line: string): void {
    let msg: JsonRpcMessage
    try {
      msg = JSON.parse(line) as JsonRpcMessage
    } catch (error) {
      this.onParseError?.(line, error)
      return
    }

    const isResponse = msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined) && !msg.method
    if (isResponse) {
      const pending = this.pending.get(Number(msg.id))
      if (!pending) return
      this.pending.delete(Number(msg.id))
      if (pending.timer) clearTimeout(pending.timer)
      if (msg.error) {
        const err = new Error(msg.error.message || 'ACP 错误')
        err.name = 'JsonRpcError'
        Object.assign(err, { code: msg.error.code, data: msg.error.data })
        pending.reject(err)
      } else {
        pending.resolve(msg.result)
      }
      return
    }

    if (msg.method && msg.id !== undefined) {
      void this.onRequest(msg)
        .then((result) => this.respond(msg.id as number | string, result ?? null))
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          this.respondError(msg.id as number | string, -32000, message)
        })
      return
    }

    if (msg.method) this.onNotification(msg)
  }
}
