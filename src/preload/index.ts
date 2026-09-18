import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { PromptPart } from '../main/acp'

const api = {
  platform: process.platform,
  start: () => ipcRenderer.invoke('start'),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  newSession: (opts: { cwd: string; yolo?: boolean; model?: string }) => ipcRenderer.invoke('new-session', opts),
  loadSession: (opts: { sessionId: string; cwd: string }) => ipcRenderer.invoke('load-session', opts),
  prompt: (parts: PromptPart[]) => ipcRenderer.invoke('prompt', parts),
  cancel: () => ipcRenderer.invoke('cancel'),
  setConfig: (configId: string, value: string) => ipcRenderer.invoke('set-config', configId, value),
  respondPermission: (rpcId: number | string, optionId: string | null) =>
    ipcRenderer.invoke('respond-permission', rpcId, optionId),
  deleteSession: (sessionId: string) => ipcRenderer.invoke('delete-session', sessionId),
  renameSession: (sessionId: string, title: string) => ipcRenderer.invoke('rename-session', sessionId, title),
  sessionUsage: (sessionId: string) => ipcRenderer.invoke('session-usage', sessionId),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pickGrok: () => ipcRenderer.invoke('pick-grok'),
  saveText: (opts: { title?: string; defaultName?: string; content: string }) => ipcRenderer.invoke('save-text', opts),
  confirm: (opts: { message: string; detail?: string; ok?: string }) => ipcRenderer.invoke('confirm', opts),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke('set-settings', patch),
  openPath: (target: string) => ipcRenderer.invoke('open-path', target),
  revealPath: (target: string) => ipcRenderer.invoke('reveal-path', target),
  clipboardWrite: (text: string) => ipcRenderer.invoke('clipboard-write', text),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  pathKind: (target: string) => ipcRenderer.invoke('path-kind', target) as Promise<'dir' | 'file' | null>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  on: (channel: string, handler: (payload: unknown) => void) => {
    const allowed = new Set(['session-update', 'permission', 'agent-exit', 'agent-log', 'open-folder'])
    if (!allowed.has(channel)) return () => undefined
    const wrapped = (_event: unknown, payload: unknown) => handler(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

contextBridge.exposeInMainWorld('grok', api)
