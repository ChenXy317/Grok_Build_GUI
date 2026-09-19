import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readTextFile, writeTextFile } from './client-fs'
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

export type SessionMode = {
  id: string
  name: string
  description?: string
}

export type SessionSnapshot = {
  sessionId: string
  cwd: string
  models?: {
    currentModelId?: string
    availableModels?: { modelId: string; name: string; description?: string; _meta?: Record<string, unknown> }[]
  }
  modes?: {
    currentModeId?: string
    availableModes?: SessionMode[]
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

export type QuestionOption = {
  label: string
  description?: string
  preview?: string
  id?: string
}

export type UserQuestion = {
  question: string
  options: QuestionOption[]
  multiSelect?: boolean
  id?: string
}

export type QuestionRequest = {
  rpcId: number | string
  sessionId: string
  toolCallId?: string
  mode?: string
  questions: UserQuestion[]
}

export type ElicitRequest = {
  rpcId: number | string
  sessionId: string
  toolCallId?: string
  serverName: string
  message: string
  mode: 'form' | 'url'
  requestedSchema?: Record<string, unknown>
  url?: string
  elicitationId?: string
}

export type TrustRequest = {
  rpcId: number | string
  sessionId: string
  cwd: string
  workspace: string
  configKinds: string[]
}

export type PlanGateRequest = {
  rpcId: number | string
  sessionId: string
  toolCallId?: string
  planContent: string
  entries?: { content?: string; status?: string; priority?: string }[]
}

export type RewindPoint = {
  index: number
  title: string
  preview?: string
  createdAt?: string
}

export type PermissionMode = 'ask' | 'auto' | 'always-approve'

export type PromptPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string }

export type AgentCapabilities = {
  loadSession?: boolean
  promptCapabilities?: { image?: boolean; audio?: boolean; embeddedContext?: boolean }
  sessionCapabilities?: { list?: unknown; delete?: unknown }
}

export type SlashCommand = {
  name: string
  description?: string
  input?: { hint?: string }
}

type AcpEvents = {
  update: (payload: { sessionId?: string; method: string; update: Record<string, unknown> }) => void
  permission: (req: PermissionRequest) => void
  question: (req: QuestionRequest) => void
  elicit: (req: ElicitRequest) => void
  trust: (req: TrustRequest) => void
  planGate: (req: PlanGateRequest) => void
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
  private extWaiters = new Map<string | number, (result: unknown) => void>()
  private started = false
  private stopping = false

  sessionId: string | null = null
  cwd = homedir()
  auth: AuthInfo | null = null
  agentVersion: string | null = null
  models: SessionSnapshot['models'] | null = null
  modes: SessionSnapshot['modes'] | null = null
  configOptions: ConfigOption[] = []
  capabilities: AgentCapabilities | null = null
  canDeleteSession = false
  promptImages = false
  contextWindow: number | null = null

  constructor(
    private readonly grokPath: string,
    private readonly events: Partial<AcpEvents> = {}
  ) {}

  async start(): Promise<{
    auth: AuthInfo | null
    agentVersion: string | null
    models: SessionSnapshot['models'] | null
    canDeleteSession: boolean
    promptImages: boolean
    contextWindow: number | null
  }> {
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
          clientInfo: { name: 'grok-build-gui', title: 'Grok Build', version: '0.3.0' },
          clientCapabilities: {
            fs: { readTextFile: true, writeTextFile: true },
            terminal: false,
            elicitation: {},
            _meta: {
              'x.ai/folderTrust': { interactive: true },
              'x.ai/incrementalBashOutput': true
            }
          }
        },
        20000
      )) as {
        _meta?: {
          agentVersion?: string
          modelState?: SessionSnapshot['models']
          totalContextTokens?: number
        }
        agentCapabilities?: AgentCapabilities
      }

      this.agentVersion = init?._meta?.agentVersion ?? null
      this.models = init?._meta?.modelState ?? null
      this.capabilities = init?.agentCapabilities ?? null
      this.canDeleteSession = Boolean(init?.agentCapabilities?.sessionCapabilities?.delete)
      this.promptImages = Boolean(init?.agentCapabilities?.promptCapabilities?.image)
      this.contextWindow = Number(init?._meta?.totalContextTokens) || null

      const auth = (await this.rpc.request('authenticate', { methodId: 'cached_token' }, 15000)) as {
        _meta?: AuthInfo
      }
      this.auth = auth?._meta ?? null
      return {
        auth: this.auth,
        agentVersion: this.agentVersion,
        models: this.models,
        canDeleteSession: this.canDeleteSession,
        promptImages: this.promptImages,
        contextWindow: this.contextWindow
      }
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.rejectPermissions()
    this.rejectExt()
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

  async newSession(opts: {
    cwd: string
    yolo?: boolean
    auto?: boolean
    model?: string
  }): Promise<SessionSnapshot> {
    this.abortTurn()
    this.cwd = opts.cwd
    const meta: Record<string, unknown> = {}
    if (opts.yolo) meta.yoloMode = true
    else if (opts.auto) meta.autoMode = true
    const result = (await this.requireRpc().request(
      'session/new',
      {
        cwd: opts.cwd,
        mcpServers: [],
        _meta: meta
      },
      30000
    )) as Omit<SessionSnapshot, 'history' | 'cwd'>

    this.sessionId = result.sessionId
    this.models = result.models ?? this.models
    this.modes = result.modes ?? this.modes
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
      this.modes = result.modes ?? this.modes
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

  async prompt(parts: PromptPart[]): Promise<{ stopReason?: string }> {
    if (!this.sessionId) throw new Error('没有活动会话')
    const prompt = parts.length ? parts : [{ type: 'text' as const, text: '' }]
    const result = (await this.requireRpc().request('session/prompt', {
      sessionId: this.sessionId,
      prompt
    })) as { stopReason?: string }
    return result
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.requireRpc().request('session/delete', { sessionId }, 8000)
    if (this.sessionId === sessionId) this.sessionId = null
  }

  cancel(): void {
    this.abortTurn()
  }

  private abortTurn(): void {
    if (this.sessionId && this.rpc) {
      this.rpc.notify('session/cancel', { sessionId: this.sessionId })
    }
    this.rejectPermissions()
    this.rejectExt()
  }

  private rejectPermissions(): void {
    for (const [, resolve] of this.permissionWaiters) {
      resolve({ outcome: { outcome: 'cancelled' } })
    }
    this.permissionWaiters.clear()
  }

  private rejectExt(): void {
    for (const [, resolve] of this.extWaiters) {
      resolve({ outcome: 'cancelled' })
    }
    this.extWaiters.clear()
  }

  /** 先试 x.ai/*，失败再试 _x.ai/*。 */
  private async ext(method: string, params?: unknown, timeoutMs = 15000): Promise<unknown> {
    const names = method.startsWith('x.ai/') ? [method, `_${method}`] : [method]
    let last: unknown
    for (const name of names) {
      try {
        return await this.requireRpc().request(name, params ?? {}, timeoutMs)
      } catch (error) {
        last = error
        const message = error instanceof Error ? error.message : String(error)
        if (!/not found|unknown method|未实现|Method not found|-32601/i.test(message)) throw error
      }
    }
    throw last instanceof Error ? last : new Error(String(last ?? `${method} 不可用`))
  }

  async setMode(modeId: string): Promise<unknown> {
    if (!this.sessionId) throw new Error('没有活动会话')
    const result = await this.requireRpc().request(
      'session/set_mode',
      { sessionId: this.sessionId, modeId },
      8000
    )
    this.modes = { ...(this.modes ?? {}), currentModeId: modeId }
    return result
  }

  async togglePlanMode(enabled?: boolean): Promise<unknown> {
    if (!this.sessionId) throw new Error('没有活动会话')
    return await this.ext('x.ai/toggle_plan_mode', {
      sessionId: this.sessionId,
      ...(enabled == null ? {} : { enabled })
    })
  }

  async compactConversation(context?: string): Promise<unknown> {
    if (!this.sessionId) throw new Error('没有活动会话')
    return await this.ext(
      'x.ai/compact_conversation',
      { sessionId: this.sessionId, ...(context ? { context } : {}) },
      120000
    )
  }

  async rewindPoints(): Promise<RewindPoint[]> {
    if (!this.sessionId) throw new Error('没有活动会话')
    const result = await this.ext('x.ai/rewind/points', { sessionId: this.sessionId })
    return normalizeRewindPoints(result)
  }

  async rewindExecute(targetPromptIndex: number, restoreFiles = false): Promise<unknown> {
    if (!this.sessionId) throw new Error('没有活动会话')
    return await this.ext('x.ai/rewind/execute', {
      sessionId: this.sessionId,
      targetPromptIndex,
      restoreFiles
    })
  }

  async promptHistory(): Promise<string[]> {
    const result = await this.ext('x.ai/prompt_history', {
      sessionId: this.sessionId,
      filterSessionId: this.sessionId
    })
    return normalizePromptHistory(result)
  }

  async forkSession(): Promise<SessionSnapshot> {
    if (!this.sessionId) throw new Error('没有活动会话')
    const cwd = this.cwd
    const result = (await this.ext('x.ai/session/fork', {
      sessionId: this.sessionId,
      sourceSessionId: this.sessionId
    })) as Record<string, unknown>
    const sessionId = String(result.sessionId ?? result.newSessionId ?? '')
    if (!sessionId) throw new Error('fork 未返回会话 ID')
    return await this.loadSession({ sessionId, cwd })
  }

  async renameSessionTitle(sessionId: string, title: string): Promise<unknown> {
    return await this.ext('x.ai/session/rename', { sessionId, title })
  }

  async sessionInfo(): Promise<Record<string, unknown> | null> {
    if (!this.sessionId) return null
    try {
      return (await this.ext('x.ai/session/info', { sessionId: this.sessionId })) as Record<
        string,
        unknown
      >
    } catch {
      return null
    }
  }

  resolveExt(rpcId: number | string, result: unknown): void {
    const waiter = this.extWaiters.get(rpcId)
    if (!waiter) return
    this.extWaiters.delete(rpcId)
    waiter(result)
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

  private waitExt(rpcId: number | string): Promise<unknown> {
    return new Promise((resolve) => this.extWaiters.set(rpcId, resolve))
  }

  private async handleRequest(msg: JsonRpcMessage): Promise<unknown> {
    const method = String(msg.method ?? '')
    const bare = method.startsWith('_') ? method.slice(1) : method
    const rpcId = msg.id as number | string
    const params = (msg.params ?? {}) as Record<string, unknown>

    if (bare === 'session/request_permission') {
      return await new Promise((resolve) => {
        this.permissionWaiters.set(rpcId, resolve)
        this.events.permission?.({
          rpcId,
          sessionId: String(params.sessionId ?? this.sessionId ?? ''),
          toolCall: (params.toolCall as Record<string, unknown>) ?? {},
          options: (params.options as PermissionRequest['options']) ?? []
        })
      })
    }
    if (bare === 'fs/read_text_file') {
      return readTextFile(String(params.path ?? ''), params.line as number | undefined, params.limit as number | undefined)
    }
    if (bare === 'fs/write_text_file') {
      const grokHome = process.env.GROK_HOME || join(homedir(), '.grok')
      return writeTextFile(String(params.path ?? ''), String(params.content ?? ''), [this.cwd, grokHome])
    }
    if (bare === 'x.ai/ask_user_question') {
      const req = parseQuestionRequest(rpcId, params, this.sessionId)
      const pending = this.waitExt(rpcId)
      this.events.question?.(req)
      return await pending
    }
    if (bare === 'x.ai/mcp/elicit') {
      const req = parseElicitRequest(rpcId, params, this.sessionId)
      const pending = this.waitExt(rpcId)
      this.events.elicit?.(req)
      return await pending
    }
    if (bare === 'x.ai/folder_trust/request') {
      const req: TrustRequest = {
        rpcId,
        sessionId: String(params.sessionId ?? this.sessionId ?? ''),
        cwd: String(params.cwd ?? this.cwd),
        workspace: String(params.workspace ?? params.cwd ?? this.cwd),
        configKinds: Array.isArray(params.configKinds)
          ? params.configKinds.map((item) => String(item))
          : []
      }
      const pending = this.waitExt(rpcId)
      this.events.trust?.(req)
      return await pending
    }
    if (bare === 'x.ai/exit_plan_mode') {
      const req: PlanGateRequest = {
        rpcId,
        sessionId: String(params.sessionId ?? this.sessionId ?? ''),
        toolCallId: params.toolCallId ? String(params.toolCallId) : undefined,
        planContent: String(params.planContent ?? params.plan_content ?? ''),
        entries: Array.isArray(params.entries)
          ? (params.entries as PlanGateRequest['entries'])
          : undefined
      }
      const pending = this.waitExt(rpcId)
      this.events.planGate?.(req)
      return await pending
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

    if (String(update.sessionUpdate ?? '') === 'current_mode_update') {
      const modeId = String(update.currentModeId ?? '')
      if (modeId) this.modes = { ...(this.modes ?? {}), currentModeId: modeId }
    }

    if (
      params.update ||
      msg.method === 'session/update' ||
      msg.method === '_x.ai/session/update' ||
      msg.method === 'x.ai/session/update'
    ) {
      this.events.update?.({ sessionId, method: msg.method ?? 'session/update', update })
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function parseQuestionRequest(
  rpcId: number | string,
  params: Record<string, unknown>,
  fallbackSession: string | null
): QuestionRequest {
  const raw = Array.isArray(params.questions) ? params.questions : params.question ? [params] : []
  const questions: UserQuestion[] = raw.map((item) => {
    const rec = asRecord(item)
    const optionsRaw = rec.options ?? rec.choices ?? []
    const options = Array.isArray(optionsRaw)
      ? optionsRaw.map((opt) => {
          if (typeof opt === 'string') return { label: opt }
          const o = asRecord(opt)
          return {
            label: String(o.label ?? o.name ?? o.value ?? ''),
            description: o.description ? String(o.description) : undefined,
            preview: o.preview ? String(o.preview) : undefined,
            id: o.id ? String(o.id) : undefined
          }
        })
      : []
    return {
      question: String(rec.question ?? rec.prompt ?? rec.text ?? ''),
      options,
      multiSelect: Boolean(rec.multiSelect ?? rec.multi_select),
      id: rec.id ? String(rec.id) : undefined
    }
  }).filter((item) => item.question)
  return {
    rpcId,
    sessionId: String(params.sessionId ?? fallbackSession ?? ''),
    toolCallId: params.toolCallId ? String(params.toolCallId) : undefined,
    mode: params.mode ? String(params.mode) : undefined,
    questions
  }
}

function parseElicitRequest(
  rpcId: number | string,
  params: Record<string, unknown>,
  fallbackSession: string | null
): ElicitRequest {
  const mode = String(params.mode ?? 'form') === 'url' ? 'url' : 'form'
  return {
    rpcId,
    sessionId: String(params.sessionId ?? fallbackSession ?? ''),
    toolCallId: params.toolCallId ? String(params.toolCallId) : undefined,
    serverName: String(params.serverName ?? params.server_name ?? 'MCP'),
    message: String(params.message ?? ''),
    mode,
    requestedSchema: asRecord(params.requestedSchema ?? params.requested_schema),
    url: params.url ? String(params.url) : undefined,
    elicitationId: params.elicitationId ? String(params.elicitationId) : undefined
  }
}

function normalizeRewindPoints(result: unknown): RewindPoint[] {
  const rec = asRecord(result)
  const list = Array.isArray(result)
    ? result
    : Array.isArray(rec.points)
      ? rec.points
      : Array.isArray(rec.rewindPoints)
        ? rec.rewindPoints
        : []
  return list.map((item, index) => {
    const row = asRecord(item)
    return {
      index: Number(row.index ?? row.targetPromptIndex ?? row.promptIndex ?? index),
      title: String(row.title ?? row.prompt ?? row.text ?? row.preview ?? `回合 ${index + 1}`),
      preview: row.preview ? String(row.preview) : row.text ? String(row.text) : undefined,
      createdAt: row.createdAt ? String(row.createdAt) : row.updatedAt ? String(row.updatedAt) : undefined
    }
  })
}

function normalizePromptHistory(result: unknown): string[] {
  const rec = asRecord(result)
  const list = Array.isArray(result)
    ? result
    : Array.isArray(rec.prompts)
      ? rec.prompts
      : Array.isArray(rec.items)
        ? rec.items
        : []
  return list
    .map((item) => {
      if (typeof item === 'string') return item
      const row = asRecord(item)
      return String(row.text ?? row.prompt ?? row.content ?? '')
    })
    .filter((item) => item.trim())
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
