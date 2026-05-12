// Types shared between the Electron main process and the renderer (the dashboard UI).

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
  ts: number
}

export interface SessionMeta {
  /** The Claude Code session id (uuid). Also our conversation id. */
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface SessionDetail extends SessionMeta {
  messages: ChatMessage[]
}

export interface TurnUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  durationMs: number
  /** USD cost as reported by the CLI — on a Pro/Max subscription this is 0 (no per-token billing). */
  costUsd: number
}

/** Events streamed from POST /api/chat (Server-Sent Events, `data:` lines are JSON of this union). */
export type ChatStreamEvent =
  | { type: 'session'; id: string } // emitted once when a new session id is known
  | { type: 'delta'; text: string } // a chunk of assistant text
  | { type: 'tool'; name: string; summary: string } // the agent used a tool (e.g. wrote a file)
  | { type: 'done'; usage?: TurnUsage } // turn finished successfully
  | { type: 'error'; message: string }

export interface SetupStatus {
  /** `claude` CLI found on PATH and reports a version. */
  claudeInstalled: boolean
  claudeVersion?: string
  /** `claude` is logged in (a non-API auth, i.e. a Pro/Max subscription) — best-effort detection. */
  claudeLoggedIn: boolean
  /** ANTHROPIC_API_KEY is set in the environment (we warn: that would bill the API, not the subscription). */
  apiKeyInEnv: boolean
  /** claude-mem appears installed (hooks present in ~/.claude/settings.json or the binary resolves). */
  claudeMemInstalled: boolean
  /** Path to the per-user agent workspace the app runs `claude` in. */
  workspaceDir: string
}

// --- Model & "effort" (thinking depth) selection -------------------------------------------------

export interface ModelOption {
  /** Value passed to `claude --model` ('' = let Claude Code use its configured default). */
  id: string
  label: string
  note: string
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: '', label: 'Default (recommended)', note: 'Uses whatever Claude Code is set to — usually Claude Sonnet. A solid balance of speed and quality.' },
  { id: 'sonnet', label: 'Claude Sonnet — balanced', note: 'Great for most marketing work: copy, campaigns, reports.' },
  { id: 'opus', label: 'Claude Opus — most capable', note: 'Deepest reasoning. Uses your plan’s quota faster — best on a Max plan.' },
  { id: 'haiku', label: 'Claude Haiku — fastest', note: 'Quick drafts and simple tasks. Lightest on your quota.' }
]

export type ThinkingEffort = 'off' | 'standard' | 'deep'

export interface EffortOption {
  id: ThinkingEffort
  label: string
  /** MAX_THINKING_TOKENS value; 0 = no extended thinking. */
  tokens: number
  note: string
}

export const EFFORT_OPTIONS: EffortOption[] = [
  { id: 'off', label: 'Quick', tokens: 0, note: 'Answers right away. Best for writing copy and quick questions.' },
  { id: 'standard', label: 'Standard', tokens: 10000, note: 'Thinks a little first — good for campaign plans and analysis.' },
  { id: 'deep', label: 'Deep', tokens: 31999, note: 'Thinks hard before answering — strategy and tricky problems. Slower; uses more quota.' }
]

export interface AppConfig {
  /** A ModelOption.id, or undefined for the default. */
  model?: string
  /** Thinking depth; undefined = 'off'. */
  thinkingEffort?: ThinkingEffort
  /** Override the agent workspace directory (advanced). */
  workspaceDir?: string
}

// --- Usage --------------------------------------------------------------------------------------

export interface UsageBucket {
  turns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface UsageReport {
  /** YYYY-MM-DD (local). */
  date: string
  today: UsageBucket
  allTime: UsageBucket
  /** The most recent turn's usage, if any happened this app run (kept client-side normally, mirrored here). */
  lastTurn?: TurnUsage
}

/** A file in the agent's workspace that the UI can show/edit ("training" the agent). */
export interface AgentFileRef {
  /** Path relative to the workspace dir, e.g. "CLAUDE.md" or "knowledge/01-brand-and-products.md". */
  path: string
  label: string
}

export const TRAINABLE_FILES: AgentFileRef[] = [
  { path: 'CLAUDE.md', label: 'Agent instructions (CLAUDE.md)' },
  { path: 'knowledge/01-brand-and-products.md', label: 'Knowledge — Brand & products' },
  { path: 'knowledge/02-channels-and-partners.md', label: 'Knowledge — Channels & partners' },
  { path: 'knowledge/03-kol-list.md', label: 'Knowledge — KOL roster' },
  { path: 'knowledge/04-calendar-and-moments.md', label: 'Knowledge — Calendar & moments' },
  { path: 'knowledge/05-campaign-learnings.md', label: 'Knowledge — Campaign learnings' },
  { path: 'knowledge/_inputs-needed.md', label: 'Knowledge — Inputs still needed' }
]
