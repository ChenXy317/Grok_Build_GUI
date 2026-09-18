import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type WindowBounds = {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized?: boolean
}

export type AppSettings = {
  grokPath: string
  lastCwd: string
  lastSessionId: string
  recentCwds: string[]
  yolo: boolean
  showThinking: boolean
  model?: string
  sidebarCollapsed: boolean
  compactUi: boolean
  fontScale: number
  windowBounds?: WindowBounds
}

const defaults = (): AppSettings => ({
  grokPath: '',
  lastCwd: '',
  lastSessionId: '',
  recentCwds: [],
  yolo: true,
  showThinking: true,
  sidebarCollapsed: false,
  compactUi: false,
  fontScale: 1
})

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** 读取本地设置；缺项用默认值。 */
export function loadSettings(file: string, _home?: string): AppSettings {
  const base = defaults()
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<AppSettings>
    const recentCwds = Array.isArray(raw.recentCwds)
      ? raw.recentCwds.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : []
    const fontScale = Math.min(1.4, Math.max(0.85, asNumber(raw.fontScale, 1)))
    return {
      ...base,
      ...raw,
      grokPath: asString(raw.grokPath),
      lastCwd: asString(raw.lastCwd),
      lastSessionId: asString(raw.lastSessionId),
      recentCwds,
      sidebarCollapsed: Boolean(raw.sidebarCollapsed),
      compactUi: Boolean(raw.compactUi),
      fontScale
    }
  } catch {
    return base
  }
}

export function saveSettings(file: string, settings: AppSettings): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(settings, null, 2), 'utf8')
}

function samePath(a: string, b: string): boolean {
  const n = (p: string) => {
    const s = p.replace(/[\\/]+$/, '').replace(/\\/g, '/')
    return process.platform === 'win32' ? s.toLowerCase() : s
  }
  return n(a) === n(b)
}

/** 记录当前项目与会话，并维护最近项目列表。 */
export function rememberWorkspace(settings: AppSettings, cwd: string, sessionId?: string): AppSettings {
  const recentCwds = [cwd, ...settings.recentCwds.filter((item) => !samePath(item, cwd))].slice(0, 8)
  return {
    ...settings,
    lastCwd: cwd,
    lastSessionId: sessionId || settings.lastSessionId,
    recentCwds
  }
}
