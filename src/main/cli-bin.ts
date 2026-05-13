// Find a Node-installed CLI (Claude Code, OpenAI Codex, …) without trusting the inherited PATH,
// and build the env it should run with.
//
// Why: on Windows, if the user installs a CLI via npm-global (which adds `%APPDATA%\npm` to the
// *user* PATH in the registry) and then double-clicks our app *before* logging out, Explorer's
// environment is stale → the spawned app inherits a PATH that doesn't include the npm-global dir
// → `cross-spawn` can't find `claude.cmd` / `codex.cmd` → every chat fails with ENOENT. We work
// around it by looking in the known install locations ourselves; we also widen the child env's
// PATH so child→child lookups (`claude` → `node`) keep working. The env helper also strips the
// API-key vars that would otherwise route the agent through the paid API instead of the user's
// Pro/Max (Claude) or ChatGPT Plus/Pro (Codex) subscription.

import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { Provider } from '../shared/types'

const isWin = process.platform === 'win32'

/** Candidate directories where npm-installed CLIs may live, in priority order. Existing dirs only. */
function candidateDirs(): string[] {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const appData = process.env.APPDATA || (home ? join(home, 'AppData', 'Roaming') : '')
  const localAppData = process.env.LOCALAPPDATA || (home ? join(home, 'AppData', 'Local') : '')
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const programFiles86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const list = isWin
    ? [
        // npm-global default, per user
        appData && join(appData, 'npm'),
        // npm with a different prefix (less common, but seen)
        localAppData && join(localAppData, 'npm'),
        // pnpm-global
        appData && join(appData, 'pnpm'),
        localAppData && join(localAppData, 'pnpm'),
        // Volta / fnm / nvm-windows shims
        localAppData && join(localAppData, 'Volta', 'bin'),
        // Node installer's default (rare for npm-global, but harmless)
        join(programFiles, 'nodejs'),
        join(programFiles86, 'nodejs')
      ]
    : [
        join(home, '.npm-global', 'bin'),
        join(home, '.nvm', 'versions', 'node', 'bin'), // not exact, but cheap to ignore
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/usr/bin'
      ]
  return list.filter((d): d is string => !!d && existsSync(d))
}

/** Absolute path to a Node-installed CLI shim, searching candidate dirs. Falls back to bare name. */
function resolveBin(name: string): string {
  const names = isWin ? [`${name}.cmd`, `${name}.exe`, `${name}.ps1`, name] : [name]
  for (const dir of candidateDirs()) {
    for (const n of names) {
      const p = join(dir, n)
      if (existsSync(p)) return p
    }
  }
  return isWin ? `${name}.cmd` : name
}

export const resolveClaudeBin = (): string => resolveBin('claude')
export const resolveCodexBin = (): string => resolveBin('codex')

/** Return a copy of `env` with our candidate dirs prepended to PATH (deduped). Pass to spawned children. */
export function envWithCliPath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const key = isWin ? Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH' : 'PATH'
  const current = env[key] ?? ''
  const have = new Set(current.split(delimiter).map((p) => p.toLowerCase()))
  const extra: string[] = []
  for (const dir of candidateDirs()) {
    if (!have.has(dir.toLowerCase())) extra.push(dir)
  }
  if (!extra.length) return env
  return { ...env, [key]: [...extra, current].filter(Boolean).join(delimiter) }
}

/** Env to spawn a provider's CLI (or any subprocess that may then invoke it) with: API-key /
 *  cloud-provider vars stripped so it uses the logged-in subscription (Claude Pro/Max via
 *  `claude.ai`, ChatGPT Plus/Pro via OAuth), plus our npm-global PATH widening. */
export function agentEnv(provider: Provider = 'claude'): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (provider === 'claude') {
    delete env.ANTHROPIC_API_KEY
    delete env.ANTHROPIC_AUTH_TOKEN
    delete env.CLAUDE_CODE_USE_BEDROCK
    delete env.CLAUDE_CODE_USE_VERTEX
  } else {
    // codex picks up OPENAI_API_KEY (and CODEX_API_KEY in CI mode) — strip both so it falls back
    // to the ChatGPT OAuth login the user did via `codex login`.
    delete env.OPENAI_API_KEY
    delete env.CODEX_API_KEY
  }
  return envWithCliPath(env)
}
