// Conversation index + transcript store, kept in the OS userData dir (not in the repo — chat logs
// are machine-local; the agent's *training* lives in the workspace and that's what syncs).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { ChatMessage, Provider, SessionDetail, SessionMeta } from '../shared/types'
import { userDataDir } from './runtime'

const dir = join(userDataDir(), 'sessions')
function ensureDir(): void {
  mkdirSync(dir, { recursive: true })
}
function file(id: string): string {
  return join(dir, `${id}.json`)
}

function titleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  const t = (firstUser?.content ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return 'New chat'
  return t.length > 60 ? t.slice(0, 57) + '…' : t
}

export function loadSession(id: string): SessionDetail | null {
  try {
    return JSON.parse(readFileSync(file(id), 'utf8'))
  } catch {
    return null
  }
}

export function saveSession(s: SessionDetail): void {
  ensureDir()
  writeFileSync(file(s.id), JSON.stringify(s, null, 2), 'utf8')
}

/** Create or update a session, appending a message and refreshing title/timestamps. The first
 *  call (no existing session) stamps the provider; later calls inherit it. */
export function appendMessage(id: string, msg: ChatMessage, provider?: Provider): SessionDetail {
  const now = Date.now()
  const existing = loadSession(id)
  const s: SessionDetail = existing ?? { id, title: 'New chat', createdAt: now, updatedAt: now, messages: [], provider }
  if (!existing && provider) s.provider = provider
  s.messages.push(msg)
  s.updatedAt = now
  s.title = titleFromMessages(s.messages)
  saveSession(s)
  return s
}

/** Replace (or append to) the last assistant message — used while streaming a reply in. */
export function setAssistantText(id: string, text: string): void {
  const s = loadSession(id)
  if (!s) return
  const last = s.messages[s.messages.length - 1]
  if (last && last.role === 'assistant') {
    last.content = text
  } else {
    s.messages.push({ role: 'assistant', content: text, ts: Date.now() })
  }
  s.updatedAt = Date.now()
  saveSession(s)
}

export function listSessions(): SessionMeta[] {
  ensureDir()
  const out: SessionMeta[] = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      const s: SessionDetail = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      out.push({ id: s.id, title: s.title, createdAt: s.createdAt, updatedAt: s.updatedAt, provider: s.provider })
    } catch {
      /* skip corrupt */
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function deleteSession(id: string): void {
  try {
    if (existsSync(file(id))) unlinkSync(file(id))
  } catch {
    /* ignore */
  }
}
