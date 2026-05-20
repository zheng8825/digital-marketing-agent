import { useRef, useState } from 'react'
import { Bot, CheckCircle2, Copy, Loader2, Play, RefreshCw, Sparkles, Terminal, X } from 'lucide-react'
import type { Provider, SetupStatus } from '@shared/types'
import { PROVIDER_LABELS } from '@shared/types'
import { api, streamSetupRun, type SetupStepId } from './api'

interface Step {
  id: SetupStepId
  name: string
  why: string
  cmd: string
  done: (s: SetupStatus) => boolean
  note?: string
}

const CLAUDE_STEPS: Step[] = [
  {
    id: 'install-claude',
    name: 'Install Claude Code',
    why: 'The engine for Claude Pro/Max. Needs Node.js installed first (nodejs.org).',
    cmd: 'npm install -g @anthropic-ai/claude-code',
    done: (s) => s.claudeInstalled
  },
  {
    id: 'login',
    name: 'Sign in to Claude',
    why: 'A browser window will open to sign in to your Claude Pro/Max plan. (No API key needed.)',
    cmd: 'claude login',
    done: (s) => !!s.auth?.usingSubscription,
    note: 'If your account isn’t on a Pro/Max plan, the agent won’t run.'
  }
]

const CODEX_STEPS: Step[] = [
  {
    id: 'install-codex',
    name: 'Install Codex CLI',
    why: 'The engine for ChatGPT Plus/Pro. Needs Node.js installed first (nodejs.org).',
    cmd: 'npm install -g @openai/codex',
    done: (s) => s.codexInstalled
  },
  {
    id: 'codex-login',
    name: 'Sign in to ChatGPT',
    why: 'A browser window will open to sign in to your ChatGPT Plus/Pro plan. (No API key needed.)',
    cmd: 'codex login',
    done: (s) => !!s.codexAuth?.loggedIn
  }
]

const MEM_STEP: Step = {
  id: 'install-mem',
  name: 'Long-term memory (claude-mem)',
  why: 'Optional. Lets Claude remember things across chats. Only used with the Claude provider.',
  cmd: 'npx claude-mem install',
  done: (s) => s.claudeMemInstalled
}

export default function SetupWizard({
  setup,
  onSetupChanged,
  onClose
}: {
  setup: SetupStatus | null
  onSetupChanged: (s: SetupStatus) => void
  onClose: () => void
}): JSX.Element {
  const [running, setRunning] = useState<SetupStepId | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [copied, setCopied] = useState<string>('')
  const [activeProvider, setActiveProvider] = useState<Provider>(setup?.provider ?? 'claude')
  const abortRef = useRef<AbortController | null>(null)
  const logEndRef = useRef<HTMLDivElement | null>(null)

  function pushLog(line: string): void {
    setLog((l) => [...l, line])
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
  }
  function recheck(): void {
    api.getSetup().then(onSetupChanged).catch(() => {})
  }
  async function run(step: SetupStepId): Promise<void> {
    if (running) return
    setRunning(step)
    setLog([])
    const ac = new AbortController()
    abortRef.current = ac
    try {
      await streamSetupRun(step, pushLog, ac.signal)
    } catch {
      /* aborted */
    } finally {
      setRunning(null)
      abortRef.current = null
      recheck()
    }
  }
  function stop(): void {
    abortRef.current?.abort()
  }
  function copy(cmd: string): void {
    navigator.clipboard.writeText(cmd)
    setCopied(cmd)
    setTimeout(() => setCopied(''), 1500)
  }
  function openTerminal(): void {
    api.openTerminal().catch(() => {})
  }
  function changeProvider(p: Provider): void {
    setActiveProvider(p)
    api.putConfig({ provider: p }).then(() => recheck()).catch(() => {})
  }

  const claudeReady = !!setup && CLAUDE_STEPS.every((st) => st.done(setup))
  const codexReady = !!setup && CODEX_STEPS.every((st) => st.done(setup))
  const allSet = (activeProvider === 'claude' && claudeReady) || (activeProvider === 'codex' && codexReady)

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <h2 className="text-base font-bold text-gray-100">Sign in to your AI plan</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-sm text-gray-400">
            The agent runs on <b>your own</b> Claude Pro/Max <i>or</i> ChatGPT Plus/Pro subscription —
            no API key, no extra billing. Sign into whichever you have (or both). The browser will
            open automatically for the sign-in.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <ProviderCard
              kind="claude"
              setup={setup}
              steps={CLAUDE_STEPS}
              running={running}
              activeProvider={activeProvider}
              ready={claudeReady}
              onRun={run}
              onCopy={copy}
              onPick={() => changeProvider('claude')}
              copied={copied}
            />
            <ProviderCard
              kind="codex"
              setup={setup}
              steps={CODEX_STEPS}
              running={running}
              activeProvider={activeProvider}
              ready={codexReady}
              onRun={run}
              onCopy={copy}
              onPick={() => changeProvider('codex')}
              copied={copied}
            />
          </div>

          {/* Optional: claude-mem (only relevant when Claude is the chosen provider) */}
          {activeProvider === 'claude' && (
            <div className={`mt-3 rounded-xl border p-3 text-xs ${MEM_STEP.done(setup ?? ({} as SetupStatus)) ? 'border-emerald-800/60 bg-emerald-950/20' : 'border-ink-700 bg-ink-850'}`}>
              <div className="flex items-start gap-2.5">
                <Sparkles size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-200">{MEM_STEP.name} {MEM_STEP.done(setup ?? ({} as SetupStatus)) && <span className="text-xs font-normal text-emerald-400">— installed</span>}</p>
                  <p className="text-[12px] leading-snug text-gray-500">{MEM_STEP.why}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => run(MEM_STEP.id)}
                      disabled={!!running}
                      className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-900 px-2.5 py-1 text-xs text-gray-200 hover:bg-ink-800 disabled:opacity-40"
                    >
                      {running === MEM_STEP.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      {running === MEM_STEP.id ? 'Running…' : MEM_STEP.done(setup ?? ({} as SetupStatus)) ? 'Re-install' : 'Install'}
                    </button>
                    <code className="rounded bg-black/30 px-1.5 py-0.5 text-[11px] text-gray-400">{MEM_STEP.cmd}</code>
                    <button onClick={() => copy(MEM_STEP.cmd)} title="Copy command" className="text-gray-500 hover:text-gray-300">
                      {copied === MEM_STEP.cmd ? <span className="text-[11px] text-emerald-400">copied</span> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active provider footer — locks in which CLI the next chat uses. */}
          <div className="mt-4 rounded-xl border border-ink-700 bg-ink-850 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Which plan do chats use?</p>
            <div className="flex flex-wrap gap-2">
              {(['claude', 'codex'] as const).map((p) => (
                <label key={p} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${activeProvider === p ? 'border-accent/60 bg-accent/10 text-gray-100' : 'border-ink-700 bg-ink-900 text-gray-300 hover:bg-ink-800'}`}>
                  <input type="radio" name="provider" checked={activeProvider === p} onChange={() => changeProvider(p)} className="accent-accent" />
                  {PROVIDER_LABELS[p]}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-500">You can change this later (Settings → Provider). Each chat stays on the provider it started with.</p>
          </div>

          {log.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-gray-500">Output</span>
                {running && <button onClick={stop} className="text-[11px] text-rose-400 hover:text-rose-300">Stop</button>}
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
            <button onClick={openTerminal} className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-ink-800"><Terminal size={13} /> Open a terminal</button>
            <button onClick={recheck} className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-ink-800"><RefreshCw size={13} /> Re-check</button>
          </div>
          <button onClick={onClose} className={`rounded-md px-3 py-1.5 text-xs font-medium ${allSet ? 'bg-accent text-accent-fg hover:brightness-110' : 'border border-ink-700 bg-ink-850 text-gray-300 hover:bg-ink-800'}`}>
            {allSet ? 'All set — start chatting' : 'Skip for now'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProviderCard({
  kind,
  setup,
  steps,
  running,
  activeProvider,
  ready,
  onRun,
  onCopy,
  onPick,
  copied
}: {
  kind: Provider
  setup: SetupStatus | null
  steps: Step[]
  running: SetupStepId | null
  activeProvider: Provider
  ready: boolean
  onRun: (id: SetupStepId) => void
  onCopy: (cmd: string) => void
  onPick: () => void
  copied: string
}): JSX.Element {
  const isActive = activeProvider === kind
  const label = PROVIDER_LABELS[kind]
  const statusLine = (() => {
    if (!setup) return ''
    if (kind === 'claude') {
      if (!setup.claudeInstalled) return 'Claude Code not installed yet.'
      const a = setup.auth
      if (a?.usingSubscription) return `Signed in as ${a.email ?? '(account)'}${a.subscriptionType ? ` · ${a.subscriptionType}` : ''}.`
      if (a?.loggedIn) return `Signed in via ${a.authMethod ?? a.apiProvider ?? 'an API method'} — not a Pro/Max plan.`
      return 'Not signed in yet.'
    }
    if (!setup.codexInstalled) return 'codex CLI not installed yet.'
    if (setup.codexAuth?.loggedIn) return 'Signed in to your ChatGPT plan.'
    return 'Not signed in yet.'
  })()

  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3 ${ready ? 'border-emerald-800/60 bg-emerald-950/15' : 'border-ink-700 bg-ink-850'}`}>
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent/15 text-accent"><Bot size={14} /></div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-100">{label}{ready && <CheckCircle2 size={14} className="ml-1 inline align-middle text-emerald-400" />}</p>
          <p className="text-[11px] text-gray-500">{statusLine}</p>
        </div>
        {ready && !isActive && (
          <button onClick={onPick} className="rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-[11px] text-gray-300 hover:bg-ink-800">Use this</button>
        )}
      </div>

      <div className="space-y-1.5">
        {steps.map((st) => {
          const done = !!setup && st.done(setup)
          const busy = running === st.id
          return (
            <div key={st.id} className="rounded-lg border border-ink-700/70 bg-ink-900 p-2">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 shrink-0">{done ? <CheckCircle2 size={14} className="text-emerald-400" /> : <span className="grid h-3.5 w-3.5 place-items-center rounded-full border border-gray-600 text-[9px] text-gray-500">·</span>}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-200">{st.name}</p>
                  <p className="text-[11px] leading-snug text-gray-500">{st.why}</p>
                  {st.note && <p className="mt-0.5 text-[10px] leading-snug text-gray-600">{st.note}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => onRun(st.id)}
                      disabled={!!running}
                      className="flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-fg hover:brightness-110 disabled:opacity-40"
                    >
                      {busy ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                      {busy ? 'Running…' : done ? 'Run again' : 'Do it for me'}
                    </button>
                    <code className="rounded bg-black/30 px-1 py-0.5 text-[10px] text-gray-400">{st.cmd}</code>
                    <button onClick={() => onCopy(st.cmd)} title="Copy command" className="text-gray-500 hover:text-gray-300">
                      {copied === st.cmd ? <span className="text-[10px] text-emerald-400">copied</span> : <Copy size={11} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
