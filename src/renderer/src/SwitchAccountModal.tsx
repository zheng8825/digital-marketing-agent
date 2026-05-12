import { useRef, useState } from 'react'
import { Loader2, LogIn, LogOut, RefreshCw, Terminal, X } from 'lucide-react'
import type { SetupStatus } from '@shared/types'
import { api, streamSetupRun } from './api'

/** Sign out of the current Claude account and (optionally) sign in to a different one.
 *  Reuses the setup-run steps: `logout` (= `claude auth logout`) then `login` (= `claude login`,
 *  which opens the browser to sign in). The agent picks up whichever account ends up logged in. */
export default function SwitchAccountModal({
  setup,
  onSetupChanged,
  onClose
}: {
  setup: SetupStatus | null
  onSetupChanged: (s: SetupStatus) => void
  onClose: () => void
}): JSX.Element {
  const [phase, setPhase] = useState<'idle' | 'logout' | 'login' | 'done'>('idle')
  const [log, setLog] = useState<string[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const logEndRef = useRef<HTMLDivElement | null>(null)

  const a = setup?.auth
  const current = a?.loggedIn
    ? `${a.email ?? '(account)'}${a.subscriptionType ? ` · ${a.subscriptionType}` : ''}${a.authMethod ? ` · ${a.authMethod}` : ''}`
    : setup?.claudeLoggedIn
      ? 'signed in (account details unknown)'
      : 'not signed in'

  function push(line: string): void {
    setLog((l) => [...l, line])
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
  }
  function recheck(): void {
    api.getSetup().then(onSetupChanged).catch(() => {})
  }

  /** logout → login, streaming both. */
  async function switchNow(): Promise<void> {
    if (phase === 'logout' || phase === 'login') return
    setLog([])
    const ac = new AbortController()
    abortRef.current = ac
    try {
      setPhase('logout')
      push('— Signing out —')
      await streamSetupRun('logout', push, ac.signal)
      if (ac.signal.aborted) return
      setPhase('login')
      push('')
      push('— Signing in (a browser window will open — pick the account you want) —')
      await streamSetupRun('login', push, ac.signal)
    } catch {
      /* aborted */
    } finally {
      abortRef.current = null
      setPhase('done')
      recheck()
    }
  }
  async function signOutOnly(): Promise<void> {
    if (phase === 'logout' || phase === 'login') return
    setLog([])
    const ac = new AbortController()
    abortRef.current = ac
    try {
      setPhase('logout')
      push('— Signing out —')
      await streamSetupRun('logout', push, ac.signal)
    } catch {
      /* aborted */
    } finally {
      abortRef.current = null
      setPhase('done')
      recheck()
    }
  }
  function stop(): void {
    abortRef.current?.abort()
  }
  const busy = phase === 'logout' || phase === 'login'

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <h2 className="text-base font-bold text-gray-100">Switch Claude account</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-sm text-gray-400">
            The agent runs on whichever Claude account is signed in here. Currently signed in as:
            <b className="ml-1 text-gray-200">{current}</b>.
          </p>
          <p className="mb-4 text-[12px] leading-relaxed text-gray-500">
            <b>Switch account</b> signs you out, then opens a browser window to sign in again — choose the
            account you want (it needs a <b>Pro</b> or <b>Max</b> plan to work). If the browser doesn’t
            open on its own, the sign-in link will appear in the output below — copy it into your browser.
          </p>

          <div className="flex flex-wrap gap-2">
            <button onClick={switchNow} disabled={busy}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:brightness-110 disabled:opacity-40">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}
              {phase === 'logout' ? 'Signing out…' : phase === 'login' ? 'Signing in…' : 'Switch account (sign out → sign in)'}
            </button>
            <button onClick={signOutOnly} disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs text-gray-300 hover:bg-ink-800 disabled:opacity-40">
              <LogOut size={13} /> Just sign out
            </button>
            <button onClick={() => api.openTerminal().catch(() => {})}
              className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs text-gray-300 hover:bg-ink-800">
              <Terminal size={13} /> Open a terminal
            </button>
          </div>

          {log.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-gray-500">Output</span>
                {busy && <button onClick={stop} className="text-[11px] text-rose-400 hover:text-rose-300">Stop</button>}
              </div>
              <pre className="scroll-thin max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/40 p-2.5 text-[11px] leading-relaxed text-gray-400">
                {log.join('\n')}
                <div ref={logEndRef} />
              </pre>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-ink-700 px-5 py-3">
          <button onClick={recheck} className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-ink-800"><RefreshCw size={13} /> Re-check</button>
          <button onClick={onClose} className="rounded-md border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs text-gray-300 hover:bg-ink-800">Close</button>
        </div>
      </div>
    </div>
  )
}
