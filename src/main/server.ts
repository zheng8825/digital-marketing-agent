// The local HTTP API the dashboard UI talks to. Runs in the Electron main process.
// Localhost-only; CORS is wide-open on purpose (so the developer can also hit it from a browser).

import express from 'express'
import type { AddressInfo } from 'node:net'
import { chat } from './claude-bridge'
import { getSetupStatus } from './setup'
import { openTerminal, runSetupStep, type SetupStep } from './setup-run'
import { syncWorkspace } from './git-sync'
import { appendMessage, deleteSession, listSessions, loadSession, setAssistantText } from './sessions'
import { getWorkspaceDir, readAgentFile, readConfig, writeAgentFile, writeConfig } from './workspace'
import { getUsage } from './usage'
import { addDoc, deleteDoc, listDocs } from './docs'
import {
  EFFORT_OPTIONS,
  MAX_UPLOAD_BYTES,
  MODEL_OPTIONS,
  TRAINABLE_FILES,
  type AppConfig,
  type ChatStreamEvent,
  type ThinkingEffort
} from '../shared/types'

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
  app.post('/api/setup/terminal', (_req, res) => {
    try {
      openTerminal()
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message })
    }
  })
  app.post('/api/setup/run', (req, res) => {
    const step = String(req.body?.step ?? '') as SetupStep
    if (!['install-claude', 'login', 'logout', 'install-mem'].includes(step)) return res.status(400).json({ error: 'unknown step' })
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()
    const handle = runSetupStep(step, { onLine: (text) => res.write(`data: ${JSON.stringify({ type: 'line', text })}\n\n`) })
    handle.done.then(() => {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
      res.end()
    })
    req.on('close', () => handle.cancel())
  })

  app.get('/api/config', (_req, res) => res.json({ ...readConfig(), workspaceDir: getWorkspaceDir() }))
  app.put('/api/config', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const patch: Partial<AppConfig> = {}
    if ('model' in body) patch.model = String(body.model ?? '')
    if ('thinkingEffort' in body) {
      const e = String(body.thinkingEffort ?? 'off')
      patch.thinkingEffort = (['off', 'standard', 'deep'].includes(e) ? e : 'off') as ThinkingEffort
    }
    if ('workspaceDir' in body && typeof body.workspaceDir === 'string') patch.workspaceDir = body.workspaceDir
    res.json({ ...writeConfig(patch), workspaceDir: getWorkspaceDir() })
  })
  app.get('/api/models', (_req, res) => res.json({ models: MODEL_OPTIONS, efforts: EFFORT_OPTIONS }))
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

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    const isNew = !conversationId
    let userMsgPersisted = false
    let acc = ''
    const send = (e: ChatStreamEvent): void => {
      res.write(`data: ${JSON.stringify(e)}\n\n`)
    }
    const persistUserMsg = (id: string): void => {
      if (userMsgPersisted) return
      appendMessage(id, { role: 'user', content: message, ts: Date.now() })
      userMsgPersisted = true
    }
    if (!isNew && conversationId) persistUserMsg(conversationId)

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
        if (e.type === 'done' || e.type === 'error') res.end()
      }
    })

    req.on('close', () => handle.cancel())
  })

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port)
    })
  })
}
