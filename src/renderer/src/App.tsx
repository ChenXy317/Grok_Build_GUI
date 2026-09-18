import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Chat from './Chat'
import Composer from './Composer'
import PermissionModal from './PermissionModal'
import Sidebar from './Sidebar'
import { applyHistory, applyUpdate, folderName, type Block } from './blocks'
import type {
  AppSettings,
  AuthInfo,
  PermissionRequest,
  SessionInfo,
  SessionSnapshot
} from '../../preload/index.d'

type Phase = 'boot' | 'setup' | 'ready' | 'error'

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot')
  const [error, setError] = useState('')
  const [grokPath, setGrokPath] = useState('')
  const [auth, setAuth] = useState<AuthInfo | null>(null)
  const [agentVersion, setAgentVersion] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [filter, setFilter] = useState('')
  const [cwd, setCwd] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [permission, setPermission] = useState<PermissionRequest | null>(null)
  const [models, setModels] = useState<{ modelId: string; name: string }[]>([])
  const [model, setModel] = useState('grok-4.6')
  const [effort, setEffort] = useState('')
  const [effortOptions, setEffortOptions] = useState<{ value: string; name: string }[]>([])
  const [yolo, setYolo] = useState(false)
  const [showThinking, setShowThinking] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const sessionRef = useRef<string | null>(null)
  const thinkingRef = useRef(true)

  const applySnapshot = useCallback((snap: SessionSnapshot, thinking: boolean) => {
    sessionRef.current = snap.sessionId
    setSessionId(snap.sessionId)
    setCwd(snap.cwd)
    setBlocks(applyHistory(snap.history ?? [], thinking))
    const available = snap.models?.availableModels ?? []
    if (available.length) setModels(available.map((m) => ({ modelId: m.modelId, name: m.name })))
    if (snap.models?.currentModelId) setModel(snap.models.currentModelId)
    const effortOpt = snap.configOptions?.find((item) => item.id === 'reasoning_effort')
    if (effortOpt) {
      setEffortOptions((effortOpt.options ?? []).map((item) => ({ value: String(item.value), name: item.name })))
      setEffort(String(effortOpt.currentValue ?? ''))
    }
  }, [])

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await window.grok.listSessions())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const boot = useCallback(async () => {
    setPhase('boot')
    setError('')
    const result = await window.grok.start()
    setGrokPath(result.grokPath)
    setSettings(result.settings)
    setYolo(result.settings.yolo)
    setShowThinking(result.settings.showThinking)
    thinkingRef.current = result.settings.showThinking
    setCwd(result.settings.lastCwd)
    if (result.settings.model) setModel(result.settings.model)
    if (result.models?.availableModels) {
      setModels(result.models.availableModels.map((m) => ({ modelId: m.modelId, name: m.name })))
      if (result.models.currentModelId) setModel(result.models.currentModelId)
    }
    if (!result.ok) {
      setError(result.error || '无法启动 grok agent')
      setPhase('setup')
      return
    }
    setAuth(result.auth)
    setAgentVersion(result.agentVersion)
    setPhase('ready')
    await refreshSessions()
  }, [refreshSessions])

  useEffect(() => {
    void boot()
  }, [boot])

  useEffect(() => {
    const offUpdate = window.grok.on('session-update', (payload) => {
      const data = payload as { sessionId?: string; update: Record<string, unknown> }
      if (data.sessionId && sessionRef.current && data.sessionId !== sessionRef.current) return
      setBlocks((prev) => applyUpdate(prev, data.update, thinkingRef.current))
    })
    const offPerm = window.grok.on('permission', (payload) => {
      setPermission(payload as PermissionRequest)
    })
    const offExit = window.grok.on('agent-exit', (payload) => {
      const info = payload as { code: number | null; stderr: string }
      setStreaming(false)
      setError(`grok agent 已退出${info.code != null ? `（${info.code}）` : ''}${info.stderr ? `\n${info.stderr}` : ''}`)
      setPhase('error')
    })
    return () => {
      offUpdate()
      offPerm()
      offExit()
    }
  }, [showThinking])

  const newSession = async (nextCwd = cwd) => {
    if (!nextCwd) return
    setStreaming(false)
    setPermission(null)
    const snap = await window.grok.newSession({ cwd: nextCwd, yolo, model })
    applySnapshot(snap, showThinking)
    await refreshSessions()
  }

  const openProject = async () => {
    const folder = await window.grok.pickFolder()
    if (!folder) return
    setCwd(folder)
    await newSession(folder)
  }

  const loadSession = async (session: SessionInfo) => {
    if (!session.cwd) return
    setStreaming(false)
    setPermission(null)
    const snap = await window.grok.loadSession({ sessionId: session.sessionId, cwd: session.cwd })
    applySnapshot(snap, showThinking)
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || streaming) return
    if (!sessionId) await newSession()
    setDraft('')
    setStreaming(true)
    try {
      await window.grok.prompt(text)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStreaming(false)
      await refreshSessions()
    }
  }

  const attachFiles = async () => {
    const files = await window.grok.pickFiles()
    if (!files.length) return
    const chips = files.map((f) => `@${f}`).join(' ')
    setDraft((prev) => (prev ? `${prev} ${chips}` : chips))
  }

  const changeModel = async (value: string) => {
    setModel(value)
    if (sessionId) await window.grok.setConfig('model', value)
    await window.grok.setSettings({ model: value })
  }

  const changeEffort = async (value: string) => {
    setEffort(value)
    if (sessionId) await window.grok.setConfig('reasoning_effort', value)
  }

  const toggleYolo = async (value: boolean) => {
    setYolo(value)
    await window.grok.setSettings({ yolo: value })
  }

  const headerCwd = useMemo(() => (cwd ? folderName(cwd) : '未选择项目'), [cwd])

  if (phase === 'boot') {
    return (
      <div className="app">
        <TitleBar />
        <div className="splash">
          <Logo />
          <h1>Grok Build</h1>
          <p>正在连接本地 grok agent…</p>
        </div>
      </div>
    )
  }

  if (phase === 'setup' || phase === 'error') {
    return (
      <div className="app">
        <TitleBar />
        <div className="splash">
          <Logo />
          <h1>Grok Build</h1>
          <p className="error-text">{error || '未找到 Grok CLI'}</p>
          <p className="muted">当前路径：{grokPath || '（空）'}</p>
          <div className="splash-actions">
            <button
              className="btn primary"
              onClick={async () => {
                const picked = await window.grok.pickGrok()
                if (!picked) return
                await window.grok.setSettings({ grokPath: picked })
                await boot()
              }}
            >
              选择 grok.exe
            </button>
            <button className="btn" onClick={() => void boot()}>
              重试
            </button>
          </div>
          <p className="hint">若尚未安装 CLI，可在 PowerShell 执行：irm https://x.ai/cli/install.ps1 | iex</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <TitleBar
        subtitle={sessionId ? headerCwd : '桌面客户端'}
        right={
          <button className="ghost" onClick={() => setSettingsOpen(true)}>
            设置
          </button>
        }
      />
      <div className="shell">
        <Sidebar
          sessions={sessions}
          cwd={cwd}
          sessionId={sessionId}
          filter={filter}
          onFilter={setFilter}
          onSelect={(s) => void loadSession(s)}
          onNew={() => void newSession()}
          onOpenProject={() => void openProject()}
        />
        <main className="main">
          <div className="toolbar">
            <button className="cwd" title={cwd} onClick={() => cwd && window.grok.openPath(cwd)}>
              {cwd || '选择一个项目目录以开始'}
            </button>
            <label>
              模型
              <select value={model} onChange={(e) => void changeModel(e.target.value)}>
                {(models.length ? models : [{ modelId: model, name: model }]).map((item) => (
                  <option key={item.modelId} value={item.modelId}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {effortOptions.length ? (
              <label>
                推理
                <select value={effort} onChange={(e) => void changeEffort(e.target.value)}>
                  {effortOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="check">
              <input type="checkbox" checked={yolo} onChange={(e) => void toggleYolo(e.target.checked)} />
              新会话始终批准
            </label>
          </div>
          <Chat
            blocks={blocks}
            streaming={streaming}
            emptyHint={cwd ? '给 Grok Build 下一条任务。它会读代码、改文件、跑命令。' : '先打开一个项目目录。'}
          />
          <Composer
            draft={draft}
            setDraft={setDraft}
            streaming={streaming}
            disabled={!cwd}
            onSend={() => void send()}
            onStop={() => {
              void window.grok.cancel()
              setStreaming(false)
            }}
            onAttach={() => void attachFiles()}
          />
          <footer className="status">
            <span>{auth?.email ?? '已登录'}</span>
            <span>{auth?.subscription_tier ?? ''}</span>
            <span>{agentVersion ? `agent ${agentVersion}` : ''}</span>
            <span>{sessionId ? sessionId.slice(0, 8) : '无会话'}</span>
          </footer>
        </main>
      </div>
      {permission ? (
        <PermissionModal
          request={permission}
          onChoose={(optionId) => {
            void window.grok.respondPermission(permission.rpcId, optionId)
            setPermission(null)
          }}
        />
      ) : null}
      {settingsOpen && settings ? (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-kicker">设置</div>
            <h2>Grok Build GUI</h2>
            <label className="field">
              grok 路径
              <input value={grokPath} readOnly />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={showThinking}
                onChange={async (e) => {
                  thinkingRef.current = e.target.checked
                  setShowThinking(e.target.checked)
                  await window.grok.setSettings({ showThinking: e.target.checked })
                }}
              />
              显示思考过程
            </label>
            <p className="hint">同一会话请不要同时在 TUI 和本 GUI 中打开。</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setSettingsOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TitleBar({ subtitle, right }: { subtitle?: string; right?: ReactNode }) {
  return (
    <header className="titlebar">
      <div className="title-left">
        <Logo small />
        <strong>Grok Build</strong>
        {subtitle ? <span className="muted">{subtitle}</span> : null}
      </div>
      <div className="title-right">{right}</div>
    </header>
  )
}

function Logo({ small }: { small?: boolean }) {
  return (
    <svg className={`logo ${small ? 'small' : ''}`} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1b1224" />
      <path d="M9 16c0-4 3.2-7 7.2-7 2.8 0 5.2 1.4 6.4 3.5L20 14c-.7-1.2-2-2-3.6-2-2.3 0-4 1.7-4 4s1.7 4 4 4c1.6 0 3-.8 3.6-2l2.6 1.5C21.4 21.6 19 23 16.2 23 12.2 23 9 20 9 16Z" fill="#e879f9" />
      <circle cx="22.2" cy="16" r="1.6" fill="#f5d0fe" />
    </svg>
  )
}
