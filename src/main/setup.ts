// Best-effort detection of the prerequisites: Claude Code installed & logged in (on a Pro/Max
// subscription, NOT an API key), and claude-mem installed. Used by the first-run setup screen.

import spawnSync from 'cross-spawn'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SetupStatus } from '../shared/types'
import { ensureWorkspace } from './workspace'

const CLAUDE_BIN = process.platform === 'win32' ? 'claude.cmd' : 'claude'

function claudeVersion(): string | undefined {
  try {
    const r = spawnSync.sync(CLAUDE_BIN, ['--version'], { encoding: 'utf8', timeout: 8000 })
    if (r.status === 0 && r.stdout) return r.stdout.trim().split('\n')[0]
  } catch {
    /* not installed */
  }
  return undefined
}

function settingsHasClaudeMemHooks(): boolean {
  try {
    const txt = readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf8')
    return /claude-?mem/i.test(txt)
  } catch {
    return false
  }
}

function looksLoggedIn(): boolean {
  // Heuristic — credential storage differs by OS, so this can be a false negative; the UI says so.
  const dotClaude = join(homedir(), '.claude')
  if (existsSync(join(dotClaude, '.credentials.json'))) return true
  if (existsSync(join(homedir(), '.claude.json'))) return true // created after first interactive use
  return false
}

export function getSetupStatus(): SetupStatus {
  const version = claudeVersion()
  return {
    claudeInstalled: !!version,
    claudeVersion: version,
    claudeLoggedIn: looksLoggedIn(),
    apiKeyInEnv: !!process.env.ANTHROPIC_API_KEY,
    claudeMemInstalled: existsSync(join(homedir(), '.claude-mem')) || settingsHasClaudeMemHooks(),
    workspaceDir: ensureWorkspace()
  }
}
