import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import Chat from './Chat'
import Composer, { type ImagePart } from './Composer'
import PermissionModal from './PermissionModal'
import SettingsModal from './SettingsModal'
import Sidebar from './Sidebar'
import {
  applyHistory,
  applyUpdate,
  folderName,
  formatAtPath,
  latestSession,
  type Block
} from './blocks'
import { mergeCommands, parseSlash } from './commands'
import { blocksToMarkdown, formatTokens, lastAssistant } from './export'
import type {
  AppSettings,
  AuthInfo,
  ConfigOption,
  PermissionRequest,
  PromptPart,
  SessionInfo,
  SessionSnapshot,
  SessionUsage,
  SlashCommand
} from '../../preload/index.d'

type Phase = 'boot' | 'setup' | 'ready'

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function waitQuiet(pending: Promise<unknown> | null): Promise<void> {
  if (!pending) return
  try {
    await pending
  } catch {
    /* cancelled or superseded */
  }
}

function allowOptionId(req: PermissionRequest): string | null {
  const options = req.options ?? []
  const kindOf = (item: { kind?: string }) => String(item.kind ?? '')
  const match =
    options.find((item) => kindOf(item) === 'allow_once') ??
    options.find((item) => kindOf(item).startsWith('allow') && kindOf(item) !== 'allow_always') ??
    options.find((item) => kindOf(item).startsWith('allow')) ??
    options.find((item) => !kindOf(item).startsWith('reject')) ??
    options[0]
  return match?.optionId ?? null
}

async function usableDir(path?: string | null): Promise<string | null> {
  if (!path) return null
  const kind = await window.grok.pathKind(path)
  return kind === 'dir' ? path : null
}

function fileToBase64(bytes: Uint8Array): string {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(bin)
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot')
  const [error, setError] = useState('')
  const [grokPath, setGrokPath] = useState('')
  const [auth, setAuth] = useState<AuthInfo | null>(null)
  const [agentVersion, setAgentVersion] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [recentCwds, setRecentCwds] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [cwd, setCwd] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [draft, setDraft] = useState('')
  const [images, setImages] = useState<ImagePart[]>([])
  const [queue, setQueue] = useState<string[]>([])
  const [streaming, setStreaming] = useState(false)
  const [permission, setPermission] = useState<PermissionRequest | null>(null)
  const [models, setModels] = useState<{ modelId: string; name: string }[]>([])
  const [model, setModel] = useState('grok-4.6')
  const [effort, setEffort] = useState('')
  const [effortOptions, setEffortOptions] = useState<{ value: string; name: string }[]>([])
  const [yolo, setYolo] = useState(true)
  const [showThinking, setShowThinking] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [disconnected, setDisconnected] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [findOpen, setFindOpen] = useState(false)
  const [find, setFind] = useState('')
  const [agentCommands, setAgentCommands] = useState<SlashCommand[]>([])
  const [usage, setUsage] = useState<SessionUsage | null>(null)
  const [stopReason, setStopReason] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [compactUi, setCompactUi] = useState(false)
  const [fontScale, setFontScale] = useState(1)
  const [promptImages, setPromptImages] = useState(false)

  const sessionRef = useRef<string | null>(null)
  const sendingRef = useRef(false)
  const promptGen = useRef(0)
  const promptWaitRef = useRef<Promise<unknown> | null>(null)
  const sessionWaitRef = useRef<Promise<unknown> | null>(null)
  const cwdRef = useRef('')
  const yoloRef = useRef(true)
  const promptImagesRef = useRef(false)
  const modelRef = useRef(model)
  const draftRef = useRef('')
  const imagesRef = useRef<ImagePart[]>([])
  const queueRef = useRef<string[]>([])
  const draftsRef = useRef<Record<string, string>>({})
  const dragDepth = useRef(0)
  const blocksRef = useRef<Block[]>([])

  cwdRef.current = cwd
  yoloRef.current = yolo
  promptImagesRef.current = promptImages
  modelRef.current = model
  draftRef.current = draft
  imagesRef.current = images
  queueRef.current = queue
  blocksRef.current = blocks

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(fontScale))
  }, [fontScale])

  const commands = useMemo(() => mergeCommands(agentCommands), [agentCommands])

  const applyConfig = useCallback((options?: ConfigOption[]) => {
    if (!options?.length) return
    const effortOpt = options.find((item) => item.id === 'reasoning_effort')
    if (effortOpt) {
      setEffortOptions((effortOpt.options ?? []).map((item) => ({ value: String(item.value), name: item.name })))
      setEffort(String(effortOpt.currentValue ?? ''))
    }
  }, [])

  const applySnapshot = useCallback(
    (snap: SessionSnapshot) => {
      const prev = sessionRef.current
      if (prev) draftsRef.current[prev] = draftRef.current
      sessionRef.current = snap.sessionId
      setSessionId(snap.sessionId)
      setCwd(snap.cwd)
      setBlocks(applyHistory(snap.history ?? []))
      setDraft(draftsRef.current[snap.sessionId] ?? '')
      setImages([])
      setQueue([])
      setStopReason('')
      setAgentCommands([])
      const available = snap.models?.availableModels ?? []
      if (available.length) setModels(available.map((m) => ({ modelId: m.modelId, name: m.name })))
      if (snap.models?.currentModelId) setModel(snap.models.currentModelId)
      applyConfig(snap.configOptions)
    },
    [applyConfig]
  )

  const pullSettings = useCallback(async () => {
    const next = await window.grok.getSettings()
    setSettings(next)
    setRecentCwds(next.recentCwds ?? [])
    setSidebarCollapsed(Boolean(next.sidebarCollapsed))
    setCompactUi(Boolean(next.compactUi))
    setFontScale(next.fontScale || 1)
    return next
  }, [])

  const refreshSessions = useCallback(async () => {
    try {
      const list = await window.grok.listSessions()
      setSessions(list)
      return list
    } catch (err) {
      setError(errText(err))
      return [] as SessionInfo[]
    }
  }, [])

  const refreshUsage = useCallback(async (id?: string | null) => {
    if (!id) return
    try {
      setUsage(await window.grok.sessionUsage(id))
    } catch {
      /* optional */
    }
  }, [])

  const abortUiTurn = useCallback(async () => {
    promptGen.current += 1
    setPermission(null)
    setQueue([])
    queueRef.current = []
    try {
      await window.grok.cancel()
    } catch {
      /* cancel is best-effort */
    }
    await waitQuiet(promptWaitRef.current)
    await waitQuiet(sessionWaitRef.current)
    promptWaitRef.current = null
    sessionWaitRef.current = null
    sendingRef.current = false
    setStreaming(false)
  }, [])

  const newSession = useCallback(
    async (nextCwd = cwdRef.current) => {
      if (!nextCwd) return false
      try {
        await abortUiTurn()
        const op = window.grok.newSession({ cwd: nextCwd, yolo: yoloRef.current, model: modelRef.current })
        sessionWaitRef.current = op
        const snap = await op
        applySnapshot(snap)
        await refreshSessions()
        await pullSettings()
        return true
      } catch (err) {
        setError(errText(err))
        return false
      } finally {
        sessionWaitRef.current = null
      }
    },
    [abortUiTurn, applySnapshot, pullSettings, refreshSessions]
  )

  const loadSession = useCallback(
    async (session: SessionInfo) => {
      if (!session.cwd) return false
      try {
        await abortUiTurn()
        const op = window.grok.loadSession({ sessionId: session.sessionId, cwd: session.cwd })
        sessionWaitRef.current = op
        const snap = await op
        applySnapshot(snap)
        await pullSettings()
        await refreshUsage(session.sessionId)
        return true
      } catch (err) {
        setError(errText(err))
        return false
      } finally {
        sessionWaitRef.current = null
      }
    },
    [abortUiTurn, applySnapshot, pullSettings, refreshUsage]
  )

  const openWorkspace = useCallback(
    async (folder: string) => {
      const dir = await usableDir(folder)
      if (!dir) {
        setError(`找不到项目目录：${folder}`)
        return
      }
      setCwd(dir)
      cwdRef.current = dir
      const sessionsList = await refreshSessions()
      const existing = latestSession(sessionsList, dir)
      if (existing?.cwd) {
        if (await loadSession(existing)) return
      }
      await newSession(dir)
    },
    [loadSession, newSession, refreshSessions]
  )

  const openProject = useCallback(async () => {
    try {
      const folder = await window.grok.pickFolder()
      if (!folder) return
      await openWorkspace(folder)
    } catch (err) {
      setError(errText(err))
    }
  }, [openWorkspace])

  const connect = useCallback(
    async (opts?: { splash?: boolean; restore?: boolean }) => {
      const splash = opts?.splash !== false
      const restore = opts?.restore !== false
      if (splash) {
        setPhase('boot')
        setDisconnected(false)
      }
      setError('')
      setRestoring(false)
      const keepId = sessionRef.current
      const keepCwd = cwdRef.current
      const result = await window.grok.start()
      setGrokPath(result.grokPath)
      setSettings(result.settings)
      setYolo(result.settings.yolo)
      setShowThinking(result.settings.showThinking)
      setRecentCwds(result.settings.recentCwds ?? [])
      setSidebarCollapsed(Boolean(result.settings.sidebarCollapsed))
      setCompactUi(Boolean(result.settings.compactUi))
      setFontScale(result.settings.fontScale || 1)
      if (result.settings.model) setModel(result.settings.model)
      if (result.models?.availableModels) {
        setModels(result.models.availableModels.map((m) => ({ modelId: m.modelId, name: m.name })))
        if (result.models.currentModelId) setModel(result.models.currentModelId)
      }
      if (!result.ok) {
        setPromptImages(false)
        promptImagesRef.current = false
        setError(result.error || '无法启动 grok agent')
        if (splash) setPhase('setup')
        else setDisconnected(true)
        return
      }
      setAuth(result.auth)
      setAgentVersion(result.agentVersion)
      setPromptImages(Boolean(result.promptImages))
      promptImagesRef.current = Boolean(result.promptImages)
      setDisconnected(false)
      setPhase('ready')
      const startupFolder = await window.grok.takeOpenFolder()
      if (startupFolder) {
        await openWorkspace(startupFolder)
        return
      }
      const list = await refreshSessions()
      if (!restore) return
      setRestoring(true)
      try {
        if (!splash && keepId && keepCwd) {
          const existing = list.find((item) => item.sessionId === keepId)
          if (existing?.cwd) {
            await loadSession(existing)
            return
          }
        }
        const remembered = latestSession(list, undefined, result.settings.lastSessionId)
        const rememberedCwd = await usableDir(remembered?.cwd)
        if (remembered && rememberedCwd && (await loadSession({ ...remembered, cwd: rememberedCwd }))) {
          return
        }
        const lastCwd = await usableDir(result.settings.lastCwd)
        if (lastCwd) {
          const existing = latestSession(list, lastCwd)
          if (existing?.cwd && (await loadSession(existing))) return
          setCwd(lastCwd)
          cwdRef.current = lastCwd
        }
      } catch (err) {
        setError(errText(err))
      } finally {
        setRestoring(false)
      }
    },
    [loadSession, openWorkspace, refreshSessions]
  )

  useEffect(() => {
    void connect({ splash: true, restore: true })
  }, [connect])

  useEffect(() => {
    const offUpdate = window.grok.on('session-update', (payload) => {
      const data = payload as { sessionId?: string; update: Record<string, unknown> }
      if (data.sessionId && sessionRef.current && data.sessionId !== sessionRef.current) return
      const update = data.update ?? {}
      const kind = String(update.sessionUpdate ?? '')
      if (kind === 'available_commands_update') {
        setAgentCommands((update.availableCommands as SlashCommand[]) ?? [])
        return
      }
      if (kind === 'config_option_update') {
        applyConfig((update.configOptions as ConfigOption[]) ?? [])
        return
      }
      if (kind === 'session_info_update') {
        void refreshSessions()
        return
      }
      if (kind === 'usage_update') {
        setUsage({
          inputTokens: Number(update.used ?? update.inputTokens) || undefined,
          totalTokens: Number(update.size ?? update.totalTokens) || undefined
        })
        return
      }
      setBlocks((prev) => applyUpdate(prev, update))
    })
    const offPerm = window.grok.on('permission', (payload) => {
      const req = payload as PermissionRequest
      if (req.sessionId && sessionRef.current && req.sessionId !== sessionRef.current) {
        void window.grok.respondPermission(req.rpcId, null)
        return
      }
      if (yoloRef.current) {
        void window.grok.respondPermission(req.rpcId, allowOptionId(req))
        return
      }
      setPermission(req)
    })
    const offExit = window.grok.on('agent-exit', (payload) => {
      const info = payload as { code: number | null; stderr: string }
      sendingRef.current = false
      promptWaitRef.current = null
      setStreaming(false)
      setDisconnected(true)
      setError(`grok agent 已退出${info.code != null ? `（${info.code}）` : ''}${info.stderr ? `\n${info.stderr}` : ''}`)
    })
    const offLog = window.grok.on('agent-log', (payload) => {
      const line = String(payload)
      setLogs((prev) => [...prev.slice(-180), line])
    })
    const offFolder = window.grok.on('open-folder', (payload) => {
      const folder = String(payload || '')
      if (folder) void openWorkspace(folder)
    })
    return () => {
      offUpdate()
      offPerm()
      offExit()
      offLog()
      offFolder()
    }
  }, [applyConfig, openWorkspace, refreshSessions])

  const attachPaths = (files: string[]) => {
    if (!files.length) return
    const chips = files.map(formatAtPath).join(' ')
    setDraft((prev) => (prev ? `${prev} ${chips}` : chips))
  }

  const addFiles = async (files: File[]) => {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        if (!promptImagesRef.current) {
          try {
            const path = window.grok.getPathForFile(file)
            if (path) attachPaths([path])
            else setError('当前 agent 不支持粘贴图片')
          } catch {
            setError('当前 agent 不支持粘贴图片')
          }
          continue
        }
        if (file.size > 4_000_000) {
          setError('图片超过 4MB')
          continue
        }
        const data = fileToBase64(new Uint8Array(await file.arrayBuffer()))
        setImages((prev) => [...prev, { mimeType: file.type || 'image/png', data, name: file.name || 'image.png' }])
        continue
      }
      try {
        const path = window.grok.getPathForFile(file)
        if (path) attachPaths([path])
      } catch {
        /* ignore */
      }
    }
  }

  const sendText = async (text: string, gen: number, extraImages: ImagePart[] = []) => {
    setError('')
    setStopReason('')
    setStreaming(true)
    sendingRef.current = true
    try {
      let folder = cwdRef.current
      if (!folder) {
        folder = (await window.grok.pickFolder()) ?? ''
        if (!folder) return
        setCwd(folder)
        cwdRef.current = folder
      }
      if (!sessionRef.current) {
        const list = await refreshSessions()
        const existing = latestSession(list, folder)
        const op = existing?.cwd
          ? window.grok.loadSession({ sessionId: existing.sessionId, cwd: existing.cwd })
          : window.grok.newSession({ cwd: folder, yolo: yoloRef.current, model: modelRef.current })
        sessionWaitRef.current = op
        const snap = await op
        if (promptGen.current !== gen) return
        sessionWaitRef.current = null
        applySnapshot(snap)
        await refreshSessions()
        await pullSettings()
      }
      if (promptGen.current !== gen) return
      if (text) {
        setBlocks((prev) => {
          const last = prev[prev.length - 1]
          if (last?.type === 'user' && last.text === text) {
            return last.pending ? prev : [...prev.slice(0, -1), { ...last, pending: true }]
          }
          return [...prev, { id: `u-${gen}-${Date.now()}`, type: 'user', text, pending: true }]
        })
      }
      const parts: PromptPart[] = []
      if (text) parts.push({ type: 'text', text })
      const imagesToSend = promptImagesRef.current ? extraImages : []
      if (extraImages.length && !promptImagesRef.current) {
        setError('当前 agent 不支持图片，已只发送文字')
      }
      for (const img of imagesToSend) parts.push({ type: 'image', mimeType: img.mimeType, data: img.data })
      if (!parts.length) return
      const run = window.grok.prompt(parts)
      promptWaitRef.current = run
      const result = await run
      if (promptGen.current === gen) setStopReason(result?.stopReason ?? '')
    } catch (err) {
      if (promptGen.current === gen) setError(errText(err))
    } finally {
      if (promptWaitRef.current && promptGen.current === gen) promptWaitRef.current = null
      if (promptGen.current === gen) {
        setStreaming(false)
        sendingRef.current = false
        setBlocks((prev) => {
          const last = prev[prev.length - 1]
          if (last?.type === 'user' && last.pending) return [...prev.slice(0, -1), { ...last, pending: false }]
          return prev
        })
        await refreshSessions()
        await refreshUsage(sessionRef.current)
        const next = queueRef.current[0]
        if (next && promptGen.current === gen) {
          setQueue((prev) => prev.slice(1))
          queueRef.current = queueRef.current.slice(1)
          sendingRef.current = false
          await sendText(next, gen)
        }
      }
    }
  }

  const send = async () => {
    const text = draft.trim()
    const pendingImages = images
    if ((!text && !pendingImages.length) || restoring) return
    if (sendingRef.current || streaming) {
      if (text) {
        setQueue((prev) => [...prev, text])
        setDraft('')
      }
      return
    }
    const parsed = parseSlash(text)
    if (parsed && runCommand(parsed.name, parsed.rest)) {
      setDraft('')
      return
    }
    sendingRef.current = true
    const gen = ++promptGen.current
    setDraft('')
    setImages([])
    await sendText(text, gen, pendingImages)
  }

  const exportChat = useCallback(async () => {
    const md = blocksToMarkdown(blocksRef.current)
    if (!md.trim()) return
    const name = `${folderName(cwdRef.current) || 'chat'}-${new Date().toISOString().slice(0, 10)}.md`
    await window.grok.saveText({ title: '导出对话', defaultName: name, content: md })
  }, [])

  const runCommand = (name: string, rest: string): boolean => {
    const key = name.toLowerCase()
    if (key === 'new' || key === 'clear') {
      void newSession()
      return true
    }
    if (key === 'copy') {
      const text = lastAssistant(blocksRef.current)
      if (text) void window.grok.clipboardWrite(text)
      return true
    }
    if (key === 'export') {
      void exportChat()
      return true
    }
    if (key === 'always-approve') {
      void toggleYolo(!yoloRef.current)
      return true
    }
    if (key === 'help') {
      setSettingsOpen(true)
      return true
    }
    if (key === 'compact') {
      void (async () => {
        await abortUiTurn()
        sendingRef.current = true
        await sendText(`/compact${rest ? ` ${rest}` : ''}`, ++promptGen.current)
      })()
      return true
    }
    return false
  }

  const attachFiles = async () => {
    const files = await window.grok.pickFiles()
    attachPaths(files)
  }

  const changeModel = async (value: string) => {
    setModel(value)
    try {
      if (sessionRef.current) await window.grok.setConfig('model', value)
      await window.grok.setSettings({ model: value })
    } catch (err) {
      setError(errText(err))
    }
  }

  const changeEffort = async (value: string) => {
    setEffort(value)
    try {
      if (sessionRef.current) await window.grok.setConfig('reasoning_effort', value)
    } catch (err) {
      setError(errText(err))
    }
  }

  const toggleYolo = async (value: boolean) => {
    setYolo(value)
    yoloRef.current = value
    try {
      await window.grok.setSettings({ yolo: value })
      if (value && permission) {
        void window.grok.respondPermission(permission.rpcId, allowOptionId(permission))
        setPermission(null)
      }
    } catch (err) {
      setError(errText(err))
    }
  }

  const patchSettings = async (patch: Partial<AppSettings>) => {
    const next = await window.grok.setSettings(patch)
    setSettings(next)
    if (patch.sidebarCollapsed != null) setSidebarCollapsed(patch.sidebarCollapsed)
    if (patch.compactUi != null) setCompactUi(patch.compactUi)
    if (patch.fontScale != null) setFontScale(patch.fontScale)
  }

  const renameSession = async (session: SessionInfo, title: string) => {
    try {
      await window.grok.renameSession(session.sessionId, title)
      setSessions((prev) => prev.map((item) => (item.sessionId === session.sessionId ? { ...item, title } : item)))
    } catch (err) {
      setError(errText(err))
    }
  }

  const deleteSession = async (session: SessionInfo) => {
    const ok = await window.grok.confirm({
      message: '删除这个会话？',
      detail: session.title || session.sessionId,
      ok: '删除'
    })
    if (!ok) return
    try {
      await window.grok.deleteSession(session.sessionId)
      const wasCurrent = sessionRef.current === session.sessionId
      if (wasCurrent) {
        sessionRef.current = null
        setSessionId(null)
        setBlocks([])
        setUsage(null)
      }
      await refreshSessions()
      if (wasCurrent && cwdRef.current) await newSession(cwdRef.current)
    } catch (err) {
      setError(errText(err))
    }
  }

  const onDragEnter = (e: DragEvent) => {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    dragDepth.current += 1
    setDropping(true)
  }

  const onDragOver = (e: DragEvent) => {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDragLeave = (e: DragEvent) => {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDropping(false)
  }

  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDropping(false)
    const dropped = [...e.dataTransfer.files]
    if (!dropped.length) return
    const dirs: string[] = []
    const files: File[] = []
    for (const file of dropped) {
      try {
        const path = window.grok.getPathForFile(file)
        const kind = await window.grok.pathKind(path)
        if (kind === 'dir') dirs.push(path)
        else files.push(file)
      } catch {
        files.push(file)
      }
    }
    if (files.length) await addFiles(files)
    else if (dirs[0]) await openWorkspace(dirs[0])
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'n') {
        e.preventDefault()
        void newSession()
      } else if (mod && key === 'o') {
        e.preventDefault()
        void openProject()
      } else if (mod && key === 'b') {
        e.preventDefault()
        void patchSettings({ sidebarCollapsed: !sidebarCollapsed })
      } else if (mod && key === 'f') {
        e.preventDefault()
        setFindOpen((v) => !v)
      } else if (mod && key === 'e') {
        e.preventDefault()
        void exportChat()
      } else if (mod && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      } else if (mod && key === 'l') {
        e.preventDefault()
        document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus()
      } else if (mod && key === '`') {
        e.preventDefault()
        setLogsOpen((v) => !v)
      } else if (e.key === 'Escape') {
        if (settingsOpen) setSettingsOpen(false)
        else if (logsOpen) setLogsOpen(false)
        else if (findOpen) {
          setFindOpen(false)
          setFind('')
        } else if (streaming) void abortUiTurn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abortUiTurn, exportChat, findOpen, logsOpen, newSession, openProject, settingsOpen, sidebarCollapsed, streaming])

  const headerCwd = useMemo(() => (cwd ? folderName(cwd) : '桌面客户端'), [cwd])
  const grokPickLabel = window.grok.platform === 'win32' ? '选择 grok.exe' : '选择 grok'
  const installHint =
    window.grok.platform === 'win32'
      ? '若尚未安装 CLI，可在 PowerShell 执行：irm https://x.ai/cli/install.ps1 | iex'
      : '若尚未安装 CLI：curl -fsSL https://x.ai/cli/install.sh | bash'
  const sessionTitle = sessions.find((item) => item.sessionId === sessionId)?.title

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

  if (phase === 'setup') {
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
                await connect({ splash: true, restore: true })
              }}
            >
              {grokPickLabel}
            </button>
            <button className="btn" onClick={() => void connect({ splash: true, restore: true })}>
              重试
            </button>
          </div>
          <p className="hint">{installHint}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`app ${compactUi ? 'compact' : ''} ${sidebarCollapsed ? 'nav-collapsed' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => void onDrop(e)}
    >
      <TitleBar
        subtitle={sessionTitle || (sessionId ? headerCwd : cwd ? folderName(cwd) : '把项目拖进来，或直接输入任务')}
        right={
          <>
            <button className="ghost" onClick={() => setLogsOpen((v) => !v)}>
              日志
            </button>
            <button className="ghost" onClick={() => setSettingsOpen(true)}>
              设置
            </button>
          </>
        }
      />
      <div className="shell">
        <Sidebar
          sessions={sessions}
          cwd={cwd}
          sessionId={sessionId}
          recents={recentCwds}
          filter={filter}
          collapsed={sidebarCollapsed}
          onFilter={setFilter}
          onSelect={(s) => void loadSession(s)}
          onNew={() => void newSession()}
          onOpenProject={() => void openProject()}
          onOpenRecent={(path) => void openWorkspace(path)}
          onRename={(s, title) => void renameSession(s, title)}
          onDelete={(s) => void deleteSession(s)}
          onToggle={() => void patchSettings({ sidebarCollapsed: !sidebarCollapsed })}
        />
        <main className="main">
          <div className="toolbar">
            <button
              className="cwd"
              title={cwd || '选择项目'}
              onClick={() => {
                if (cwd) void window.grok.openPath(cwd)
                else void openProject()
              }}
            >
              {cwd || '选择或拖入一个项目目录'}
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
            <label className="check" title="工具调用不再弹窗确认，当前会话立即生效">
              <input type="checkbox" checked={yolo} onChange={(e) => void toggleYolo(e.target.checked)} />
              始终批准
            </label>
          </div>
          {disconnected ? (
            <div className="error-banner">
              <span>{error || 'agent 已断开'}</span>
              <button className="btn primary" onClick={() => void connect({ splash: false, restore: true })}>
                重新连接
              </button>
            </div>
          ) : error ? (
            <div className="error-banner">
              <span>{error}</span>
              <button className="ghost" onClick={() => setError('')}>
                关闭
              </button>
            </div>
          ) : null}
          {findOpen ? (
            <div className="findbar">
              <input
                autoFocus
                placeholder="查找当前对话"
                value={find}
                onChange={(e) => setFind(e.target.value)}
              />
              <button className="ghost" onClick={() => { setFindOpen(false); setFind('') }}>
                关闭
              </button>
            </div>
          ) : null}
          <Chat
            blocks={blocks}
            streaming={streaming}
            restoring={restoring}
            showThinking={showThinking}
            find={find}
            stopReason={stopReason}
            empty={
              <EmptyState
                cwd={cwd}
                restoring={restoring}
                recents={recentCwds}
                onOpenProject={() => void openProject()}
                onOpenRecent={(path) => void openWorkspace(path)}
              />
            }
          />
          <Composer
            draft={draft}
            setDraft={setDraft}
            streaming={streaming}
            disabled={restoring || Boolean(permission) || disconnected}
            commands={commands}
            images={images}
            setImages={setImages}
            queue={queue}
            placeholder={
              cwd
                ? promptImages
                  ? '给 Grok Build 下任务。Enter 发送，/ 打开命令，可粘贴图片。'
                  : '给 Grok Build 下任务。Enter 发送，/ 打开命令。'
                : '输入任务后会选择项目，或把文件夹拖进窗口。'
            }
            onSend={() => void send()}
            onStop={() => void abortUiTurn()}
            onAttach={() => void attachFiles()}
            onCommand={runCommand}
            onPasteFiles={(files) => void addFiles(files)}
          />
          <footer className="status">
            <span>{auth?.email ?? '已登录'}</span>
            <span>{auth?.subscription_tier ?? ''}</span>
            <span>{agentVersion ? `agent ${agentVersion}` : ''}</span>
            <span>{sessionId ? sessionId.slice(0, 8) : '无会话'}</span>
            {usage?.totalTokens ? <span>{formatTokens(usage.totalTokens)} tokens</span> : null}
            {usage?.turnCount ? <span>{usage.turnCount} 轮</span> : null}
            {disconnected ? <span className="danger-text">已断开</span> : null}
          </footer>
        </main>
        {logsOpen ? (
          <aside className="logs">
            <div className="logs-head">
              <span>Agent 日志</span>
              <button className="ghost" onClick={() => setLogsOpen(false)}>
                关闭
              </button>
            </div>
            <pre>{logs.join('\n') || '暂无输出'}</pre>
          </aside>
        ) : null}
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
        <SettingsModal
          grokPath={grokPath}
          settings={settings}
          showThinking={showThinking}
          yolo={yolo}
          grokPickLabel={grokPickLabel}
          onClose={() => setSettingsOpen(false)}
          onPickGrok={async () => {
            const picked = await window.grok.pickGrok()
            if (!picked) return
            await window.grok.setSettings({ grokPath: picked })
            setSettingsOpen(false)
            await connect({ splash: true, restore: true })
          }}
          onShowThinking={async (value) => {
            setShowThinking(value)
            await window.grok.setSettings({ showThinking: value })
          }}
          onYolo={(value) => void toggleYolo(value)}
          onPatch={(patch) => void patchSettings(patch)}
        />
      ) : null}
      {dropping ? <div className="drop-overlay">放开以打开项目或附加文件</div> : null}
    </div>
  )
}

function EmptyState({
  cwd,
  restoring,
  recents,
  onOpenProject,
  onOpenRecent
}: {
  cwd: string
  restoring: boolean
  recents: string[]
  onOpenProject: () => void
  onOpenRecent: (path: string) => void
}) {
  if (restoring) return <p>正在恢复上次会话…</p>
  if (cwd) {
    return (
      <>
        <p>直接输入任务即可，会接着这个项目干。</p>
        <p className="hint">输入 / 打开命令，Ctrl+F 查找，Ctrl+E 导出。</p>
      </>
    )
  }
  return (
    <>
      <p>把项目文件夹拖进来，或选一个目录开始。</p>
      <div className="empty-actions">
        <button className="btn primary" onClick={onOpenProject}>
          打开项目
        </button>
      </div>
      {recents.length ? (
        <div className="recent-list">
          {recents.map((path) => (
            <button key={path} className="recent-chip" title={path} onClick={() => onOpenRecent(path)}>
              {folderName(path)}
            </button>
          ))}
        </div>
      ) : null}
    </>
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
