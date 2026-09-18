import { contextBridge, ipcRenderer } from 'electron'

const api = {
  platform: process.platform,
  start: () => ipcRenderer.invoke('start'),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  newSession: (opts: { cwd: string; yolo?: boolean; model?: string }) => ipcRenderer.invoke('new-session', opts),
  loadSession: (opts: { sessionId: string; cwd: string }) => ipcRenderer.invoke('load-session', opts),
  prompt: (text: string) => ipcRenderer.invoke('prompt', text),
  cancel: () => ipcRenderer.invoke('cancel'),
  setConfig: (configId: string, value: string) => ipcRenderer.invoke('set-config', configId, value),
  respondPermission: (rpcId: number | string, optionId: string | null) =>
    ipcRenderer.invoke('respond-permission', rpcId, optionId),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pickGrok: () => ipcRenderer.invoke('pick-grok'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke('set-settings', patch),
  openPath: (target: string) => ipcRenderer.invoke('open-path', target),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  on: (channel: string, handler: (payload: unknown) => void) => {
    const allowed = new Set(['session-update', 'permission', 'agent-exit', 'agent-log'])
    if (!allowed.has(channel)) return () => undefined
    const wrapped = (_event: unknown, payload: unknown) => handler(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

contextBridge.exposeInMainWorld('grok', api)
