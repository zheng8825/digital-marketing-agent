// Find the `claude` CLI without trusting the inherited PATH.
//
// Why: on Windows, if the user installs Claude Code (which adds `%APPDATA%\npm` to the *user* PATH
// in the registry) and then double-clicks the app *before* logging out, Explorer's environment is
// stale → the spawned app inherits a PATH that doesn't include the npm-global dir → `cross-spawn`
// can't find `claude.cmd` → every chat fails with ENOENT. We work around it by looking in the known
// install locations ourselves; we also widen the child env's PATH so child→child lookups (`claude`
// → `node`) keep working.

import spawn from 'cross-spawn'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

const isWin = process.platform === 'win32'

/** Candidate directories where `claude` may live, in priority order. Filtered to existing dirs. */
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

/** Absolute path to the claude shim, searching candidate dirs. Falls back to bare name (rely on PATH). */
export function resolveClaudeBin(): string {
  const names = isWin ? ['claude.cmd', 'claude.exe', 'claude.ps1', 'claude'] : ['claude']
  for (const dir of candidateDirs()) {
    for (const n of names) {
      const p = join(dir, n)
      if (existsSync(p)) return p
    }
  }
  return isWin ? 'claude.cmd' : 'claude'
}

/** Return a copy of `env` with our candidate dirs prepended to PATH (deduped). Pass to spawned children. */
export function envWithClaudePath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
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

/** True if the bare claude command resolves on the inherited PATH (cross-spawn's lookup). */
export function claudeOnPath(): boolean {
  try {
    const r = spawn.sync(isWin ? 'claude.cmd' : 'claude', ['--version'], { encoding: 'utf8', timeout: 4000 })
    return r.status === 0
  } catch {
    return false
  }
}
