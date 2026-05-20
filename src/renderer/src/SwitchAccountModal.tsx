import { useRef, useState } from 'react'
import { Bot, Check, Loader2, LogIn, LogOut, RefreshCw, Terminal, X } from 'lucide-react'
import type { Provider, SetupStatus } from '@shared/types'
import { PROVIDER_LABELS } from '@shared/types'
import { api, streamSetupRun, type SetupStepId } from './api'

/** Manage which AI plan the agent talks to: sign in / out of Claude Pro/Max OR ChatGPT Plus/Pro,
 *  and pick which one new chats should use. */
export default function SwitchAccountModal({
  setup,
  onSetupChanged,
  onClose
}: {
  setup: SetupStatus | null
  onSetupChanged: (s: SetupStatus) => void
  onClose: () => void
}): JSX.Element {
  const [busy, setBusy] = useState<SetupStepId | null>(null)
  const [log, setLog] = useState<string[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const logEndRef = useRef<HTMLDivElement | null>(null)

  const activeProvider: Provider = setup?.provider ?? 'claude'

  function push(line: string): void {
    setLog((l) => [...l, line])
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
  }
  function recheck(): void {
    api.getSetup().then(onSetupChanged).catch(() => {})
  }
  async function run(step: SetupStepId): Promise<void> {
    if (busy) return
    setBusy(step)
    setLog([])
    const ac = new AbortController()
    abortRef.current = ac
    try {
      await streamSetupRun(step, push, ac.signal)
    } catch { /* aborted */ }
    finally { abortRef.current = null; setBusy(null); recheck() }
  }
  /** logout → login as a single flow. */
  async function switchFor(provider: Provider): Promise<void> {
    if (busy) return
    setLog([])
    const ac = new AbortController()
    abortRef.current = ac
    const logoutStep: SetupStepId = provider === 'claude' ? 'logout' : 'codex-logout'
    const loginStep: SetupStepId = provider === 'claude' ? 'login' : 'codex-login'
    try {
      setBusy(logoutStep)
      push('— Signing out —')
      await streamSetupRun(logoutStep, push, ac.signal)
      if (ac.signal.aborted) return
      setBusy(loginStep)
      push('')
      push('— Signing in (a browser window will open — pick the account you want) —')
      await streamSetupRun(loginStep, push, ac.signal)
    } catch { /* aborted */ }
    finally { abortRef.current = null; setBusy(null); recheck() }
  }
  function stop(): void { abortRef.current?.abort() }
  function pickActive(p: Provider): void { api.putConfig({ provider: p }).then(() => recheck()).catch(() => {}) }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <h2 className="text-base font-bold text-gray-100">Switch account</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-sm text-gray-400">
            The agent chats on whichever plan is set as active. Sign in to either (or both), then pick the active one.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <AccountCard
              kind="claude"
              setup={setup}
              activeProvider={activeProvider}
              busy={busy}
              onSwitch={() => switchFor('claude')}
              onLogout={() => run('logout')}
              onLogin={() => run('login')}
              onPick={() => pickActive('claude')}
            />
            <AccountCard
              kind="codex"
              setup={setup}
              activeProvider={activeProvider}
              busy={busy}
              onSwitch={() => switchFor('codex')}
              onLogout={() => run('codex-logout')}
              onLogin={() => run('codex-login')}
              onPick={() => pickActive('codex')}
            />
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
            If in-app sign-in stalls, click <b>Open a terminal</b> below and run the printed command
            yourself — that's the most reliable path for the browser hand-off.
          </p>

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
          <div className="flex gap-2">
            <button onClick={() => api.openTerminal().catch(() => {})} className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-ink-800"><Terminal size={13} /> Open a terminal</button>
            <button onClick={recheck} className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-ink-800"><RefreshCw size={13} /> Re-check</button>
          </div>
          <button onClick={onClose} className="rounded-md border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs text-gray-300 hover:bg-ink-800">Close</button>
        </div>
      </div>
    </div>
  )
}

function AccountCard({
  kind,
  setup,
  activeProvider,
  busy,
  onSwitch,
  onLogout,
  onLogin,
  onPick
}: {
  kind: Provider
  setup: SetupStatus | null
  activeProvider: Provider
  busy: SetupStepId | null
  onSwitch: () => void
  onLogout: () => void
  onLogin: () => void
  onPick: () => void
}): JSX.Element {
  const label = PROVIDER_LABELS[kind]
  const installed = kind === 'claude' ? !!setup?.claudeInstalled : !!setup?.codexInstalled
  const isActive = activeProvider === kind
  const account: string = (() => {
    if (!setup) return ''
    if (!installed) return 'CLI not installed.'
    if (kind === 'claude') {
      const a = setup.auth
      if (a?.usingSubscription) return `${a.email ?? '(account)'}${a.subscriptionType ? ` · ${a.subscriptionType}` : ''}`
      if (a?.loggedIn) return `via ${a.authMethod ?? a.apiProvider ?? 'an API method'} (not Pro/Max)`
      return 'Not signed in.'
    }
    return setup.codexAuth?.loggedIn ? 'Signed in to your ChatGPT plan.' : 'Not signed in.'
  })()
  const loggedIn = kind === 'claude' ? !!setup?.auth?.usingSubscription : !!setup?.codexAuth?.loggedIn

  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3 ${isActive ? 'border-accent/50 bg-accent/5' : 'border-ink-700 bg-ink-850'}`}>
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent/15 text-accent"><Bot size={14} /></div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-100">{label}{isActive && <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-accent/15 px-1.5 py-0.5 align-middle text-[10px] text-accent"><Check size={10} /> active</span>}</p>
          <p className="truncate text-[11px] text-gray-500" title={account}>{account}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button onClick={onSwitch} disabled={!installed || !!busy}
          className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-fg hover:brightness-110 disabled:opacity-40">
          {busy ? <Loader2 size={11} className="animate-spin" /> : <LogIn size={11} />} Sign in / switch
        </button>
        <button onClick={onLogin} disabled={!installed || !!busy}
          className="flex items-center gap-1 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-[11px] text-gray-300 hover:bg-ink-800 disabled:opacity-40">
          Sign in only
        </button>
        <button onClick={onLogout} disabled={!installed || !loggedIn || !!busy}
          className="flex items-center gap-1 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-[11px] text-gray-300 hover:bg-ink-800 disabled:opacity-40">
          <LogOut size={11} /> Sign out
        </button>
        {loggedIn && !isActive && (
          <button onClick={onPick} className="ml-auto rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] text-accent hover:bg-accent/20">
            Make active
          </button>
        )}
      </div>

      {!installed && (
        <p className="text-[10px] leading-snug text-amber-400/80">
          Install it first from the setup wizard (Settings → Run setup wizard).
        </p>
      )}
    </div>
  )
}
