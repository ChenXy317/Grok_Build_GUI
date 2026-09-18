import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type AppSettings = {
  grokPath: string
  lastCwd: string
  yolo: boolean
  showThinking: boolean
  model?: string
}

const defaults = (home: string): AppSettings => ({
  grokPath: '',
  lastCwd: home,
  yolo: false,
  showThinking: true
})

export function loadSettings(file: string, home: string): AppSettings {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<AppSettings>
    return { ...defaults(home), ...raw }
  } catch {
    return defaults(home)
  }
}

export function saveSettings(file: string, settings: AppSettings): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(settings, null, 2), 'utf8')
}
