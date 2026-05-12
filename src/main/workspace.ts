// Resolves & seeds the per-user "agent workspace" — the folder the `claude` CLI runs in.
// Contains the marketing agent's CLAUDE.md (persona), knowledge/, .claude/ (skills+settings), outputs/.

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs'
import { dirname, join, resolve, normalize } from 'node:path'
import { EFFORT_OPTIONS, type AppConfig, type ThinkingEffort } from '../shared/types'

function isDev(): boolean {
  return !app.isPackaged
}

const userData = app.getPath('userData')
const configPath = join(userData, 'config.json')

export function readConfig(): AppConfig {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'))
  } catch {
    return {}
  }
}

export function writeConfig(patch: Partial<AppConfig>): AppConfig {
  const next = { ...readConfig(), ...patch }
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf8')
  return next
}

/** Where the bundled template workspace lives (in dev: the repo; packaged: process.resourcesPath). */
function templateWorkspaceDir(): string {
  if (isDev()) return resolve(app.getAppPath(), 'agent-workspace')
  return join(process.resourcesPath, 'agent-workspace')
}

/** The active workspace dir: explicit config > (dev: repo's agent-workspace) > <userData>/agent-workspace. */
export function getWorkspaceDir(): string {
  const cfg = readConfig()
  if (cfg.workspaceDir && existsSync(cfg.workspaceDir)) return cfg.workspaceDir
  if (isDev()) {
    const repoWs = resolve(app.getAppPath(), 'agent-workspace')
    if (existsSync(join(repoWs, 'CLAUDE.md'))) return repoWs
  }
  return join(userData, 'agent-workspace')
}

/** Copy the template into the active workspace if it isn't there yet. Safe to call on every launch. */
export function ensureWorkspace(): string {
  const dir = getWorkspaceDir()
  if (!existsSync(join(dir, 'CLAUDE.md'))) {
    mkdirSync(dir, { recursive: true })
    const tpl = templateWorkspaceDir()
    if (existsSync(tpl)) {
      cpSync(tpl, dir, { recursive: true })
    }
    // make sure outputs/ exists even if the template filter excluded it
    mkdirSync(join(dir, 'outputs'), { recursive: true })
  }
  mkdirSync(join(dir, 'outputs'), { recursive: true })
  return dir
}

export function getModel(): string | undefined {
  const m = readConfig().model
  return m ? m : undefined
}

export function getThinkingEffort(): ThinkingEffort {
  return readConfig().thinkingEffort ?? 'off'
}

/** MAX_THINKING_TOKENS value for the current effort setting (0 = no extended thinking). */
export function getThinkingTokens(): number {
  const eff = getThinkingEffort()
  return EFFORT_OPTIONS.find((o) => o.id === eff)?.tokens ?? 0
}

// --- "Training" the agent: safe read/write of files inside the workspace -----------------------------

function safeJoin(dir: string, rel: string): string {
  const target = normalize(join(dir, rel))
  if (target !== dir && !target.startsWith(dir + (process.platform === 'win32' ? '\\' : '/'))) {
    throw new Error(`Refusing path outside the workspace: ${rel}`)
  }
  return target
}

export function readAgentFile(rel: string): string {
  const p = safeJoin(getWorkspaceDir(), rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

export function writeAgentFile(rel: string, content: string): void {
  const p = safeJoin(getWorkspaceDir(), rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, content, 'utf8')
}
