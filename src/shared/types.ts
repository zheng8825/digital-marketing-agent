// Types shared between the Electron main process and the renderer (the dashboard UI).

/** Which AI plan the marketer is signed into. `claude` = Claude Pro/Max via the `claude` CLI;
 *  `codex` = ChatGPT Plus/Pro via OpenAI's `codex` CLI. Both auth flows are OAuth in the browser —
 *  no API key needed. The active provider is per-app, not per-chat (chats stay tied to the
 *  provider that started them via the provider's own session id). */
export type Provider = 'claude' | 'codex'

export const PROVIDER_LABELS: Record<Provider, string> = {
  claude: 'Claude Pro / Max',
  codex: 'ChatGPT Plus / Pro'
}

export type ChatRole = 'user' | 'assistant'

/** A tool the agent used to produce a reply (Read, Edit, Bash, WebSearch, …). `file` is filled
 *  whenever the tool acted on a workspace-relative path — used to make it clickable in the UI so
 *  the marketer can jump straight to that knowledge file and edit it. Forward-slash separators. */
export interface ToolRef {
  name: string
  summary: string
  file?: string
}

export interface ChatMessage {
  role: ChatRole
  content: string
  ts: number
  /** Tools the assistant used for this turn. Only set on assistant messages. */
  tools?: ToolRef[]
}

export interface SessionMeta {
  /** The CLI's session id (uuid). Also our conversation id. Tied to the provider that started it —
   *  resuming a Codex session as Claude (or vice versa) doesn't work. */
  id: string
  title: string
  createdAt: number
  updatedAt: number
  /** Which provider this chat was started with. Older sessions without this field are Claude. */
  provider?: Provider
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
  | { type: 'tool'; name: string; summary: string; file?: string } // the agent used a tool (e.g. wrote a file)
  | { type: 'done'; usage?: TurnUsage } // turn finished successfully
  | { type: 'error'; message: string }

/** What `claude auth status` reports — probed with the API-key env vars stripped, i.e. exactly the
 *  auth the spawned agent uses. `undefined` on the SetupStatus means it couldn't be determined. */
export interface ClaudeAuthInfo {
  loggedIn: boolean
  /** e.g. `'claude.ai'` (Pro/Max subscription) | `'apiKey'` | `'apiKeyHelper'` | `'bedrock'` | `'vertex'`. */
  authMethod?: string
  /** e.g. `'firstParty'` (Anthropic direct) | `'bedrock'` | `'vertex'`. */
  apiProvider?: string
  email?: string
  orgName?: string
  /** e.g. `'pro'` | `'max'` | `'team'` | `'enterprise'`. */
  subscriptionType?: string
  /** True iff this is a Pro/Max-style Claude subscription (not an API key or a cloud provider). */
  usingSubscription: boolean
}

/** What we know about Codex's auth — `codex login status` is exit-code-only, so we can't show
 *  email/plan like we can for Claude. `loggedIn: undefined` means we couldn't probe (CLI missing). */
export interface CodexAuthInfo {
  loggedIn: boolean
}

export interface SetupStatus {
  /** Which provider the app currently chats with. */
  provider: Provider
  /** `claude` CLI found on PATH and reports a version. */
  claudeInstalled: boolean
  claudeVersion?: string
  /** `claude` is logged in (a non-API auth, i.e. a Pro/Max subscription) — best-effort detection. */
  claudeLoggedIn: boolean
  /** ANTHROPIC_API_KEY is set in the environment (the agent strips it, but other `claude` commands won't). */
  apiKeyInEnv: boolean
  /** claude-mem appears installed (hooks present in ~/.claude/settings.json or the binary resolves). */
  claudeMemInstalled: boolean
  /** Path to the per-user agent workspace the app runs the CLI in. */
  workspaceDir: string
  /** Result of `claude auth status` (probed as the agent runs — API-key env vars stripped). */
  auth?: ClaudeAuthInfo

  // --- Codex (ChatGPT Plus/Pro) ---
  codexInstalled: boolean
  codexVersion?: string
  /** Result of `codex login status` (run with OPENAI_API_KEY stripped). */
  codexAuth?: CodexAuthInfo
  /** OPENAI_API_KEY is set in the environment. The agent strips it, but plain `codex` won't. */
  openaiKeyInEnv: boolean
}

// --- Model & "effort" (thinking depth) selection -------------------------------------------------

export interface ModelOption {
  /** Value passed to `claude --model` ('' = let Claude Code use its configured default). */
  id: string
  label: string
  note: string
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: '', label: 'Default — Claude Sonnet (recommended)', note: 'Claude Sonnet: a solid balance of speed, quality and quota for marketing work. (The agent is pinned to Sonnet unless you pick another model here.)' },
  { id: 'sonnet', label: 'Claude Sonnet — balanced', note: 'Great for most marketing work: copy, campaigns, reports.' },
  { id: 'opus', label: 'Claude Opus — most capable', note: 'Deepest reasoning. Uses your plan’s quota faster — best on a Max plan.' },
  { id: 'haiku', label: 'Claude Haiku — fastest', note: 'Quick drafts and simple tasks. Lightest on your quota.' }
]

/** Models for the Codex (ChatGPT) provider — `codex exec --model <id>`. Empty id = the CLI default. */
export const CODEX_MODEL_OPTIONS: ModelOption[] = [
  { id: '', label: 'Default — what ChatGPT picks (recommended)', note: 'Lets the codex CLI pick the model your ChatGPT plan exposes.' },
  { id: 'gpt-5.4', label: 'GPT-5.4 — most capable', note: 'Best quality. Heaviest on your ChatGPT plan quota.' },
  { id: 'gpt-5', label: 'GPT-5 — balanced', note: 'Good for most marketing work.' }
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
  /** Which CLI to spawn for chat. Undefined = 'claude' (the original behaviour). */
  provider?: Provider
  /** A ModelOption.id, or undefined for the default. Claude-side model selector. */
  model?: string
  /** A CODEX_MODEL_OPTIONS.id, or undefined for the CLI default. */
  codexModel?: string
  /** Thinking depth; undefined = 'off'. (Claude-only — codex ignores it.) */
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

// --- Uploaded documents (the "sources" the agent can read & answer about — NotebookLM-style) ----

/** A file the marketer uploaded into the agent's `uploads/` folder. */
export interface UploadedDoc {
  /** Stable id = the stored filename inside `uploads/`. */
  id: string
  /** Original filename as uploaded. */
  name: string
  /** Path (relative to the agent workspace) the agent should Read to use this doc — the `.md` sidecar
   *  for converted Office files, or the original file for PDFs / text files. */
  agentPath: string
  kind: 'word' | 'powerpoint' | 'excel' | 'pdf' | 'text' | 'other'
  /** Bytes of the original file. */
  size: number
  /** ms epoch when it was uploaded. */
  addedAt: number
  /** True if we converted it to a text/markdown sidecar (Word/PowerPoint/Excel). */
  converted: boolean
  /** True if the file can't be used at all (old binary Office format / unreadable). */
  unsupported: boolean
  /** Short human note — what we did, or why it can't be read. */
  note: string
}

/** The cap the upload endpoint accepts (also enforced client-side for a nicer message). */
export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024
