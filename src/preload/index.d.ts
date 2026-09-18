import type { AppSettings } from '../main/settings'
import type {
  ConfigOption,
  SessionInfo,
  SessionSnapshot,
  AuthInfo,
  PermissionRequest,
  PromptPart,
  SlashCommand
} from '../main/acp'
import type { SessionUsage } from '../main/session-disk'

export type StartResult = {
  ok: boolean
  error?: string
  grokPath: string
  auth: AuthInfo | null
  agentVersion: string | null
  models: SessionSnapshot['models'] | null
  settings: AppSettings
  canDeleteSession: boolean
  promptImages: boolean
}

export type GrokAPI = {
  platform: NodeJS.Platform
  start: () => Promise<StartResult>
  listSessions: () => Promise<SessionInfo[]>
  newSession: (opts: { cwd: string; yolo?: boolean; model?: string }) => Promise<SessionSnapshot>
  loadSession: (opts: { sessionId: string; cwd: string }) => Promise<SessionSnapshot>
  prompt: (parts: PromptPart[]) => Promise<{ stopReason?: string }>
  cancel: () => Promise<void>
  setConfig: (configId: string, value: string) => Promise<unknown>
  respondPermission: (rpcId: number | string, optionId: string | null) => Promise<void>
  deleteSession: (sessionId: string) => Promise<boolean>
  renameSession: (sessionId: string, title: string) => Promise<boolean>
  sessionUsage: (sessionId: string) => Promise<SessionUsage | null>
  pickFolder: () => Promise<string | null>
  pickFiles: () => Promise<string[]>
  pickGrok: () => Promise<string | null>
  saveText: (opts: { title?: string; defaultName?: string; content: string }) => Promise<string | null>
  confirm: (opts: { message: string; detail?: string; ok?: string }) => Promise<boolean>
  takeOpenFolder: () => Promise<string | null>
  getSettings: () => Promise<AppSettings>
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  openPath: (target: string) => Promise<string>
  revealPath: (target: string) => Promise<void>
  clipboardWrite: (text: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  pathKind: (target: string) => Promise<'dir' | 'file' | null>
  getPathForFile: (file: File) => string
  on: (channel: string, handler: (payload: unknown) => void) => () => void
}

declare global {
  interface Window {
    grok: GrokAPI
  }
}

export type {
  AppSettings,
  ConfigOption,
  SessionInfo,
  SessionSnapshot,
  AuthInfo,
  PermissionRequest,
  PromptPart,
  SlashCommand,
  SessionUsage
}
