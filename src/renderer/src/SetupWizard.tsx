import { useRef, useState } from 'react'
import { CheckCircle2, Copy, Loader2, Play, RefreshCw, Terminal, X } from 'lucide-react'
import type { SetupStatus } from '@shared/types'
import { api, streamSetupRun, type SetupStepId } from './api'

interface Step {
  id: SetupStepId
  name: string
  why: string
  cmd: string
  done: (s: SetupStatus) => boolean
  note?: string
}

const STEPS: Step[] = [
  {
    id: 'install-claude',
    name: 'Install Claude Code',
    why: 'The engine the agent runs on. Needs Node.js installed first (nodejs.org).',
    cmd: 'npm install -g @anthropic-ai/claude-code',
    done: (s) => s.claudeInstalled
  },
  {
    id: 'login',
    name: 'Sign in to Claude (Pro / Max plan)',
    why: 'So the agent uses your subscription — not a paid API key. A browser window will open to sign in.',
    cmd: 'claude login',
    done: (s) => s.claudeInstalled && !s.apiKeyInEnv,
    note: 'If you can chat with the agent, you’re signed in. If your account isn’t Pro/Max it won’t work.'
  },
  {
    id: 'install-mem',
    name: 'Set up long-term memory',
    why: 'Lets the agent remember things across chats (the claude-mem add-on).',
    cmd: 'npx claude-mem install',
    done: (s) => s.claudeMemInstalled
  }
]

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

  const allDone = !!setup && STEPS.every((st) => st.done(setup))

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <h2 className="text-base font-bold text-gray-100">First-time setup</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-sm text-gray-400">
            A few one-time steps so the agent works. You only do this once per computer. Click <b>Do it for me</b> —
            or copy the command and run it in a terminal if you prefer.
          </p>

          <div className="space-y-3">
            {STEPS.map((st) => {
              const done = !!setup && st.done(setup)
              const busy = running === st.id
              return (
                <div key={st.id} className={`rounded-xl border p-3 ${done ? 'border-emerald-800/60 bg-emerald-950/20' : 'border-ink-700 bg-ink-850'}`}>
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5">{done ? <CheckCircle2 size={16} className="text-emerald-400" /> : <span className="grid h-4 w-4 place-items-center rounded-full border border-gray-600 text-[10px] text-gray-500">{STEPS.indexOf(st) + 1}</span>}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-200">{st.name} {done && <span className="text-xs font-normal text-emerald-400">— done</span>}</p>
                      <p className="text-[12px] leading-snug text-gray-500">{st.why}</p>
                      {st.note && <p className="mt-0.5 text-[11px] leading-snug text-gray-600">{st.note}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => run(st.id)}
                          disabled={!!running}
                          className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg hover:brightness-110 disabled:opacity-40"
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                          {busy ? 'Running…' : done ? 'Run again' : 'Do it for me'}
                        </button>
                        <code className="rounded bg-black/30 px-1.5 py-0.5 text-[11px] text-gray-400">{st.cmd}</code>
                        <button onClick={() => copy(st.cmd)} title="Copy command" className="text-gray-500 hover:text-gray-300">
                          {copied === st.cmd ? <span className="text-[11px] text-emerald-400">copied</span> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
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
          <button onClick={onClose} className={`rounded-md px-3 py-1.5 text-xs font-medium ${allDone ? 'bg-accent text-accent-fg hover:brightness-110' : 'border border-ink-700 bg-ink-850 text-gray-300 hover:bg-ink-800'}`}>
            {allDone ? 'All set — start using the agent' : 'Skip for now'}
          </button>
        </div>
      </div>
    </div>
  )
}
