// Runs the one-time setup steps for the marketer, streaming each command's output to the UI:
//   install-claude  -> npm install -g @anthropic-ai/claude-code
//   login           -> claude login   (prints an auth URL; we open it in the browser)
//   logout          -> claude auth logout   (sign out — used by "switch account")
//   install-mem     -> npx --yes claude-mem install
//   open-terminal   -> opens a PowerShell window in the agent workspace (manual fallback)
//
// Best-effort: if a command needs TTY interaction and stalls, the user can cancel and run the
// printed command in a terminal instead.

import spawn from 'cross-spawn'
import { shell } from 'electron'
import type { ChildProcess } from 'node:child_process'
import { getWorkspaceDir } from './workspace'

export type SetupStep = 'install-claude' | 'login' | 'logout' | 'install-mem'

export interface RunHandle {
  done: Promise<void>
  cancel(): void
}

interface RunOpts {
  onLine: (line: string) => void
  /** Called with the spawned command, for display. */
  onStart?: (display: string) => void
}

const isWin = process.platform === 'win32'

function commandFor(step: SetupStep): { cmd: string; args: string[]; display: string } {
  switch (step) {
    case 'install-claude':
      return { cmd: isWin ? 'npm.cmd' : 'npm', args: ['install', '-g', '@anthropic-ai/claude-code'], display: 'npm install -g @anthropic-ai/claude-code' }
    case 'login':
      return { cmd: isWin ? 'claude.cmd' : 'claude', args: ['login'], display: 'claude login' }
    case 'logout':
      return { cmd: isWin ? 'claude.cmd' : 'claude', args: ['auth', 'logout'], display: 'claude auth logout' }
    case 'install-mem':
      return { cmd: isWin ? 'npx.cmd' : 'npx', args: ['--yes', 'claude-mem', 'install'], display: 'npx claude-mem install' }
  }
}

const URL_RE = /(https?:\/\/[^\s"'<>]+)/

export function runSetupStep(step: SetupStep, opts: RunOpts): RunHandle {
  const { cmd, args, display } = commandFor(step)
  opts.onStart?.(display)
  opts.onLine(`$ ${display}`)

  let child: ChildProcess
  try {
    child = spawn(cmd, args, { cwd: getWorkspaceDir(), env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    opts.onLine(`(failed to start: ${(e as Error).message})`)
    return { done: Promise.resolve(), cancel: () => {} }
  }

  let resolveDone: () => void
  const done = new Promise<void>((r) => (resolveDone = r))
  let openedUrl = false
  let buf = ''

  const pump = (chunk: Buffer): void => {
    buf += chunk.toString('utf8')
    let nl: number
    while ((nl = buf.search(/\r\n|\n|\r/)) >= 0) {
      const line = buf.slice(0, nl)
      buf = buf.slice(nl + (buf[nl] === '\r' && buf[nl + 1] === '\n' ? 2 : 1))
      if (line.trim()) {
        opts.onLine(line)
        if (step === 'login' && !openedUrl) {
          const m = URL_RE.exec(line)
          if (m) {
            openedUrl = true
            opts.onLine('(opening that link in your browser…)')
            shell.openExternal(m[1]).catch(() => {})
          }
        }
      }
    }
  }
  child.stdout?.on('data', pump)
  child.stderr?.on('data', pump)
  child.on('error', (e) => {
    opts.onLine(
      (e as NodeJS.ErrnoException).code === 'ENOENT'
        ? `(command not found: ${cmd}. You may need to install Node.js first, or run the command in a terminal.)`
        : `(error: ${e.message})`
    )
    resolveDone()
  })
  child.on('close', (code) => {
    if (buf.trim()) opts.onLine(buf)
    opts.onLine(code === 0 ? '✓ done' : `(exited with code ${code ?? '?'})`)
    resolveDone()
  })

  return {
    done,
    cancel: () => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      opts.onLine('(cancelled)')
      resolveDone()
    }
  }
}

/** Open a PowerShell/terminal window in the agent workspace directory. */
export function openTerminal(): void {
  const dir = getWorkspaceDir()
  if (isWin) {
    spawn('cmd', ['/c', 'start', '""', 'powershell.exe', '-NoExit', '-Command', `Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'`], {
      cwd: dir,
      detached: true,
      stdio: 'ignore'
    }).unref()
  } else if (process.platform === 'darwin') {
    spawn('open', ['-a', 'Terminal', dir], { detached: true, stdio: 'ignore' }).unref()
  } else {
    spawn('x-terminal-emulator', [], { cwd: dir, detached: true, stdio: 'ignore' }).unref()
  }
}
