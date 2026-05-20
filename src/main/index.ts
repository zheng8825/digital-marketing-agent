// Entry point. Plain Node — no Electron. Starts the local HTTP server (API + the built web UI),
// then opens the dashboard in the system default browser. The "window" the marketer sees is just a
// browser tab pointed at 127.0.0.1, so nothing gets "installed" on her machine.
//
// On startup it records the live URL + this process's PID into the data folder so the launcher can
// (a) detect an already-running instance and just re-open it, and (b) stop it cleanly (stop.bat).

import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { startServer } from './server'
import { ensureWorkspace } from './workspace'
import { openExternal, userDataDir } from './runtime'

function runtimeFiles(): { pid: string; url: string } {
  const dir = userDataDir()
  return { pid: join(dir, 'server.pid'), url: join(dir, 'server.url') }
}

function writeRuntimeInfo(url: string): void {
  const { pid, url: urlFile } = runtimeFiles()
  mkdirSync(userDataDir(), { recursive: true })
  writeFileSync(pid, String(process.pid), 'utf8')
  writeFileSync(urlFile, url, 'utf8')
}

function clearRuntimeInfo(): void {
  const { pid, url } = runtimeFiles()
  for (const f of [pid, url]) {
    try {
      rmSync(f, { force: true })
    } catch {
      /* ignore */
    }
  }
}

async function main(): Promise<void> {
  ensureWorkspace()
  const port = await startServer()
  const url = `http://127.0.0.1:${port}`
  writeRuntimeInfo(url)

  // Best-effort cleanup so a stale pid file doesn't block the next launch. (A hard taskkill won't
  // fire these — the launcher also liveness-checks the PID, so a stale file is harmless.)
  const cleanup = (): void => clearRuntimeInfo()
  process.on('exit', cleanup)
  process.on('SIGINT', () => { cleanup(); process.exit(0) })
  process.on('SIGTERM', () => { cleanup(); process.exit(0) })

  // eslint-disable-next-line no-console
  console.log(`\n  Marketing Agent is running.\n  -> ${url}\n`)

  // Don't auto-open if asked not to (handy when developing).
  if (process.env.MARKETING_AGENT_NO_OPEN !== '1') openExternal(url)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start:', e)
  process.exitCode = 1
})
