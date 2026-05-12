import type {
  AgentFileRef,
  AppConfig,
  ChatStreamEvent,
  EffortOption,
  ModelOption,
  SessionDetail,
  SessionMeta,
  SetupStatus,
  UploadedDoc,
  UsageReport
} from '@shared/types'

let cachedBase: string | null = null
async function base(): Promise<string> {
  if (cachedBase) return cachedBase
  const port = await window.appBridge.getApiPort()
  cachedBase = `http://127.0.0.1:${port}`
  return cachedBase
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const b = await base()
  const res = await fetch(b + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  })
  if (!res.ok) {
    let msg = res.statusText
    try {
      msg = (await res.json()).error ?? msg
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return (await res.json()) as T
}

export const api = {
  getSetup: () => json<SetupStatus>('/api/setup'),
  listSessions: () => json<SessionMeta[]>('/api/sessions'),
  getSession: (id: string) => json<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`),
  deleteSession: (id: string) =>
    json<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  trainableFiles: () => json<AgentFileRef[]>('/api/agent/files'),
  getAgentFile: (path: string) =>
    json<{ path: string; content: string }>(`/api/agent/file?path=${encodeURIComponent(path)}`),
  putAgentFile: (path: string, content: string) =>
    json<{ ok: boolean }>('/api/agent/file', { method: 'PUT', body: JSON.stringify({ path, content }) }),
  sync: () => json<{ ok: boolean; message: string }>('/api/sync', { method: 'POST' }),
  getConfig: () => json<AppConfig & { workspaceDir?: string }>('/api/config'),
  putConfig: (patch: Partial<AppConfig>) =>
    json<AppConfig & { workspaceDir?: string }>('/api/config', { method: 'PUT', body: JSON.stringify(patch) }),
  getModels: () => json<{ models: ModelOption[]; efforts: EffortOption[] }>('/api/models'),
  getUsage: () => json<UsageReport>('/api/usage'),
  openTerminal: () => json<{ ok: boolean }>('/api/setup/terminal', { method: 'POST' }),
  listDocs: () => json<UploadedDoc[]>('/api/docs'),
  deleteDoc: (id: string) => json<{ ok: boolean }>(`/api/docs/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Upload one file to the agent's `uploads/` folder; returns its record (incl. how it was handled). */
export async function uploadDoc(file: File): Promise<UploadedDoc> {
  const b = await base()
  const res = await fetch(b + '/api/docs/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'x-filename': encodeURIComponent(file.name) },
    body: file
  })
  if (!res.ok) {
    let msg = res.statusText
    try {
      msg = (await res.json()).error ?? msg
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return (await res.json()) as UploadedDoc
}

export type SetupStepId = 'install-claude' | 'login' | 'logout' | 'install-mem'

/** Run a setup step on the host and stream its console output line by line. Resolves when it ends. */
export async function streamSetupRun(
  step: SetupStepId,
  onLine: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const b = await base()
  const res = await fetch(b + '/api/setup/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step }),
    signal
  })
  if (!res.ok || !res.body) {
    onLine(`(could not start: ${res.statusText})`)
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      for (const line of frame.split('\n')) {
        const m = /^data:\s?(.*)$/.exec(line)
        if (!m) continue
        try {
          const ev = JSON.parse(m[1]) as { type: 'line'; text: string } | { type: 'done' }
          if (ev.type === 'line') onLine(ev.text)
        } catch {
          /* ignore */
        }
      }
    }
  }
}

/** Stream a chat turn. Calls `onEvent` for every server event. Returns when the turn ends. */
export async function streamChat(
  body: { conversationId?: string; message: string },
  onEvent: (e: ChatStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const b = await base()
  const res = await fetch(b + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  })
  if (!res.ok || !res.body) {
    let msg = res.statusText
    try {
      msg = (await res.json()).error ?? msg
    } catch {
      /* ignore */
    }
    onEvent({ type: 'error', message: msg })
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      for (const line of frame.split('\n')) {
        const m = /^data:\s?(.*)$/.exec(line)
        if (!m) continue
        try {
          onEvent(JSON.parse(m[1]) as ChatStreamEvent)
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  }
}

export function fmtTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function fmtDuration(ms: number): string {
  if (!ms) return '–'
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

export function relTime(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}
