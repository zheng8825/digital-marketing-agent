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

/** Events streamed from POST /api/chat (Server-Sent Events, `data:` lines are JSON of this union). */
export type ChatStreamEvent =
  | { type: 'session'; id: string } // emitted once when a new session id is known
  | { type: 'delta'; text: string } // a chunk of assistant text
  | { type: 'tool'; name: string; summary: string } // the agent used a tool (e.g. wrote a file)
  | { type: 'done'; cost?: number } // turn finished successfully
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
