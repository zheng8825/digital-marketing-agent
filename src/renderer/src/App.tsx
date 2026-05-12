import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Bot,
  BookOpen,
  Copy,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  ShieldAlert,
  StopCircle,
  Terminal,
  Trash2,
  User,
  Wrench,
  X
} from 'lucide-react'
import type {
  AgentFileRef,
  AppConfig,
  ChatMessage,
  EffortOption,
  ModelOption,
  SessionMeta,
  SetupStatus,
  TurnUsage,
  UsageReport
} from '@shared/types'
import { api, fmtDuration, fmtTokens, relTime, streamChat } from './api'
import SetupWizard from './SetupWizard'

type Status = 'idle' | 'working' | 'error'

const QUICK_ACTIONS: { cmd: string; label: string; hint: string }[] = [
  { cmd: '/post', label: 'Social post', hint: 'trilingual FB/IG/TikTok copy + hashtags + calendar row' },
  { cmd: '/campaign', label: 'Campaign plan', hint: 'seasonal/launch plan + ad copy + KOLs + UTMs' },
  { cmd: '/gtm', label: 'GTM plan', hint: 'go-to-market plan for a new notebook launch (pre-launch → launch → sustain)' },
  { cmd: '/report', label: 'Monthly report', hint: 'turn raw numbers into a report + recommendations' },
  { cmd: '/ppt', label: 'Slide deck', hint: 'turn a plan/report/topic into a presentation outline + speaker notes' },
  { cmd: '/kol', label: 'KOL / research', hint: 'shortlists, briefs, outreach, competitor scan' }
]

/** Derive the "who's signed in / on what plan" chip shown in the header, from the setup probe. */
function planLabel(t?: string): string {
  if (!t) return ''
  const m: Record<string, string> = { max: 'Max', pro: 'Pro', team: 'Team', enterprise: 'Enterprise' }
  return m[t] ?? t[0].toUpperCase() + t.slice(1)
}
function authChip(setup: SetupStatus | null): { tone: 'ok' | 'warn' | 'dim'; label: string; title: string } | null {
  if (!setup || !setup.claudeInstalled) return null // the setup banner covers "not installed"
  const a = setup.auth
  if (a?.usingSubscription) {
    const plan = planLabel(a.subscriptionType)
    return {
      tone: 'ok',
      label: a.email ? `${a.email}${plan ? ` · ${plan}` : ''}` : `Claude ${plan || 'subscription'}`,
      title: `Signed in as ${a.email ?? '(account)'} — the agent runs on your Claude ${plan || 'Pro/Max'} subscription (auth: ${a.authMethod ?? 'claude.ai'}), not the paid API.`
    }
  }
  if (a?.loggedIn) {
    const via = a.authMethod ?? a.apiProvider ?? 'an API method'
    return { tone: 'warn', label: `via ${via}`, title: `The agent is authenticating via ${via}${a.apiProvider && a.apiProvider !== 'firstParty' ? ` (${a.apiProvider})` : ''} — not a Pro/Max subscription. Run \`claude login\` and pick your plan.` }
  }
  if (a && !a.loggedIn) return { tone: 'warn', label: 'not signed in', title: 'Claude is not signed in. Run `claude login` with your Pro/Max plan (or use the setup wizard).' }
  // Couldn't read `claude auth status` — fall back to the file heuristic.
  return setup.claudeLoggedIn
    ? { tone: 'dim', label: 'signed in', title: "Claude looks signed in (couldn't read the account details). Open a terminal and run `claude auth status` to confirm." }
    : { tone: 'warn', label: 'sign in', title: 'Claude may not be signed in. Run `claude login` with your Pro/Max plan.' }
}

export default function App(): JSX.Element {
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [setupDismissed, setSetupDismissed] = useState(false)
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [statusMsg, setStatusMsg] = useState('Ready')
  const [streaming, setStreaming] = useState('')
  const [toolLog, setToolLog] = useState<string[]>([])

  const [rightTab, setRightTab] = useState<'notes' | 'train'>('notes')
  const [notes, setNotes] = useState(() => localStorage.getItem('ma:notes') ?? '')
  const [trainFiles, setTrainFiles] = useState<AgentFileRef[]>([])
  const [trainPath, setTrainPath] = useState('CLAUDE.md')
  const [trainContent, setTrainContent] = useState('')
  const [trainDirty, setTrainDirty] = useState(false)
  const [trainNote, setTrainNote] = useState('')
  const [syncNote, setSyncNote] = useState('')
  const [syncing, setSyncing] = useState(false)

  const [models, setModels] = useState<ModelOption[]>([])
  const [efforts, setEfforts] = useState<EffortOption[]>([])
  const [config, setConfig] = useState<AppConfig & { workspaceDir?: string }>({})
  const [usage, setUsage] = useState<UsageReport | null>(null)
  const [lastTurn, setLastTurn] = useState<TurnUsage | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showUsage, setShowUsage] = useState(false)
  const [showWizard, setShowWizard] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const refreshSessions = useCallback(() => api.listSessions().then(setSessions).catch(() => {}), [])
  const refreshUsage = useCallback(() => api.getUsage().then(setUsage).catch(() => {}), [])
  const refreshSetup = useCallback(() => api.getSetup().then(setSetup).catch(() => {}), [])

  useEffect(() => {
    api.getSetup().then((s) => { setSetup(s); if (!s.claudeInstalled) setShowWizard(true) }).catch(() => {})
    refreshSessions()
    refreshUsage()
    api.trainableFiles().then(setTrainFiles).catch(() => {})
    api.getModels().then((r) => { setModels(r.models); setEfforts(r.efforts) }).catch(() => {})
    api.getConfig().then(setConfig).catch(() => {})
  }, [refreshSessions, refreshUsage])

  useEffect(() => { localStorage.setItem('ma:notes', notes) }, [notes])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streaming, toolLog])

  const loadTrainFile = useCallback((path: string) => {
    setTrainPath(path)
    api.getAgentFile(path).then((r) => { setTrainContent(r.content); setTrainDirty(false) })
      .catch((e) => setTrainNote(`Couldn't load: ${e.message}`))
  }, [])
  useEffect(() => {
    if (rightTab === 'train' && !trainContent && !trainDirty) loadTrainFile(trainPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightTab])

  function newChat(): void {
    abortRef.current?.abort()
    setActiveId(null); setMessages([]); setStreaming(''); setToolLog([])
    setStatus('idle'); setStatusMsg('Ready'); setInput('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }
  function openSession(id: string): void {
    if (status === 'working') return
    api.getSession(id).then((s) => {
      setActiveId(s.id); setMessages(s.messages); setStreaming(''); setToolLog([])
      setStatus('idle'); setStatusMsg('Ready')
    }).catch(() => {})
  }
  function removeSession(id: string, e: React.MouseEvent): void {
    e.stopPropagation()
    api.deleteSession(id).then(() => { if (activeId === id) newChat(); refreshSessions() })
  }

  async function send(): Promise<void> {
    const text = input.trim()
    if (!text || status === 'working') return
    setMessages((m) => [...m, { role: 'user', content: text, ts: Date.now() }])
    setInput(''); setStreaming(''); setToolLog([])
    setStatus('working'); setStatusMsg('Thinking…')
    const ac = new AbortController()
    abortRef.current = ac
    let acc = ''
    let isNew = !activeId
    try {
      await streamChat({ conversationId: activeId ?? undefined, message: text }, (ev) => {
        if (ev.type === 'session') {
          if (isNew) { setActiveId(ev.id); isNew = false; refreshSessions() }
        } else if (ev.type === 'delta') {
          acc += ev.text; setStreaming(acc); setStatusMsg('Replying…')
        } else if (ev.type === 'tool') {
          setToolLog((t) => [...t, ev.summary]); setStatusMsg(`Working: ${ev.summary}`)
        } else if (ev.type === 'done') {
          setMessages((m) => [...m, { role: 'assistant', content: acc || '(no response)', ts: Date.now() }])
          setStreaming(''); setStatus('idle'); setStatusMsg('Ready')
          if (ev.usage) setLastTurn(ev.usage)
          refreshSessions(); refreshUsage()
        } else if (ev.type === 'error') {
          setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${ev.message}`, ts: Date.now() }])
          setStreaming(''); setStatus('error'); setStatusMsg('Error — see the message above'); refreshSessions()
        }
      }, ac.signal)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') { setStatus('error'); setStatusMsg((e as Error).message) }
    } finally {
      if (abortRef.current === ac) abortRef.current = null
    }
  }
  function stop(): void {
    abortRef.current?.abort()
    if (streaming) setMessages((m) => [...m, { role: 'assistant', content: streaming, ts: Date.now() }])
    setStreaming(''); setStatus('idle'); setStatusMsg('Stopped')
  }
  function quick(cmd: string): void { setInput((v) => (v.trim() ? v : cmd + ' ')); inputRef.current?.focus() }
  function openTerminal(): void {
    api.openTerminal().catch(() => setStatusMsg("Couldn't open a terminal — open PowerShell yourself in the workspace folder."))
  }

  function saveTrain(): void {
    api.putAgentFile(trainPath, trainContent).then(() => {
      setTrainDirty(false); setTrainNote('Saved. The agent uses this next time it reads that file.')
      setTimeout(() => setTrainNote(''), 4000)
    }).catch((e) => setTrainNote(`Save failed: ${e.message}`))
  }
  function doSync(): void {
    setSyncing(true); setSyncNote('')
    api.sync().then((r) => setSyncNote(r.message)).catch((e) => setSyncNote(e.message)).finally(() => setSyncing(false))
  }
  function changeConfig(patch: Partial<AppConfig>): void {
    api.putConfig(patch).then(setConfig).catch(() => {})
  }

  const dot = status === 'working' ? 'bg-amber-400 pulse-dot' : status === 'error' ? 'bg-rose-500' : 'bg-emerald-400'
  const showSetup = setup && !setupDismissed && (!setup.claudeInstalled || setup.apiKeyInEnv || !setup.claudeMemInstalled)

  const greeting = useMemo(
    () => "Hi — I'm your ASUS Malaysia notebook marketing agent. Ask me for social copy, a campaign plan, a monthly report, KOL help… or use the quick buttons below. Type in 中文 / English / Bahasa Melayu — whatever you like.",
    []
  )

  return (
    <div className="flex h-screen w-screen flex-col bg-ink-950 text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-ink-700 bg-ink-900 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent/15 text-accent"><Bot size={16} /></div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold leading-tight">Marketing Agent</h1>
            <p className="truncate text-[11px] leading-tight text-gray-500">ASUS Malaysia · notebooks</p>
          </div>
          {(() => {
            const ac = authChip(setup)
            if (!ac) return null
            const tone =
              ac.tone === 'ok' ? 'border-emerald-700/50 bg-emerald-950/40 text-emerald-300'
              : ac.tone === 'warn' ? 'border-amber-700/50 bg-amber-950/40 text-amber-300'
              : 'border-ink-700 bg-ink-850 text-gray-400'
            return (
              <button onClick={() => setShowSettings(true)} title={ac.title}
                className={`ml-1 hidden max-w-[15rem] items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] lg:flex ${tone}`}>
                {ac.tone === 'warn' ? <ShieldAlert size={12} className="shrink-0" /> : <User size={12} className="shrink-0" />}
                <span className="truncate">{ac.label}</span>
              </button>
            )
          })()}
        </div>

        <div className="flex items-center gap-2">
          {/* Model + Effort — inline, always visible */}
          <label className="hidden items-center gap-1.5 text-[11px] text-gray-500 md:flex">
            Model
            <select
              value={config.model ?? ''}
              onChange={(e) => changeConfig({ model: e.target.value })}
              title={models.find((m) => m.id === (config.model ?? ''))?.note}
              className="rounded-md border border-ink-700 bg-ink-850 px-1.5 py-1 text-xs text-gray-200 focus:outline-none"
            >
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="hidden items-center gap-1.5 text-[11px] text-gray-500 md:flex">
            Effort
            <select
              value={config.thinkingEffort ?? 'off'}
              onChange={(e) => changeConfig({ thinkingEffort: e.target.value as AppConfig['thinkingEffort'] })}
              title={efforts.find((x) => x.id === (config.thinkingEffort ?? 'off'))?.note}
              className="rounded-md border border-ink-700 bg-ink-850 px-1.5 py-1 text-xs text-gray-200 focus:outline-none"
            >
              {efforts.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>

          {/* Usage chip */}
          <button
            onClick={() => setShowUsage((v) => !v)}
            title="Token usage (on a Pro/Max plan you're not billed per token — this is just throughput)"
            className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-2 py-1 text-[11px] text-gray-400 hover:bg-ink-800"
          >
            <Activity size={12} />
            {lastTurn ? `↑${fmtTokens(lastTurn.inputTokens + lastTurn.cacheReadTokens)} ↓${fmtTokens(lastTurn.outputTokens)} · ${fmtDuration(lastTurn.durationMs)}` : usage ? `${fmtTokens(usage.today.outputTokens)} today` : 'usage'}
          </button>

          <span className="hidden text-xs text-gray-400 lg:inline">{statusMsg}</span>
          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />

          <button onClick={doSync} disabled={syncing} title="Commit & push your training/output changes to GitHub"
            className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-2 py-1 text-xs text-gray-300 hover:bg-ink-800 disabled:opacity-50">
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}<span className="hidden sm:inline">Sync</span>
          </button>
          <button onClick={() => setShowSettings(true)} title="Settings" className="rounded-md border border-ink-700 bg-ink-850 p-1.5 text-gray-300 hover:bg-ink-800">
            <Settings size={14} />
          </button>
        </div>
      </header>

      {/* Usage detail popover */}
      {showUsage && usage && (
        <div className="absolute right-4 top-12 z-30 w-72 rounded-xl border border-ink-700 bg-ink-850 p-3 text-xs shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-gray-200">Usage</span>
            <button onClick={() => setShowUsage(false)} className="text-gray-500 hover:text-gray-300"><X size={13} /></button>
          </div>
          {lastTurn && (
            <div className="mb-2 rounded-lg bg-ink-900 p-2">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">Last reply</p>
              <p className="text-gray-300">In {fmtTokens(lastTurn.inputTokens)} · cache {fmtTokens(lastTurn.cacheReadTokens)} · Out {fmtTokens(lastTurn.outputTokens)} · {fmtDuration(lastTurn.durationMs)}</p>
            </div>
          )}
          <p className="text-gray-300">Today ({usage.date}): <b>{usage.today.turns}</b> replies · {fmtTokens(usage.today.inputTokens + usage.today.cacheReadTokens)} in · {fmtTokens(usage.today.outputTokens)} out</p>
          <p className="mt-1 text-gray-400">All time: {usage.allTime.turns} replies · {fmtTokens(usage.allTime.outputTokens)} out</p>
          <p className="mt-2 text-[10px] leading-relaxed text-gray-500">You're on a Claude Pro/Max plan, so there's no per-token charge — these numbers just show how much the agent is working. If you hit your plan's usage limit, Claude will tell you in the chat.</p>
        </div>
      )}

      {showSetup && (
        <div className="flex items-start gap-3 border-b border-amber-900/60 bg-amber-950/40 px-5 py-2 text-xs text-amber-200">
          <Wrench size={14} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">Setup needed: </span>
            {!setup?.claudeInstalled && (<span>Install Claude Code (<code className="rounded bg-black/30 px-1">npm i -g @anthropic-ai/claude-code</code>) then <code className="rounded bg-black/30 px-1">claude login</code> with your Pro/Max plan. </span>)}
            {setup?.apiKeyInEnv && (<span>⚠️ <code className="rounded bg-black/30 px-1">ANTHROPIC_API_KEY</code> is set in your environment — that would bill the paid API instead of your subscription. Unset it. </span>)}
            {!setup?.claudeMemInstalled && (<span>For long-term memory, run <code className="rounded bg-black/30 px-1">npx claude-mem install</code>. </span>)}
            <button className="ml-1 font-semibold underline" onClick={() => setShowWizard(true)}>Set it up</button>
            <button className="ml-2 underline" onClick={refreshSetup}>Re-check</button>
          </div>
          <button className="underline" onClick={() => setSetupDismissed(true)}>Dismiss</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left: chats */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-900 md:flex">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Chats</h2>
            <button onClick={newChat} title="New chat" className="text-gray-400 hover:text-white"><Plus size={16} /></button>
          </div>
          <div className="scroll-thin flex-1 space-y-0.5 overflow-y-auto p-2">
            <button onClick={newChat} className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${activeId === null ? 'bg-ink-800 text-gray-100' : 'text-gray-300 hover:bg-ink-850'}`}>
              <Plus size={14} className="shrink-0 text-gray-500" /> New chat
            </button>
            {sessions.map((s) => (
              <div key={s.id} onClick={() => openSession(s.id)} className={`group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 ${activeId === s.id ? 'bg-ink-800' : 'hover:bg-ink-850'}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-200">{s.title}</p>
                  <p className="text-[11px] text-gray-500">{relTime(s.updatedAt)}</p>
                </div>
                <button onClick={(e) => removeSession(s.id, e)} title="Delete" className="hidden text-gray-500 hover:text-rose-400 group-hover:block"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </aside>

        {/* Center: chat */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-5" onClick={() => { showUsage && setShowUsage(false) }}>
            {messages.length === 0 && !streaming && (
              <div className="mr-auto max-w-[80%] rounded-2xl rounded-bl-md bg-ink-850 px-4 py-3 text-sm text-gray-200"><p className="msg-body">{greeting}</p></div>
            )}
            {messages.map((m, i) => <Bubble key={i} role={m.role} text={m.content} />)}
            {toolLog.map((t, i) => (
              <div key={`tool-${i}`} className="mr-auto flex max-w-[80%] items-center gap-1.5 rounded-lg bg-ink-900 px-2.5 py-1 text-[11px] text-gray-500"><Wrench size={11} /> {t}</div>
            ))}
            {streaming && <Bubble role="assistant" text={streaming} streaming />}
            {status === 'working' && !streaming && (
              <div className="mr-auto flex items-center gap-2 rounded-2xl rounded-bl-md bg-ink-850 px-4 py-2.5 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" /> {statusMsg}</div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-ink-700 bg-ink-900 px-4 pb-3 pt-2.5">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {QUICK_ACTIONS.map((q) => (
                <button key={q.cmd} onClick={() => quick(q.cmd)} title={`${q.cmd} — ${q.hint}`} className="rounded-full border border-ink-700 bg-ink-850 px-3 py-1 text-xs text-gray-300 hover:border-accent/50 hover:text-white">{q.label}</button>
              ))}
              <button onClick={openTerminal} title="Open a terminal in the agent's workspace folder — to run `claude`, `claude auth status`, git, etc."
                className="ml-auto flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-850 px-3 py-1 text-xs text-gray-400 hover:border-accent/50 hover:text-white">
                <Terminal size={12} /> Terminal
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex items-end gap-2">
              <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                rows={2} placeholder="Ask the agent…  (Enter to send, Shift+Enter for a new line)"
                className="scroll-thin flex-1 resize-none rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-accent/60 focus:outline-none" />
              {status === 'working' ? (
                <button type="button" onClick={stop} className="grid h-9 w-9 place-items-center rounded-lg bg-rose-600/80 text-white hover:bg-rose-600" title="Stop"><StopCircle size={16} /></button>
              ) : (
                <button type="submit" disabled={!input.trim()} className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-fg hover:brightness-110 disabled:opacity-40" title="Send"><Send size={16} /></button>
              )}
            </form>
          </div>
        </main>

        {/* Right: workspace / training */}
        <aside className="hidden w-80 shrink-0 flex-col border-l border-ink-700 bg-ink-900 lg:flex">
          <div className="flex border-b border-ink-700 text-xs">
            {(['notes', 'train'] as const).map((t) => (
              <button key={t} onClick={() => setRightTab(t)} className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 font-semibold uppercase tracking-wider ${rightTab === t ? 'bg-ink-850 text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
                {t === 'notes' ? <BookOpen size={13} /> : <Bot size={13} />}{t === 'notes' ? 'Notes' : 'Train agent'}
              </button>
            ))}
          </div>
          {rightTab === 'notes' ? (
            <div className="flex flex-1 flex-col gap-2 p-3">
              <p className="text-[11px] text-gray-500">Scratchpad — drafts, ideas, outputs. Saved on this machine.</p>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes, drafts, pasted outputs…"
                className="scroll-thin flex-1 resize-none rounded-lg border border-ink-700 bg-ink-850 p-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-sky-500/60 focus:outline-none" />
              <div className="flex gap-2">
                <button onClick={() => setNotes('')} className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs text-gray-300 hover:bg-ink-800">Clear</button>
                <button onClick={() => navigator.clipboard.writeText(notes)} className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs text-gray-300 hover:bg-ink-800"><Copy size={12} /> Copy</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-2 p-3">
              <p className="text-[11px] text-gray-500">Teach the agent: edit its instructions or knowledge. Changes persist and (after Sync) reach the other machine.</p>
              <select value={trainPath} onChange={(e) => loadTrainFile(e.target.value)} className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1.5 text-xs text-gray-200 focus:outline-none">
                {trainFiles.map((f) => <option key={f.path} value={f.path}>{f.label}</option>)}
              </select>
              <textarea value={trainContent} onChange={(e) => { setTrainContent(e.target.value); setTrainDirty(true) }} spellCheck={false}
                className="scroll-thin flex-1 resize-none rounded-lg border border-ink-700 bg-ink-850 p-3 font-mono text-[12px] leading-relaxed text-gray-100 focus:border-accent/60 focus:outline-none" />
              <div className="flex items-center gap-2">
                <button onClick={saveTrain} disabled={!trainDirty} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:brightness-110 disabled:opacity-40"><Save size={12} /> Save</button>
                <button onClick={() => loadTrainFile(trainPath)} className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs text-gray-300 hover:bg-ink-800">Revert</button>
                {trainNote && <span className="truncate text-[11px] text-gray-400">{trainNote}</span>}
              </div>
            </div>
          )}
          {syncNote && <div className="border-t border-ink-700 px-3 py-2 text-[11px] text-gray-400"><span className="msg-body">{syncNote}</span></div>}
        </aside>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          models={models}
          efforts={efforts}
          config={config}
          setup={setup}
          onChange={changeConfig}
          onRecheckSetup={refreshSetup}
          onOpenWorkspace={() => window.appBridge.openWorkspace()}
          onOpenTerminal={openTerminal}
          onOpenWizard={() => { setShowSettings(false); setShowWizard(true) }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showWizard && <SetupWizard setup={setup} onSetupChanged={setSetup} onClose={() => setShowWizard(false)} />}
    </div>
  )
}

function Bubble({ role, text, streaming }: { role: 'user' | 'assistant'; text: string; streaming?: boolean }): JSX.Element {
  const isUser = role === 'user'
  return (
    <div className={isUser ? 'ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-fg' : 'mr-auto max-w-[80%] rounded-2xl rounded-bl-md bg-ink-850 px-4 py-2.5 text-sm text-gray-100'}>
      <p className="msg-body">{text}{streaming && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-gray-400 align-middle" />}</p>
    </div>
  )
}

function SettingsModal(props: {
  models: ModelOption[]
  efforts: EffortOption[]
  config: AppConfig & { workspaceDir?: string }
  setup: SetupStatus | null
  onChange: (patch: Partial<AppConfig>) => void
  onRecheckSetup: () => void
  onOpenWorkspace: () => void
  onOpenTerminal: () => void
  onOpenWizard: () => void
  onClose: () => void
}): JSX.Element {
  const { models, efforts, config, setup, onChange, onRecheckSetup, onOpenWorkspace, onOpenTerminal, onOpenWizard, onClose } = props
  const model = models.find((m) => m.id === (config.model ?? ''))
  const effort = efforts.find((e) => e.id === (config.thinkingEffort ?? 'off'))
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-100">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Model</label>
            <select value={config.model ?? ''} onChange={(e) => onChange({ model: e.target.value })}
              className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-gray-100 focus:border-accent/60 focus:outline-none">
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            {model && <p className="mt-1 text-[11px] text-gray-500">{model.note}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Effort (thinking depth)</label>
            <select value={config.thinkingEffort ?? 'off'} onChange={(e) => onChange({ thinkingEffort: e.target.value as AppConfig['thinkingEffort'] })}
              className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-gray-100 focus:border-accent/60 focus:outline-none">
              {efforts.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            {effort && <p className="mt-1 text-[11px] text-gray-500">{effort.note}</p>}
          </div>

          <p className="text-[11px] text-gray-500">Changes take effect on your next message.</p>

          <div className="rounded-lg border border-ink-700 bg-ink-850 p-3 text-xs">
            <p className="mb-1 font-semibold text-gray-400">Setup &amp; account</p>
            <ul className="space-y-0.5 text-gray-400">
              <li>{setup?.claudeInstalled ? '✅' : '❌'} Claude Code {setup?.claudeVersion ? `(${setup.claudeVersion})` : 'installed'}</li>
              {(() => {
                const a = setup?.auth
                if (a?.usingSubscription)
                  return <li>✅ Signed in: <b className="text-gray-200">{a.email ?? '(account)'}</b> — Claude {planLabel(a.subscriptionType) || 'Pro/Max'} subscription <span className="text-gray-500">(the agent uses this, not the paid API)</span></li>
                if (a?.loggedIn)
                  return <li>⚠️ Agent auth: <b className="text-amber-300">{a.authMethod ?? a.apiProvider ?? 'an API method'}</b> — not a Pro/Max subscription. Run <code className="rounded bg-black/30 px-1">claude login</code> and pick your plan.</li>
                if (a && !a.loggedIn)
                  return <li>❌ Not signed in — run <code className="rounded bg-black/30 px-1">claude login</code> with your Pro/Max plan</li>
                return <li>{setup?.claudeLoggedIn ? '✅' : '❌'} {setup?.claudeLoggedIn ? "Claude looks signed in — run `claude auth status` in a terminal to confirm the account" : 'Not signed in — run `claude login`'}</li>
              })()}
              {setup?.apiKeyInEnv && <li className="text-amber-400/80">ℹ️ <code className="rounded bg-black/30 px-1">ANTHROPIC_API_KEY</code> is set in your environment — the agent ignores it (it always uses your subscription), but plain <code className="rounded bg-black/30 px-1">claude</code> commands you run won't.</li>}
              <li>{setup?.claudeMemInstalled ? '✅' : '❌'} claude-mem (long-term memory)</li>
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={onRecheckSetup} className="rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-gray-300 hover:bg-ink-800">Re-check</button>
              <button onClick={onOpenWizard} className="rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-gray-300 hover:bg-ink-800">Run setup wizard</button>
              <button onClick={onOpenTerminal} className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-gray-300 hover:bg-ink-800"><Terminal size={12} /> Open a terminal</button>
            </div>
          </div>

          <div className="text-xs">
            <p className="mb-1 font-semibold text-gray-400">Agent workspace</p>
            <p className="mb-2 break-all text-gray-500">{config.workspaceDir ?? '(default)'}</p>
            <button onClick={onOpenWorkspace} className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-gray-300 hover:bg-ink-800"><FolderOpen size={13} /> Open folder</button>
          </div>
        </div>
      </div>
    </div>
  )
}
