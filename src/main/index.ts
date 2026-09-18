import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { GrokAgent, resolveGrokPath, type SessionSnapshot } from './acp'
import { loadSettings, saveSettings, type AppSettings } from './settings'

let win: BrowserWindow | null = null
let agent: GrokAgent | null = null
let settings: AppSettings
let settingsFile = ''

function send(channel: string, payload: unknown): void {
  win?.webContents.send(channel, payload)
}

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function isSafeExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
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
      preload: join(__dirname, existsSync(join(__dirname, '../preload/index.mjs'))
        ? '../preload/index.mjs'
        : '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

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

async function startAgent(): Promise<{
  ok: boolean
  error?: string
  grokPath: string
  auth: GrokAgent['auth']
  agentVersion: string | null
  models: SessionSnapshot['models'] | null
  settings: AppSettings
}> {
  const grokPath = resolveGrokPath(settings.grokPath || null)
  try {
    await agent?.stop()
    agent = new GrokAgent(grokPath, {
      update: (payload) => send('session-update', payload),
      permission: (req) => send('permission', req),
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
      settings
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
      settings
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
    settings.lastCwd = opts.cwd
    saveSettings(settingsFile, settings)
    return await agent.newSession({ cwd: opts.cwd, yolo: opts.yolo ?? settings.yolo, model: opts.model ?? settings.model })
  })

  ipcMain.handle('load-session', async (_e, opts: { sessionId: string; cwd: string }) => {
    if (!agent) throw new Error('尚未连接 agent')
    settings.lastCwd = opts.cwd
    saveSettings(settingsFile, settings)
    return await agent.loadSession(opts)
  })

  ipcMain.handle('prompt', async (_e, text: string) => {
    if (!agent) throw new Error('尚未连接 agent')
    return await agent.prompt(text)
  })

  ipcMain.handle('cancel', () => {
    agent?.cancel()
  })

  ipcMain.handle('set-config', async (_e, configId: string, value: string) => {
    if (!agent) throw new Error('尚未连接 agent')
    if (configId === 'model') {
      settings.model = value
      saveSettings(settingsFile, settings)
    }
    return await agent.setConfig(configId, value)
  })

  ipcMain.handle('respond-permission', (_e, rpcId: number | string, optionId: string | null) => {
    agent?.resolvePermission(rpcId, optionId)
  })

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

  ipcMain.handle('get-settings', () => settings)

  ipcMain.handle('set-settings', (_e, patch: Partial<AppSettings>) => {
    settings = { ...settings, ...patch }
    saveSettings(settingsFile, settings)
    return settings
  })

  ipcMain.handle('open-path', (_e, target: string) => shell.openPath(target))
  ipcMain.handle('open-external', (_e, url: string) => {
    if (typeof url !== 'string' || !isSafeExternalUrl(url)) return
    return shell.openExternal(url)
  })
}

app.whenReady().then(() => {
  app.setName('Grok Build')
  settingsFile = join(app.getPath('userData'), 'settings.json')
  settings = loadSettings(settingsFile, homedir())
  registerIpc()
  createWindow()
})

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
  void agent?.stop()
})
