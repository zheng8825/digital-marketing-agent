import type {
  AgentFileRef,
  ChatStreamEvent,
  SessionDetail,
  SessionMeta,
  SetupStatus
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
  getConfig: () => json<{ model?: string; workspaceDir?: string }>('/api/config'),
  putConfig: (patch: Record<string, unknown>) =>
    json<Record<string, unknown>>('/api/config', { method: 'PUT', body: JSON.stringify(patch) })
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
