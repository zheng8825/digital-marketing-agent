// Tiny host-runtime helpers that replace the bits of Electron's `app` / `shell` we relied on.
// The app no longer runs inside Electron — it's a plain Node process that serves the UI on
// localhost and opens it in the system browser. Everything is self-contained in the app folder
// so nothing lands in the OS "installed programs" list or AppData.

import spawn from 'cross-spawn'
import { join, resolve } from 'node:path'

/** Root of the app on disk (the folder holding package.json / start.bat).
 *  At runtime the bundled entry lives at <root>/out/main/index.cjs, so walk two levels up.
 *  In dev (tsx running src/main/index.ts) it's <root>/src/main → also two levels up. */
export function appRootDir(): string {
  return resolve(__dirname, '..', '..')
}

/** Where machine-local data (config, sessions, usage) lives. Kept inside the app folder so the
 *  whole thing is portable and leaves no AppData footprint. Override with MARKETING_AGENT_DATA. */
export function userDataDir(): string {
  return process.env.MARKETING_AGENT_DATA?.trim() || join(appRootDir(), 'data')
}

/** Open a URL in the user's default browser. */
export function openExternal(url: string): void {
  if (process.platform === 'win32') {
    // `start` is a cmd builtin; the empty "" is the window title arg so a URL with & doesn't break.
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  }
}

/** Open a folder in the OS file explorer. */
export function openPath(path: string): void {
  if (process.platform === 'win32') {
    spawn('explorer.exe', [path], { detached: true, stdio: 'ignore' }).unref()
  } else if (process.platform === 'darwin') {
    spawn('open', [path], { detached: true, stdio: 'ignore' }).unref()
  } else {
    spawn('xdg-open', [path], { detached: true, stdio: 'ignore' }).unref()
  }
}
