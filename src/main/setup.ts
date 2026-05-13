// Best-effort detection of the prerequisites: Claude Code installed & logged in (on a Pro/Max
// subscription, NOT an API key), and claude-mem installed. Used by the first-run setup screen.

import spawnSync from 'cross-spawn'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ClaudeAuthInfo, SetupStatus } from '../shared/types'
import { ensureWorkspace } from './workspace'
import { agentEnv, resolveClaudeBin } from './claude-path'

function claudeVersion(): string | undefined {
  try {
    const r = spawnSync.sync(resolveClaudeBin(), ['--version'], { encoding: 'utf8', timeout: 8000, env: agentEnv() })
    if (r.status === 0 && r.stdout) return r.stdout.trim().split('\n')[0]
  } catch {
    /* not installed */
  }
  return undefined
}

/** `claude auth status` → JSON. Run as the agent runs (key vars stripped). undefined if it fails. */
function claudeAuthInfo(): ClaudeAuthInfo | undefined {
  try {
    const r = spawnSync.sync(resolveClaudeBin(), ['auth', 'status'], { encoding: 'utf8', timeout: 10000, env: agentEnv() })
    const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
    const m = out.match(/\{[\s\S]*\}/) // tolerate leading log lines
    if (!m) return undefined
    const j = JSON.parse(m[0]) as Record<string, unknown>
    const str = (k: string): string | undefined => (typeof j[k] === 'string' ? (j[k] as string) : undefined)
    const loggedIn = j.loggedIn === true
    const authMethod = str('authMethod')
    const apiProvider = str('apiProvider')
    const subscriptionType = str('subscriptionType')
    const usingSubscription =
      loggedIn &&
      (apiProvider === undefined || apiProvider === 'firstParty') &&
      authMethod !== 'apiKey' &&
      authMethod !== 'apiKeyHelper' &&
      !!subscriptionType
    return { loggedIn, authMethod, apiProvider, email: str('email'), orgName: str('orgName'), subscriptionType, usingSubscription }
  } catch {
    return undefined
  }
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
  const auth = version ? claudeAuthInfo() : undefined
  return {
    claudeInstalled: !!version,
    claudeVersion: version,
    claudeLoggedIn: auth ? auth.loggedIn : looksLoggedIn(),
    apiKeyInEnv: !!process.env.ANTHROPIC_API_KEY,
    claudeMemInstalled: existsSync(join(homedir(), '.claude-mem')) || settingsHasClaudeMemHooks(),
    workspaceDir: ensureWorkspace(),
    auth
  }
}
