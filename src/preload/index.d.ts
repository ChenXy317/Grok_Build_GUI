import type { AppSettings } from '../main/settings'
import type { ConfigOption, SessionInfo, SessionSnapshot, AuthInfo, PermissionRequest } from '../main/acp'

export type StartResult = {
  ok: boolean
  error?: string
  grokPath: string
  auth: AuthInfo | null
  agentVersion: string | null
  models: SessionSnapshot['models'] | null
  settings: AppSettings
}

export type GrokAPI = {
  platform: NodeJS.Platform
  start: () => Promise<StartResult>
  listSessions: () => Promise<SessionInfo[]>
  newSession: (opts: { cwd: string; yolo?: boolean; model?: string }) => Promise<SessionSnapshot>
  loadSession: (opts: { sessionId: string; cwd: string }) => Promise<SessionSnapshot>
  prompt: (text: string) => Promise<{ stopReason?: string }>
  cancel: () => Promise<void>
  setConfig: (configId: string, value: string) => Promise<unknown>
  respondPermission: (rpcId: number | string, optionId: string | null) => Promise<void>
  pickFolder: () => Promise<string | null>
  pickFiles: () => Promise<string[]>
  pickGrok: () => Promise<string | null>
  getSettings: () => Promise<AppSettings>
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  openPath: (target: string) => Promise<string>
  openExternal: (url: string) => Promise<void>
  on: (channel: string, handler: (payload: unknown) => void) => () => void
}

declare global {
  interface Window {
    grok: GrokAPI
  }
}

export type { AppSettings, ConfigOption, SessionInfo, SessionSnapshot, AuthInfo, PermissionRequest }
