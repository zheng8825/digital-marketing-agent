import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Bot,
  BookOpen,
  Copy,
  FileSpreadsheet,
  FileText,
  Files,
  FolderOpen,
  Loader2,
  Plus,
  Presentation,
  RefreshCw,
  Save,
  Send,
  Settings,
  ShieldAlert,
  StopCircle,
  Terminal,
  Trash2,
  Upload,
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
  Provider,
  SessionMeta,
  SetupStatus,
  TurnUsage,
  UploadedDoc,
  UsageReport
} from '@shared/types'
import { PROVIDER_LABELS } from '@shared/types'
import { api, fmtDuration, fmtTokens, relTime, streamChat, uploadDoc } from './api'
import SetupWizard from './SetupWizard'
import SwitchAccountModal from './SwitchAccountModal'

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
  if (!setup) return null
  const provider = setup.provider
  if (provider === 'codex') {
    if (!setup.codexInstalled) return { tone: 'warn', label: 'codex not installed', title: 'The ChatGPT plan needs the codex CLI installed. Open Settings → "Switch account" or run the setup wizard.' }
    if (setup.codexAuth?.loggedIn) return { tone: 'ok', label: 'ChatGPT Plus / Pro', title: 'Signed in to your ChatGPT plan via `codex login`. The agent runs on this subscription, not the paid OpenAI API.' }
    return { tone: 'warn', label: 'sign in to ChatGPT', title: 'Not signed in. Run `codex login` (or open Settings → "Switch account").' }
  }
  // Claude (default).
  if (!setup.claudeInstalled) return null // the setup banner covers "not installed"
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

/** True if the *active* provider is ready for chat (installed + signed in). Drives the setup banner. */
function providerReady(setup: SetupStatus | null): boolean {
  if (!setup) return true // nothing to nag about until we know
  if (setup.provider === 'codex') return !!setup.codexInstalled && !!setup.codexAuth?.loggedIn
  return !!setup.claudeInstalled && !!setup.auth?.usingSubscription
}

const DOC_ACCEPT = '.pptx,.docx,.pdf,.xlsx,.csv,.txt,.md,.markdown,.json,.html,.htm,.rtf,.ppt,.doc,.xls'
function DocIcon({ kind, className }: { kind: UploadedDoc['kind']; className?: string }): JSX.Element {
  if (kind === 'powerpoint') return <Presentation className={className} />
  if (kind === 'excel') return <FileSpreadsheet className={className} />
  return <FileText className={className} />
}
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
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

  const [rightTab, setRightTab] = useState<'notes' | 'docs' | 'train'>('notes')
  const [notes, setNotes] = useState(() => localStorage.getItem('ma:notes') ?? '')
  const [trainFiles, setTrainFiles] = useState<AgentFileRef[]>([])
  const [trainPath, setTrainPath] = useState('CLAUDE.md')
  const [trainContent, setTrainContent] = useState('')
  const [trainDirty, setTrainDirty] = useState(false)
  const [trainNote, setTrainNote] = useState('')
  const [syncNote, setSyncNote] = useState('')
  const [syncing, setSyncing] = useState(false)

  const [docs, setDocs] = useState<UploadedDoc[]>([])
  const [docsBusy, setDocsBusy] = useState(false)
  const [docNote, setDocNote] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [srcSel, setSrcSel] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [models, setModels] = useState<ModelOption[]>([])
  const [codexModels, setCodexModels] = useState<ModelOption[]>([])
  const [efforts, setEfforts] = useState<EffortOption[]>([])
  const [config, setConfig] = useState<AppConfig & { workspaceDir?: string }>({})
  const [usage, setUsage] = useState<UsageReport | null>(null)
  const [lastTurn, setLastTurn] = useState<TurnUsage | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showUsage, setShowUsage] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [showSwitchAccount, setShowSwitchAccount] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const refreshSessions = useCallback(() => api.listSessions().then(setSessions).catch(() => {}), [])
  const refreshUsage = useCallback(() => api.getUsage().then(setUsage).catch(() => {}), [])
  const refreshSetup = useCallback(() => api.getSetup().then(setSetup).catch(() => {}), [])
  const refreshDocs = useCallback(() => api.listDocs().then(setDocs).catch(() => {}), [])

  useEffect(() => {
    api.getSetup().then((s) => {
      setSetup(s)
      // First-launch: if neither provider is ready, walk her through signing in.
      const claudeReady = s.claudeInstalled && !!s.auth?.usingSubscription
      const codexReady = s.codexInstalled && !!s.codexAuth?.loggedIn
      if (!claudeReady && !codexReady) setShowWizard(true)
    }).catch(() => {})
    refreshSessions()
    refreshUsage()
    refreshDocs()
    api.trainableFiles().then(setTrainFiles).catch(() => {})
    api.getModels().then((r) => { setModels(r.models); setCodexModels(r.codexModels); setEfforts(r.efforts) }).catch(() => {})
    api.getConfig().then(setConfig).catch(() => {})
  }, [refreshSessions, refreshUsage, refreshDocs])

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

  /** Paths of the docs currently ticked as "sources", in upload order — for the message hint. */
  function selectedSourcePaths(): string[] {
    return docs.filter((d) => srcSel.has(d.id) && !d.unsupported).map((d) => d.agentPath)
  }

  async function send(): Promise<void> {
    const text = input.trim()
    if (!text || status === 'working') return
    const srcPaths = selectedSourcePaths()
    const outgoing = srcPaths.length
      ? `[Use these uploaded sources to answer (read them first): ${srcPaths.join(', ')}]\n\n${text}`
      : text
    setMessages((m) => [...m, { role: 'user', content: text, ts: Date.now() }])
    setInput(''); setStreaming(''); setToolLog([])
    setStatus('working'); setStatusMsg('Thinking…')
    const ac = new AbortController()
    abortRef.current = ac
    let acc = ''
    let isNew = !activeId
    let gotTerminal = false // got a `done` or `error` event — i.e. the turn really finished
    try {
      await streamChat({ conversationId: activeId ?? undefined, message: outgoing }, (ev) => {
        if (ev.type === 'session') {
          if (isNew) { setActiveId(ev.id); isNew = false; refreshSessions() }
        } else if (ev.type === 'delta') {
          acc += ev.text; setStreaming(acc); setStatusMsg('Replying…')
        } else if (ev.type === 'tool') {
          setToolLog((t) => [...t, ev.summary]); setStatusMsg(`Working: ${ev.summary}`)
        } else if (ev.type === 'done') {
          gotTerminal = true
          setMessages((m) => [...m, { role: 'assistant', content: acc || '(no response)', ts: Date.now() }])
          setStreaming(''); setStatus('idle'); setStatusMsg('Ready')
          if (ev.usage) setLastTurn(ev.usage)
          refreshSessions(); refreshUsage()
        } else if (ev.type === 'error') {
          gotTerminal = true
          setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${ev.message}`, ts: Date.now() }])
          setStreaming(''); setStatus('error'); setStatusMsg('Error — see the message above'); refreshSessions()
        }
      }, ac.signal)
      // Stream ended without a done/error event (connection dropped, agent killed, etc.) —
      // don't leave the UI spinning on "Thinking…" forever.
      if (!gotTerminal) {
        const partial = acc.trim()
        setMessages((m) => [...m, { role: 'assistant', content: partial ? `${partial}\n\n⚠️ (the agent stopped before finishing — try again, or restart the app)` : '⚠️ The agent stopped without replying. Try again — if it keeps happening, restart the app, or open Settings → Switch account.', ts: Date.now() }])
        setStreaming(''); setStatus('error'); setStatusMsg('The agent stopped unexpectedly'); refreshSessions()
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        const msg = (e as Error).message || 'connection error'
        setMessages((m) => [...m, { role: 'assistant', content: `⚠️ Couldn't reach the agent: ${msg}. Try again, or restart the app.`, ts: Date.now() }])
        setStatus('error'); setStatusMsg(msg)
      }
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

  async function addFiles(files: FileList | File[] | null): Promise<void> {
    const list = Array.from(files ?? [])
    if (list.length === 0) return
    setDocsBusy(true); setDocNote('')
    let ok = 0
    const notes: string[] = []
    for (const f of list) {
      try {
        const doc = await uploadDoc(f)
        ok++
        setDocs((d) => [doc, ...d.filter((x) => x.id !== doc.id)])
        if (!doc.unsupported) setSrcSel((s) => new Set(s).add(doc.id))
        if (doc.unsupported) notes.push(`${doc.name}: ${doc.note}`)
      } catch (e) {
        notes.push(`${f.name}: ${(e as Error).message}`)
      }
    }
    setDocsBusy(false)
    setDocNote(notes.length ? notes.join(' · ') : `Added ${ok} file${ok === 1 ? '' : 's'}. The agent can read ${ok === 1 ? 'it' : 'them'} now — ask away.`)
    setTimeout(() => setDocNote(''), notes.length ? 9000 : 5000)
    refreshDocs()
  }
  function removeDoc(id: string): void {
    setDocs((d) => d.filter((x) => x.id !== id))
    setSrcSel((s) => { const n = new Set(s); n.delete(id); return n })
    api.deleteDoc(id).catch(() => {}).finally(refreshDocs)
  }
  function toggleSrc(id: string): void {
    setSrcSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  function askAbout(d: UploadedDoc): void {
    setRightTab('docs')
    setSrcSel((s) => new Set(s).add(d.id))
    setInput((v) => (v.trim() ? v : `About "${d.name}": `))
    inputRef.current?.focus()
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
  const showSetup = !!setup && !setupDismissed && (!providerReady(setup) || setup.apiKeyInEnv || setup.openaiKeyInEnv)

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
          {/* Model + Effort — inline, always visible. Codex provider hides Effort (no extended-thinking). */}
          {(() => {
            const isCodex = setup?.provider === 'codex'
            const list = isCodex ? codexModels : models
            const value = isCodex ? (config.codexModel ?? '') : (config.model ?? '')
            const onChange = (v: string): void => changeConfig(isCodex ? { codexModel: v } : { model: v })
            return (
              <label className="hidden items-center gap-1.5 text-[11px] text-gray-500 md:flex">
                Model
                <select
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  title={list.find((m) => m.id === value)?.note}
                  className="rounded-md border border-ink-700 bg-ink-850 px-1.5 py-1 text-xs text-gray-200 focus:outline-none"
                >
                  {list.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
            )
          })()}
          {setup?.provider !== 'codex' && (
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
          )}

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

      {showSetup && setup && (
        <div className="flex items-start gap-3 border-b border-amber-900/60 bg-amber-950/40 px-5 py-2 text-xs text-amber-200">
          <Wrench size={14} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">Setup needed: </span>
            {!providerReady(setup) && setup.provider === 'claude' && (
              <span>Sign in to your Claude Pro/Max plan to start chatting (or switch to ChatGPT in the wizard). </span>
            )}
            {!providerReady(setup) && setup.provider === 'codex' && (
              <span>Sign in to your ChatGPT Plus/Pro plan to start chatting (or switch to Claude in the wizard). </span>
            )}
            {setup.apiKeyInEnv && (<span>⚠️ <code className="rounded bg-black/30 px-1">ANTHROPIC_API_KEY</code> is set in your environment — the agent ignores it, but plain <code className="rounded bg-black/30 px-1">claude</code> commands won't. </span>)}
            {setup.openaiKeyInEnv && (<span>⚠️ <code className="rounded bg-black/30 px-1">OPENAI_API_KEY</code> is set in your environment — the agent ignores it, but plain <code className="rounded bg-black/30 px-1">codex</code> commands won't. </span>)}
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
              <button onClick={() => { setRightTab('docs'); fileInputRef.current?.click() }} title="Upload a PPT / Word / PDF for the agent to read & answer about"
                className="ml-auto flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-850 px-3 py-1 text-xs text-gray-400 hover:border-accent/50 hover:text-white">
                <Upload size={12} /> Docs{docs.length ? ` (${docs.length})` : ''}
              </button>
              <button onClick={openTerminal} title="Open a terminal in the agent's workspace folder — to run `claude`, `claude auth status`, git, etc."
                className="flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-850 px-3 py-1 text-xs text-gray-400 hover:border-accent/50 hover:text-white">
                <Terminal size={12} /> Terminal
              </button>
            </div>
            {selectedSourcePaths().length > 0 && (
              <div className="mb-1.5 flex items-center gap-2 text-[11px] text-gray-400">
                <Files size={12} className="shrink-0 text-accent" />
                <span className="truncate">Using {selectedSourcePaths().length} source{selectedSourcePaths().length === 1 ? '' : 's'}: {docs.filter((d) => srcSel.has(d.id) && !d.unsupported).map((d) => d.name).join(', ')}</span>
                <button onClick={() => setSrcSel(new Set())} className="shrink-0 underline hover:text-gray-200">clear</button>
              </div>
            )}
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

        {/* Right: workspace — notes / docs / training */}
        <aside className="hidden w-80 shrink-0 flex-col border-l border-ink-700 bg-ink-900 lg:flex">
          <div className="flex border-b border-ink-700 text-xs">
            {(['notes', 'docs', 'train'] as const).map((t) => (
              <button key={t} onClick={() => setRightTab(t)} className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 font-semibold uppercase tracking-wider ${rightTab === t ? 'bg-ink-850 text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
                {t === 'notes' ? <BookOpen size={13} /> : t === 'docs' ? <Files size={13} /> : <Bot size={13} />}
                {t === 'notes' ? 'Notes' : t === 'docs' ? `Docs${docs.length ? ` (${docs.length})` : ''}` : 'Train'}
              </button>
            ))}
          </div>

          {rightTab === 'notes' && (
            <div className="flex flex-1 flex-col gap-2 p-3">
              <p className="text-[11px] text-gray-500">Scratchpad — drafts, ideas, outputs. Saved on this machine.</p>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes, drafts, pasted outputs…"
                className="scroll-thin flex-1 resize-none rounded-lg border border-ink-700 bg-ink-850 p-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-sky-500/60 focus:outline-none" />
              <div className="flex gap-2">
                <button onClick={() => setNotes('')} className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs text-gray-300 hover:bg-ink-800">Clear</button>
                <button onClick={() => navigator.clipboard.writeText(notes)} className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs text-gray-300 hover:bg-ink-800"><Copy size={12} /> Copy</button>
              </div>
            </div>
          )}

          {rightTab === 'docs' && (
            <div
              className="flex flex-1 flex-col gap-2 p-3"
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
            >
              <p className="text-[11px] leading-relaxed text-gray-500">
                Upload PPT / Word / PDF / text. The agent reads them — then ask it anything about them (like NotebookLM).
                Tick the ones you want it to use as sources for your next message.
              </p>
              <input ref={fileInputRef} type="file" multiple accept={DOC_ACCEPT} className="hidden"
                onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = '' }} />
              <button onClick={() => fileInputRef.current?.click()} disabled={docsBusy}
                className={`flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-xs ${dragOver ? 'border-accent/70 bg-accent/10 text-accent' : 'border-ink-700 bg-ink-850 text-gray-400 hover:border-accent/50 hover:text-gray-200'} disabled:opacity-50`}>
                {docsBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {docsBusy ? 'Uploading…' : 'Add files — or drop them here'}
              </button>
              <div className="scroll-thin flex-1 space-y-1.5 overflow-y-auto">
                {docs.length === 0 && <p className="px-1 pt-2 text-[11px] text-gray-600">No documents yet.</p>}
                {docs.map((d) => (
                  <div key={d.id} className={`rounded-lg border p-2 ${d.unsupported ? 'border-amber-800/50 bg-amber-950/20' : srcSel.has(d.id) ? 'border-accent/40 bg-accent/5' : 'border-ink-700 bg-ink-850'}`}>
                    <div className="flex items-start gap-2">
                      {!d.unsupported && (
                        <input type="checkbox" checked={srcSel.has(d.id)} onChange={() => toggleSrc(d.id)} title="Use as a source for the next message"
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent" />
                      )}
                      <DocIcon kind={d.kind} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-gray-200" title={d.name}>{d.name}</p>
                        <p className="text-[10px] text-gray-500">{fmtBytes(d.size)} · {relTime(d.addedAt)}{d.converted ? ' · converted to text' : ''}</p>
                        {d.unsupported && <p className="mt-0.5 text-[10px] text-amber-400/90">{d.note}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {!d.unsupported && <button onClick={() => askAbout(d)} title="Ask about this document" className="rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-ink-800">Ask</button>}
                        <button onClick={() => removeDoc(d.id)} title="Remove" className="text-gray-500 hover:text-rose-400"><X size={13} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {docNote && <p className="text-[11px] text-gray-400"><span className="msg-body">{docNote}</span></p>}
            </div>
          )}

          {rightTab === 'train' && (
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
          codexModels={codexModels}
          efforts={efforts}
          config={config}
          setup={setup}
          onChange={changeConfig}
          onRecheckSetup={refreshSetup}
          onOpenWorkspace={() => api.openWorkspace()}
          onOpenTerminal={openTerminal}
          onOpenWizard={() => { setShowSettings(false); setShowWizard(true) }}
          onSwitchAccount={() => { setShowSettings(false); setShowSwitchAccount(true) }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showWizard && <SetupWizard setup={setup} onSetupChanged={setSetup} onClose={() => setShowWizard(false)} />}
      {showSwitchAccount && <SwitchAccountModal setup={setup} onSetupChanged={setSetup} onClose={() => { setShowSwitchAccount(false); refreshSetup() }} />}
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
  codexModels: ModelOption[]
  efforts: EffortOption[]
  config: AppConfig & { workspaceDir?: string }
  setup: SetupStatus | null
  onChange: (patch: Partial<AppConfig>) => void
  onRecheckSetup: () => void
  onOpenWorkspace: () => void
  onOpenTerminal: () => void
  onOpenWizard: () => void
  onSwitchAccount: () => void
  onClose: () => void
}): JSX.Element {
  const { models, codexModels, efforts, config, setup, onChange, onRecheckSetup, onOpenWorkspace, onOpenTerminal, onOpenWizard, onSwitchAccount, onClose } = props
  const provider: Provider = setup?.provider ?? 'claude'
  const isCodex = provider === 'codex'
  const activeModelList = isCodex ? codexModels : models
  const activeModelId = isCodex ? (config.codexModel ?? '') : (config.model ?? '')
  const model = activeModelList.find((m) => m.id === activeModelId)
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
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">AI plan (provider)</label>
            <select value={provider} onChange={(e) => onChange({ provider: e.target.value as Provider })}
              className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-gray-100 focus:border-accent/60 focus:outline-none">
              <option value="claude">{PROVIDER_LABELS.claude}</option>
              <option value="codex">{PROVIDER_LABELS.codex}</option>
            </select>
            <p className="mt-1 text-[11px] text-gray-500">Each chat stays on the plan it started with. Switching only affects new chats.</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Model</label>
            <select value={activeModelId} onChange={(e) => onChange(isCodex ? { codexModel: e.target.value } : { model: e.target.value })}
              className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-gray-100 focus:border-accent/60 focus:outline-none">
              {activeModelList.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            {model && <p className="mt-1 text-[11px] text-gray-500">{model.note}</p>}
          </div>

          {!isCodex && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Effort (thinking depth)</label>
              <select value={config.thinkingEffort ?? 'off'} onChange={(e) => onChange({ thinkingEffort: e.target.value as AppConfig['thinkingEffort'] })}
                className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-gray-100 focus:border-accent/60 focus:outline-none">
                {efforts.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
              {effort && <p className="mt-1 text-[11px] text-gray-500">{effort.note}</p>}
            </div>
          )}

          <p className="text-[11px] text-gray-500">Changes take effect on your next message.</p>

          <div className="rounded-lg border border-ink-700 bg-ink-850 p-3 text-xs">
            <p className="mb-1 font-semibold text-gray-400">Setup &amp; account</p>
            <ul className="space-y-0.5 text-gray-400">
              {/* Claude */}
              <li>{setup?.claudeInstalled ? '✅' : '❌'} Claude Code {setup?.claudeVersion ? `(${setup.claudeVersion})` : 'installed'}</li>
              {(() => {
                const a = setup?.auth
                if (a?.usingSubscription)
                  return <li className="ml-4">→ <b className="text-gray-200">{a.email ?? '(account)'}</b> · Claude {planLabel(a.subscriptionType) || 'Pro/Max'}</li>
                if (a?.loggedIn)
                  return <li className="ml-4 text-amber-300/90">→ via {a.authMethod ?? a.apiProvider ?? 'an API method'} — not a Pro/Max subscription</li>
                if (a && !a.loggedIn)
                  return <li className="ml-4">→ not signed in</li>
                return setup?.claudeInstalled ? <li className="ml-4">→ {setup.claudeLoggedIn ? 'signed in (account unknown)' : 'not signed in'}</li> : null
              })()}
              {setup?.apiKeyInEnv && <li className="ml-4 text-amber-400/80">ℹ️ <code className="rounded bg-black/30 px-1">ANTHROPIC_API_KEY</code> set in env — the agent ignores it, but plain <code className="rounded bg-black/30 px-1">claude</code> commands won't.</li>}
              {/* Codex */}
              <li className="mt-1">{setup?.codexInstalled ? '✅' : '❌'} Codex CLI {setup?.codexVersion ? `(${setup.codexVersion})` : '(ChatGPT Plus/Pro)'}</li>
              {setup?.codexInstalled && (
                <li className="ml-4">→ {setup.codexAuth?.loggedIn ? 'signed in to your ChatGPT plan' : 'not signed in'}</li>
              )}
              {setup?.openaiKeyInEnv && <li className="ml-4 text-amber-400/80">ℹ️ <code className="rounded bg-black/30 px-1">OPENAI_API_KEY</code> set in env — the agent ignores it, but plain <code className="rounded bg-black/30 px-1">codex</code> commands won't.</li>}
              {/* claude-mem */}
              <li className="mt-1">{setup?.claudeMemInstalled ? '✅' : '❌'} claude-mem (long-term memory — Claude only)</li>
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={onSwitchAccount} className="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-accent hover:bg-accent/20"><User size={12} /> Switch account</button>
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
