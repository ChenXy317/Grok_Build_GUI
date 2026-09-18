import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { JsonRpc, type JsonRpcMessage } from './jsonrpc'

export type ConfigOption = {
  id: string
  name: string
  category?: string
  type?: string
  currentValue?: unknown
  options?: { value: string; name: string; description?: string }[]
}

export type SessionInfo = {
  sessionId: string
  cwd?: string
  title?: string
  updatedAt?: string
  _meta?: Record<string, unknown>
}

export type SessionSnapshot = {
  sessionId: string
  cwd: string
  models?: {
    currentModelId?: string
    availableModels?: { modelId: string; name: string; description?: string; _meta?: Record<string, unknown> }[]
  }
  configOptions?: ConfigOption[]
  _meta?: Record<string, unknown>
  history: Record<string, unknown>[]
}

export type AuthInfo = {
  email?: string
  subscription_tier?: string
  auth_mode?: string
}

export type PermissionRequest = {
  rpcId: number | string
  sessionId: string
  toolCall: Record<string, unknown>
  options: { optionId: string; name: string; kind?: string }[]
}

type AcpEvents = {
  update: (payload: { sessionId?: string; method: string; update: Record<string, unknown> }) => void
  permission: (req: PermissionRequest) => void
  exit: (info: { code: number | null; stderr: string }) => void
  log: (line: string) => void
}

/**
 * 本地 grok agent stdio 的 ACP 客户端。
 */
export class GrokAgent {
  private proc: ChildProcessWithoutNullStreams | null = null
  private rpc: JsonRpc | null = null
  private stderrTail: string[] = []
  private collector: Record<string, unknown>[] | null = null
  private collectingSession: string | null = null
  private permissionWaiters = new Map<string | number, (result: unknown) => void>()
  private started = false
  private stopping = false

  sessionId: string | null = null
  cwd = homedir()
  auth: AuthInfo | null = null
  agentVersion: string | null = null
  models: SessionSnapshot['models'] | null = null
  configOptions: ConfigOption[] = []

  constructor(
    private readonly grokPath: string,
    private readonly events: Partial<AcpEvents> = {}
  ) {}

  async start(): Promise<{ auth: AuthInfo | null; agentVersion: string | null; models: SessionSnapshot['models'] | null }> {
    if (this.started) await this.stop()
    this.stopping = false
    this.stderrTail = []
    try {
      const proc = spawn(this.grokPath, ['agent', 'stdio'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          GROK_DISABLE_AUTOUPDATER: '1'
        }
      })
      this.proc = proc

      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => {
          proc.off('spawn', onSpawn)
          reject(err)
        }
        const onSpawn = () => {
          proc.off('error', onError)
          resolve()
        }
        proc.once('error', onError)
        proc.once('spawn', onSpawn)
      })

      proc.stderr.setEncoding('utf8')
      proc.stderr.on('data', (chunk: string) => {
        for (const line of chunk.split(/\r?\n/)) {
          if (!line.trim()) continue
          this.stderrTail.push(line)
          if (this.stderrTail.length > 80) this.stderrTail.shift()
          this.events.log?.(line)
        }
      })

      const fail = (error: Error, code: number | null = null): void => {
        this.rpc?.shutdown(error)
        if (!this.stopping) {
          this.events.exit?.({ code, stderr: this.stderrTail.slice(-20).join('\n') || error.message })
        }
      }

      proc.on('error', (err) => fail(err))
      proc.stdin.on('error', (err) => fail(err instanceof Error ? err : new Error(String(err))))
      proc.on('exit', (code) => {
        fail(new Error(`grok agent 退出 (${code ?? 'null'})`), code)
        this.proc = null
        this.rpc = null
        this.started = false
      })

      this.rpc = new JsonRpc(
        proc.stdin,
        proc.stdout,
        (msg) => this.handleRequest(msg),
        (msg) => this.handleNotification(msg),
        (line) => this.events.log?.(`非 JSON 输出: ${line.slice(0, 200)}`)
      )
      this.started = true

      const init = (await this.rpc.request(
        'initialize',
        {
          protocolVersion: 1,
          clientInfo: { name: 'grok-build-gui', version: '0.1.0' },
          clientCapabilities: {}
        },
        20000
      )) as {
        _meta?: { agentVersion?: string; modelState?: SessionSnapshot['models'] }
        agentCapabilities?: unknown
      }

      this.agentVersion = init?._meta?.agentVersion ?? null
      this.models = init?._meta?.modelState ?? null

      const auth = (await this.rpc.request('authenticate', { methodId: 'cached_token' }, 15000)) as {
        _meta?: AuthInfo
      }
      this.auth = auth?._meta ?? null
      return { auth: this.auth, agentVersion: this.agentVersion, models: this.models }
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.rejectPermissions()
    this.rpc?.shutdown()
    this.rpc = null
    if (this.proc && !this.proc.killed) {
      this.proc.kill()
    }
    this.proc = null
    this.started = false
    this.sessionId = null
  }

  async listSessions(): Promise<SessionInfo[]> {
    const result = (await this.requireRpc().request('session/list', {}, 15000)) as { sessions?: SessionInfo[] }
    return result.sessions ?? []
  }

  async newSession(opts: { cwd: string; yolo?: boolean; model?: string }): Promise<SessionSnapshot> {
    this.abortTurn()
    this.cwd = opts.cwd
    const result = (await this.requireRpc().request(
      'session/new',
      {
        cwd: opts.cwd,
        mcpServers: [],
        _meta: opts.yolo ? { yoloMode: true } : {}
      },
      30000
    )) as Omit<SessionSnapshot, 'history' | 'cwd'>

    this.sessionId = result.sessionId
    this.models = result.models ?? this.models
    this.configOptions = result.configOptions ?? []

    if (opts.model && opts.model !== result.models?.currentModelId) {
      await this.setConfig('model', opts.model)
    }

    return { ...result, cwd: opts.cwd, history: [] }
  }

  async loadSession(opts: { sessionId: string; cwd: string }): Promise<SessionSnapshot> {
    this.abortTurn()
    this.cwd = opts.cwd
    this.collectingSession = opts.sessionId
    this.collector = []
    try {
      const result = (await this.requireRpc().request(
        'session/load',
        { sessionId: opts.sessionId, cwd: opts.cwd, mcpServers: [] },
        30000
      )) as Omit<SessionSnapshot, 'history' | 'cwd'>
      this.sessionId = opts.sessionId
      this.models = result.models ?? this.models
      this.configOptions = result.configOptions ?? []
      return {
        ...result,
        sessionId: opts.sessionId,
        cwd: opts.cwd,
        history: this.collector ?? []
      }
    } finally {
      this.collectingSession = null
      this.collector = null
    }
  }

  async prompt(text: string): Promise<{ stopReason?: string }> {
    if (!this.sessionId) throw new Error('没有活动会话')
    const result = (await this.requireRpc().request('session/prompt', {
      sessionId: this.sessionId,
      prompt: [{ type: 'text', text }]
    })) as { stopReason?: string }
    return result
  }

  cancel(): void {
    this.abortTurn()
  }

  private abortTurn(): void {
    if (this.sessionId && this.rpc) {
      this.rpc.notify('session/cancel', { sessionId: this.sessionId })
    }
    this.rejectPermissions()
  }

  private rejectPermissions(): void {
    for (const [, resolve] of this.permissionWaiters) {
      resolve({ outcome: { outcome: 'cancelled' } })
    }
    this.permissionWaiters.clear()
  }

  async setConfig(configId: string, value: string): Promise<unknown> {
    if (!this.sessionId) throw new Error('没有活动会话')
    const result = await this.requireRpc().request('session/set_config_option', {
      sessionId: this.sessionId,
      configId,
      value: { value }
    })
    if (Array.isArray(result)) this.configOptions = result as ConfigOption[]
    return result
  }

  resolvePermission(rpcId: number | string, optionId: string | null): void {
    const waiter = this.permissionWaiters.get(rpcId)
    if (!waiter) return
    this.permissionWaiters.delete(rpcId)
    if (!optionId) waiter({ outcome: { outcome: 'cancelled' } })
    else waiter({ outcome: { outcome: 'selected', optionId } })
  }

  private requireRpc(): JsonRpc {
    if (!this.rpc) throw new Error('尚未连接到 grok agent')
    return this.rpc
  }

  private async handleRequest(msg: JsonRpcMessage): Promise<unknown> {
    if (msg.method === 'session/request_permission') {
      const params = (msg.params ?? {}) as {
        sessionId?: string
        toolCall?: Record<string, unknown>
        options?: PermissionRequest['options']
      }
      const rpcId = msg.id as number | string
      return await new Promise((resolve) => {
        this.permissionWaiters.set(rpcId, resolve)
        this.events.permission?.({
          rpcId,
          sessionId: params.sessionId ?? this.sessionId ?? '',
          toolCall: params.toolCall ?? {},
          options: params.options ?? []
        })
      })
    }
    throw new Error(`未实现的客户端方法: ${msg.method}`)
  }

  private handleNotification(msg: JsonRpcMessage): void {
    const params = (msg.params ?? {}) as { sessionId?: string; update?: Record<string, unknown> }
    const update = (params.update ?? params) as Record<string, unknown>
    const sessionId = params.sessionId ?? this.sessionId ?? undefined

    if (this.collector && this.collectingSession && sessionId === this.collectingSession && params.update) {
      this.collector.push(update)
      return
    }

    if (params.update || msg.method === 'session/update' || msg.method === '_x.ai/session/update') {
      this.events.update?.({ sessionId, method: msg.method ?? 'session/update', update })
    }
  }
}

/** 解析 grok 可执行文件路径。 */
export function resolveGrokPath(explicit?: string | null): string {
  if (explicit && existsSync(explicit)) return explicit
  const home = homedir()
  const candidates = [join(home, '.grok', 'bin', 'grok.exe'), join(home, '.grok', 'bin', 'grok')]
  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  return process.platform === 'win32' ? 'grok.exe' : 'grok'
}
