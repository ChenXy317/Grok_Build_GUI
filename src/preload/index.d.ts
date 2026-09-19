import type { AppSettings } from '../main/settings'
import type {
  ConfigOption,
  SessionInfo,
  SessionSnapshot,
  SessionMode,
  AuthInfo,
  PermissionRequest,
  PromptPart,
  SlashCommand,
  QuestionRequest,
  UserQuestion,
  ElicitRequest,
  TrustRequest,
  PlanGateRequest,
  RewindPoint,
  PermissionMode
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
  contextWindow: number | null
}

export type GrokAPI = {
  platform: NodeJS.Platform
  start: () => Promise<StartResult>
  listSessions: () => Promise<SessionInfo[]>
  newSession: (opts: { cwd: string; yolo?: boolean; auto?: boolean; model?: string }) => Promise<SessionSnapshot>
  loadSession: (opts: { sessionId: string; cwd: string }) => Promise<SessionSnapshot>
  prompt: (parts: PromptPart[]) => Promise<{ stopReason?: string }>
  cancel: () => Promise<void>
  setConfig: (configId: string, value: string) => Promise<unknown>
  respondPermission: (rpcId: number | string, optionId: string | null) => Promise<void>
  respondQuestion: (rpcId: number | string, result: unknown) => Promise<void>
  respondElicit: (rpcId: number | string, result: unknown) => Promise<void>
  respondTrust: (rpcId: number | string, trust: boolean) => Promise<void>
  respondPlanGate: (rpcId: number | string, outcome: string, feedback?: string) => Promise<void>
  setMode: (modeId: string) => Promise<unknown>
  togglePlan: (enabled?: boolean) => Promise<unknown>
  compact: (context?: string) => Promise<unknown>
  rewindPoints: () => Promise<RewindPoint[]>
  rewindExecute: (index: number, restoreFiles?: boolean) => Promise<unknown>
  promptHistory: () => Promise<string[]>
  forkSession: () => Promise<SessionSnapshot>
  sessionInfo: () => Promise<Record<string, unknown> | null>
  sessionPlan: (sessionId: string) => Promise<string | null>
  listFiles: (root: string, query?: string) => Promise<string[]>
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
  SessionUsage,
  SessionMode,
  QuestionRequest,
  UserQuestion,
  ElicitRequest,
  TrustRequest,
  PlanGateRequest,
  RewindPoint,
  PermissionMode
}
