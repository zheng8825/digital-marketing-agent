// Resolves & seeds the per-user "agent workspace" — the folder the `claude` CLI runs in.
// Contains the marketing agent's CLAUDE.md (persona), knowledge/, .claude/ (skills+settings), outputs/.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { EFFORT_OPTIONS, type AppConfig, type Provider, type ThinkingEffort } from '../shared/types'
import { appRootDir, userDataDir } from './runtime'

const configPath = join(userDataDir(), 'config.json')

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

/** The workspace the agent runs in. By default it's the repo's own `agent-workspace/` (which is
 *  what syncs A↔B via git — the persona/knowledge/skills the marketer "trains"). A config override
 *  is honored if it points somewhere that exists. */
export function getWorkspaceDir(): string {
  const cfg = readConfig()
  if (cfg.workspaceDir && existsSync(cfg.workspaceDir)) return cfg.workspaceDir
  return join(appRootDir(), 'agent-workspace')
}

/** Make sure the workspace and its working subfolders exist. Safe to call on every launch. */
export function ensureWorkspace(): string {
  const dir = getWorkspaceDir()
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(dir, 'outputs'), { recursive: true })
  mkdirSync(join(dir, 'uploads'), { recursive: true })
  return dir
}

/** Which CLI to spawn for the next chat. Defaults to 'claude' so existing installs are unchanged. */
export function getProvider(): Provider {
  return readConfig().provider === 'codex' ? 'codex' : 'claude'
}

/** The model alias to pass to `claude --model`. Empty config ("Default") → 'sonnet' — a deliberate
 *  choice so the agent is predictable & light on quota, not tied to whatever Claude Code's global
 *  config is set to (which on a dev machine might be Opus-1M — slow, pricey, burns the rate limit). */
export function getModel(): string {
  const m = readConfig().model
  return m && m.trim() ? m.trim() : 'sonnet'
}

/** The model alias to pass to `codex exec --model`. Empty → let the codex CLI pick. */
export function getCodexModel(): string {
  const m = readConfig().codexModel
  return m && m.trim() ? m.trim() : ''
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
