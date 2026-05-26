// The local HTTP server: serves the built web UI and the API the dashboard talks to. Runs as a
// plain Node process (started by index.ts). Localhost-only; CORS is wide-open on purpose (so the
// developer can also hit the API from a separate browser/tab during development).

import express from 'express'
import type { Response } from 'express'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { chat as claudeChat } from './claude-bridge'
import { chat as codexChat } from './codex-bridge'
import { getSetupStatus } from './setup'
import { openTerminal, runSetupStep, SETUP_STEPS, type SetupStep } from './setup-run'
import { syncWorkspace } from './git-sync'
import { appendMessage, deleteSession, listSessions, loadSession, setAssistantText } from './sessions'
import { getProvider, getWorkspaceDir, readAgentFile, readConfig, writeAgentFile, writeConfig } from './workspace'
import { appRootDir, openPath } from './runtime'
import { getUsage } from './usage'
import { addDoc, deleteDoc, listDocs } from './docs'
import {
  CODEX_MODEL_OPTIONS,
  EFFORT_OPTIONS,
  MAX_UPLOAD_BYTES,
  MODEL_OPTIONS,
  TRAINABLE_FILES,
  type AppConfig,
  type ChatStreamEvent,
  type Provider,
  type ThinkingEffort
} from '../shared/types'

/** Start a Server-Sent Events response that survives buffering proxies. Some corporate security /
 *  antivirus gateways (and nginx) buffer a streamed response until they've seen several KB or the
 *  connection closes — which makes the chat look stuck on "Thinking…" until you refresh. We disable
 *  proxy buffering, turn off Nagle, send an up-front padding comment to blow past byte thresholds,
 *  and heartbeat so intermediaries keep flushing. (`:`-prefixed lines are SSE comments the client
 *  ignores.) Returns nothing; the caller writes `data:` frames and ends the response as usual. */
function beginSse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  // Stop Chrome from withholding the first ~1KB to MIME-sniff the body (which makes the chat sit
  // on "Thinking…" until you refresh). nosniff + the priming comment below get events flowing now.
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.flushHeaders?.()
  res.socket?.setNoDelay(true)
  res.write(`:${' '.repeat(2048)}\n\n`)
  const hb = setInterval(() => {
    try { res.write(': ping\n\n') } catch { /* socket gone */ }
  }, 15000)
  res.on('close', () => clearInterval(hb))
}

export async function startServer(): Promise<number> {
  const app = express()
  app.use(express.json({ limit: '4mb' }))
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (_req.method === 'OPTIONS') return res.end()
    next()
  })

  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  app.get('/api/setup', (_req, res) => res.json(getSetupStatus()))
  app.post('/api/setup/terminal', (req, res) => {
    try {
      const run = typeof req.body?.run === 'string' && req.body.run.trim() ? String(req.body.run) : undefined
      openTerminal(run)
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message })
    }
  })
  app.post('/api/open-workspace', (_req, res) => {
    try {
      const dir = getWorkspaceDir()
      openPath(dir)
      res.json({ ok: true, dir })
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message })
    }
  })
  app.post('/api/auth/switch-terminal', (_req, res) => {
    try {
      openTerminal('claude auth logout; claude login')
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message })
    }
  })
  app.post('/api/setup/run', (req, res) => {
    const step = String(req.body?.step ?? '') as SetupStep
    if (!SETUP_STEPS.includes(step)) return res.status(400).json({ error: 'unknown step' })
    beginSse(res)
    let finished = false
    const handle = runSetupStep(step, { onLine: (text) => res.write(`data: ${JSON.stringify({ type: 'line', text })}\n\n`) })
    handle.done.then(() => {
      finished = true
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
      res.end()
    })
    // Cancel only on a *real* mid-stream client disconnect — listen on `res` (not `req`, whose
    // 'close' fires as soon as the POST body is consumed on newer Node) and guard with `finished`.
    res.on('close', () => { if (!finished) handle.cancel() })
  })

  app.get('/api/config', (_req, res) => res.json({ ...readConfig(), workspaceDir: getWorkspaceDir() }))
  app.put('/api/config', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const patch: Partial<AppConfig> = {}
    if ('provider' in body) {
      const p = String(body.provider ?? '')
      if (p === 'claude' || p === 'codex') patch.provider = p
    }
    if ('model' in body) patch.model = String(body.model ?? '')
    if ('codexModel' in body) patch.codexModel = String(body.codexModel ?? '')
    if ('thinkingEffort' in body) {
      const e = String(body.thinkingEffort ?? 'off')
      patch.thinkingEffort = (['off', 'standard', 'deep'].includes(e) ? e : 'off') as ThinkingEffort
    }
    if ('workspaceDir' in body && typeof body.workspaceDir === 'string') patch.workspaceDir = body.workspaceDir
    res.json({ ...writeConfig(patch), workspaceDir: getWorkspaceDir() })
  })
  app.get('/api/models', (_req, res) => res.json({ models: MODEL_OPTIONS, codexModels: CODEX_MODEL_OPTIONS, efforts: EFFORT_OPTIONS }))
  app.get('/api/usage', (_req, res) => res.json(getUsage()))

  app.get('/api/sessions', (_req, res) => res.json(listSessions()))
  app.get('/api/sessions/:id', (req, res) => {
    const s = loadSession(req.params.id)
    return s ? res.json(s) : res.status(404).json({ error: 'not found' })
  })
  app.delete('/api/sessions/:id', (req, res) => {
    deleteSession(req.params.id)
    res.json({ ok: true })
  })

  // Files the marketer can view/edit to "train" the agent.
  app.get('/api/agent/files', (_req, res) => res.json(TRAINABLE_FILES))
  app.get('/api/agent/file', (req, res) => {
    const path = String(req.query.path ?? '')
    if (!TRAINABLE_FILES.some((f) => f.path === path)) return res.status(400).json({ error: 'not a trainable file' })
    try {
      res.json({ path, content: readAgentFile(path) })
    } catch (e) {
      res.status(400).json({ error: (e as Error).message })
    }
  })
  app.put('/api/agent/file', (req, res) => {
    const { path, content } = req.body ?? {}
    if (!TRAINABLE_FILES.some((f) => f.path === path)) return res.status(400).json({ error: 'not a trainable file' })
    try {
      writeAgentFile(path, String(content ?? ''))
      res.json({ ok: true })
    } catch (e) {
      res.status(400).json({ error: (e as Error).message })
    }
  })

  // Uploaded "documents" the agent can read & answer about (NotebookLM-style sources).
  app.get('/api/docs', (_req, res) => res.json(listDocs()))
  app.post('/api/docs/upload', express.raw({ type: '*/*', limit: MAX_UPLOAD_BYTES }), (req, res) => {
    const name = decodeURIComponent(String(req.header('x-filename') ?? '')).trim()
    const buf = req.body as Buffer
    if (!name) return res.status(400).json({ error: 'missing x-filename header' })
    if (!Buffer.isBuffer(buf) || buf.length === 0) return res.status(400).json({ error: 'empty upload' })
    addDoc(name, buf)
      .then((doc) => res.json(doc))
      .catch((e) => res.status(500).json({ error: (e as Error).message }))
  })
  app.delete('/api/docs/:id', (req, res) => {
    deleteDoc(req.params.id)
    res.json({ ok: true })
  })

  app.post('/api/sync', (_req, res) => res.json(syncWorkspace()))

  // Streaming chat (Server-Sent Events).
  app.post('/api/chat', (req, res) => {
    const message = String(req.body?.message ?? '').trim()
    let conversationId: string | undefined = req.body?.conversationId || undefined
    if (!message) return res.status(400).json({ error: 'empty message' })

    beginSse(res)

    const isNew = !conversationId
    let userMsgPersisted = false
    let finished = false
    let acc = ''
    const send = (e: ChatStreamEvent): void => {
      try {
        res.write(`data: ${JSON.stringify(e)}\n\n`)
      } catch {
        /* socket gone */
      }
    }

    // Resuming an existing chat must use the provider that started it — codex thread ids don't
    // resolve in claude and vice versa. New chats use whatever's currently selected.
    const activeProvider = getProvider()
    let provider: Provider = activeProvider
    if (!isNew && conversationId) {
      const existing = loadSession(conversationId)
      if (existing?.provider) provider = existing.provider
    }

    const persistUserMsg = (id: string): void => {
      if (userMsgPersisted) return
      appendMessage(id, { role: 'user', content: message, ts: Date.now() }, provider)
      userMsgPersisted = true
    }
    if (!isNew && conversationId) persistUserMsg(conversationId)

    const chat = provider === 'codex' ? codexChat : claudeChat
    const handle = chat({
      conversationId,
      message,
      onEvent: (e) => {
        if (e.type === 'session') {
          conversationId = e.id
          if (isNew) persistUserMsg(e.id)
        } else if (e.type === 'delta') {
          acc += e.text
          if (conversationId) setAssistantText(conversationId, acc)
        } else if (e.type === 'done') {
          if (conversationId) setAssistantText(conversationId, acc || '(no response)')
        }
        send(e)
        if (e.type === 'done' || e.type === 'error') {
          finished = true
          res.end()
        }
      }
    })

    // Abort the CLI turn only if the client *really* disconnects mid-stream. Listen on `res`
    // (not `req` — on newer Node its 'close' fires as soon as the POST body is read, which would
    // kill every turn instantly and leave the UI stuck on "Thinking…"); guard with `finished`.
    res.on('close', () => { if (!finished) handle.cancel() })
  })

  // Serve the built web UI (Vite output). Anything that isn't an /api route falls back to
  // index.html so the single-page app handles its own routing.
  const uiDir = join(appRootDir(), 'out', 'renderer')
  if (existsSync(uiDir)) {
    app.use(express.static(uiDir))
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(uiDir, 'index.html')))
  }

  // Honor a fixed port if asked (PORT env), else pick a free one. 127.0.0.1 = localhost only.
  const wanted = Number(process.env.PORT) || 0
  return new Promise((resolve) => {
    const server = app.listen(wanted, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port)
    })
  })
}
