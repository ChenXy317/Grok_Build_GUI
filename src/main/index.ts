import { app, BrowserWindow, clipboard, dialog, ipcMain, Notification, screen, shell } from 'electron'
import { existsSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { GrokAgent, resolveGrokPath, type PromptPart, type SessionSnapshot } from './acp'
import { deleteSessionDir, readSessionUsage, renameSessionDir } from './session-disk'
import { loadSettings, rememberWorkspace, saveSettings, type AppSettings } from './settings'

let win: BrowserWindow | null = null
let agent: GrokAgent | null = null
let settings: AppSettings
let settingsFile = ''
let persistTimer: ReturnType<typeof setTimeout> | null = null
let pendingOpenFolder: string | null = null

function send(channel: string, payload: unknown): void {
  win?.webContents.send(channel, payload)
}

function persist(): void {
  saveSettings(settingsFile, settings)
}

function persistSoon(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(persist, 400)
}

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function isSafeExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

function pathKey(p: string): string {
  const n = resolve(p).replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? n.toLowerCase() : n
}

function clientRoots(): Set<string> {
  const roots = [__dirname, join(__dirname, '..'), join(__dirname, '../..')]
  try {
    roots.push(app.getAppPath())
  } catch {
    /* app not ready */
  }
  try {
    roots.push(dirname(process.execPath))
  } catch {
    /* ignore */
  }
  return new Set(roots.map(pathKey))
}

function folderFromArgv(argv: string[]): string | null {
  const args = argv.slice(1)
  const dd = args.lastIndexOf('--')
  const slice = dd >= 0 ? args.slice(dd + 1) : args
  const skipSelf = dd < 0
  const self = skipSelf ? clientRoots() : null
  for (const arg of [...slice].reverse()) {
    if (!arg || arg.startsWith('-')) continue
    const lower = arg.toLowerCase()
    if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs') || lower.endsWith('.exe')) continue
    try {
      if (!existsSync(arg) || !statSync(arg).isDirectory()) continue
      const resolved = resolve(arg)
      if (self?.has(pathKey(resolved))) continue
      return resolved
    } catch {
      /* skip */
    }
  }
  return null
}

function preloadPath(): string {
  const mjs = join(__dirname, '../preload/index.mjs')
  return existsSync(mjs) ? mjs : join(__dirname, '../preload/index.js')
}

function visibleBounds(): { x?: number; y?: number; width: number; height: number; isMaximized?: boolean } {
  const saved = settings.windowBounds
  const width = saved?.width || 1320
  const height = saved?.height || 860
  if (saved?.x == null || saved?.y == null) return { width, height, isMaximized: saved?.isMaximized }
  const area = screen.getDisplayMatching({ x: saved.x, y: saved.y, width, height }).workArea
  const x = Math.min(Math.max(saved.x, area.x), area.x + area.width - 200)
  const y = Math.min(Math.max(saved.y, area.y), area.y + area.height - 160)
  return { x, y, width, height, isMaximized: saved.isMaximized }
}

function trackWindow(window: BrowserWindow): void {
  const save = (): void => {
    if (window.isDestroyed()) return
    const isMaximized = window.isMaximized()
    if (!isMaximized) settings.windowBounds = { ...window.getBounds(), isMaximized: false }
    else settings.windowBounds = { ...(settings.windowBounds ?? window.getBounds()), isMaximized: true }
    persistSoon()
  }
  window.on('resize', save)
  window.on('move', save)
  window.on('maximize', save)
  window.on('unmaximize', save)
}

function createWindow(): void {
  const bounds = visibleBounds()
  win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: '#0c0c0f',
    title: 'Grok Build',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0c0c0f',
      symbolColor: '#ececf1',
      height: 36
    },
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (bounds.isMaximized) win.maximize()
  trackWindow(win)
  win.on('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function showNotice(title: string, body: string): void {
  if (win?.isFocused()) return
  try {
    new Notification({ title, body }).show()
  } catch {
    /* notifications optional */
  }
  win?.flashFrame(true)
}

async function startAgent(): Promise<{
  ok: boolean
  error?: string
  grokPath: string
  auth: GrokAgent['auth']
  agentVersion: string | null
  models: SessionSnapshot['models'] | null
  settings: AppSettings
  canDeleteSession: boolean
  promptImages: boolean
}> {
  const grokPath = resolveGrokPath(settings.grokPath || null)
  try {
    await agent?.stop()
    agent = new GrokAgent(grokPath, {
      update: (payload) => send('session-update', payload),
      permission: (req) => {
        send('permission', req)
        if (settings.yolo) return
        if (req.sessionId && agent?.sessionId && req.sessionId !== agent.sessionId) return
        const title = String(req.toolCall.title ?? '需要批准')
        showNotice('Grok Build', title)
      },
      exit: (info) => send('agent-exit', info),
      log: (line) => send('agent-log', line)
    })
    const info = await agent.start()
    return {
      ok: true,
      grokPath,
      auth: info.auth,
      agentVersion: info.agentVersion,
      models: info.models,
      settings,
      canDeleteSession: info.canDeleteSession,
      promptImages: info.promptImages
    }
  } catch (error) {
    try {
      await agent?.stop()
    } catch {
      /* already failed */
    }
    agent = null
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: message,
      grokPath,
      auth: null,
      agentVersion: null,
      models: null,
      settings,
      canDeleteSession: false,
      promptImages: false
    }
  }
}

function registerIpc(): void {
  ipcMain.handle('start', () => startAgent())

  ipcMain.handle('list-sessions', async () => {
    if (!agent) return []
    return await agent.listSessions()
  })

  ipcMain.handle('new-session', async (_e, opts: { cwd: string; yolo?: boolean; model?: string }) => {
    if (!agent) throw new Error('尚未连接 agent')
    const snap = await agent.newSession({
      cwd: opts.cwd,
      yolo: opts.yolo ?? settings.yolo,
      model: opts.model ?? settings.model
    })
    settings = rememberWorkspace(settings, opts.cwd, snap.sessionId)
    persist()
    return snap
  })

  ipcMain.handle('load-session', async (_e, opts: { sessionId: string; cwd: string }) => {
    if (!agent) throw new Error('尚未连接 agent')
    const snap = await agent.loadSession(opts)
    settings = rememberWorkspace(settings, opts.cwd, opts.sessionId)
    persist()
    return snap
  })

  ipcMain.handle('prompt', async (_e, parts: PromptPart[]) => {
    if (!agent) throw new Error('尚未连接 agent')
    return await agent.prompt(Array.isArray(parts) ? parts : [{ type: 'text', text: String(parts) }])
  })

  ipcMain.handle('cancel', () => {
    agent?.cancel()
  })

  ipcMain.handle('set-config', async (_e, configId: string, value: string) => {
    if (!agent) throw new Error('尚未连接 agent')
    if (configId === 'model') {
      settings.model = value
      persist()
    }
    return await agent.setConfig(configId, value)
  })

  ipcMain.handle('respond-permission', (_e, rpcId: number | string, optionId: string | null) => {
    agent?.resolvePermission(rpcId, optionId)
  })

  ipcMain.handle('delete-session', async (_e, sessionId: string) => {
    if (!sessionId) throw new Error('缺少会话')
    let deleted = false
    if (agent?.canDeleteSession) {
      try {
        await agent.deleteSession(sessionId)
        deleted = true
      } catch {
        /* fall back to disk */
      }
    }
    if (!deleted) deleted = deleteSessionDir(sessionId)
    if (!deleted) throw new Error('无法删除该会话')
    if (settings.lastSessionId === sessionId) {
      settings.lastSessionId = ''
      persist()
    }
    return true
  })

  ipcMain.handle('rename-session', (_e, sessionId: string, title: string) => {
    if (!renameSessionDir(sessionId, title)) throw new Error('无法重命名该会话')
    return true
  })

  ipcMain.handle('session-usage', (_e, sessionId: string) => readSessionUsage(sessionId))

  ipcMain.handle('pick-folder', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: '选择项目目录',
      defaultPath: settings.lastCwd || homedir(),
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('pick-files', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: '附加文件',
      defaultPath: agent?.cwd || settings.lastCwd || homedir(),
      properties: ['openFile', 'multiSelections']
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('pick-grok', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: '选择 grok 可执行文件',
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Grok', extensions: ['exe'] }] : []
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('save-text', async (_e, opts: { title?: string; defaultName?: string; content: string }) => {
    const result = await dialog.showSaveDialog(win!, {
      title: opts.title || '导出',
      defaultPath: join(settings.lastCwd || homedir(), opts.defaultName || 'conversation.md'),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) return null
    writeFileSync(result.filePath, opts.content, 'utf8')
    return result.filePath
  })

  ipcMain.handle('confirm', async (_e, opts: { message: string; detail?: string; ok?: string }) => {
    const result = await dialog.showMessageBox(win!, {
      type: 'warning',
      buttons: ['取消', opts.ok || '确定'],
      defaultId: 0,
      cancelId: 0,
      message: opts.message,
      detail: opts.detail || ''
    })
    return result.response === 1
  })

  ipcMain.handle('take-open-folder', () => {
    const folder = pendingOpenFolder
    pendingOpenFolder = null
    return folder
  })

  ipcMain.handle('get-settings', () => settings)

  ipcMain.handle('set-settings', (_e, patch: Partial<AppSettings>) => {
    settings = { ...settings, ...patch }
    persist()
    return settings
  })

  ipcMain.handle('open-path', (_e, target: string) => shell.openPath(target))
  ipcMain.handle('reveal-path', (_e, target: string) => {
    if (typeof target === 'string' && target) shell.showItemInFolder(target)
  })
  ipcMain.handle('clipboard-write', (_e, text: string) => {
    if (typeof text === 'string') clipboard.writeText(text)
  })
  ipcMain.handle('open-external', (_e, url: string) => {
    if (typeof url !== 'string' || !isSafeExternalUrl(url)) return
    return shell.openExternal(url)
  })

  ipcMain.handle('path-kind', (_e, target: string) => {
    if (typeof target !== 'string' || !target) return null
    try {
      return statSync(target).isDirectory() ? 'dir' : 'file'
    } catch {
      return existsSync(target) ? 'file' : null
    }
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
    const folder = folderFromArgv(argv)
    if (folder) send('open-folder', folder)
  })

  app.whenReady().then(() => {
    app.setName('Grok Build')
    settingsFile = join(app.getPath('userData'), 'settings.json')
    settings = loadSettings(settingsFile, homedir())
    pendingOpenFolder = folderFromArgv(process.argv)
    registerIpc()
    createWindow()
  })
}

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return
  void agent?.stop()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
  else win?.show()
})

app.on('before-quit', () => {
  if (persistTimer) clearTimeout(persistTimer)
  if (settingsFile && settings) persist()
  void agent?.stop()
})
