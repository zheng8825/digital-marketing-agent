// Drives the OpenAI Codex CLI (`codex`) in headless streaming mode, against the agent workspace,
// using the user's ChatGPT Plus/Pro subscription (we strip OPENAI_API_KEY so it never bills the
// paid API; the user authenticated via `codex login` → ChatGPT OAuth).
//
// Protocol: `codex exec --json --skip-git-repo-check [--model X] [resume <id>]` emits
// newline-delimited JSON events of the form (see codex-rs/exec/src/exec_events.rs):
//   {"type":"thread.started","thread_id":"…"}
//   {"type":"turn.started"}
//   {"type":"item.started"|"item.updated"|"item.completed","item":{"id":"…","details":{…}}}
//     details.type ∈ "agent_message" (cumulative text) | "reasoning" | "command_execution"
//                  | "file_change" | "mcp_tool_call" | "web_search" | "todo_list" | "error"
//   {"type":"turn.completed","usage":{input_tokens,…}} | {"type":"turn.failed","error":"…"}
//   {"type":"error","message":"…"}
// We translate these to the same ChatStreamEvent union as claude-bridge so the UI doesn't care
// which provider it's talking to.

import spawn from 'cross-spawn'
import type { ChildProcess } from 'node:child_process'
import { relative, isAbsolute } from 'node:path'
import type { ChatStreamEvent, TurnUsage } from '../shared/types'
import { getCodexModel, getWorkspaceDir } from './workspace'
import { recordTurn } from './usage'
import { agentEnv, resolveCodexBin } from './cli-bin'

const TURN_TIMEOUT_MS = 10 * 60 * 1000

export interface ChatHandle {
  done: Promise<void>
  cancel(): void
}

interface ChatOptions {
  /** Existing codex thread id to resume; omit/undefined to start a new conversation. */
  conversationId?: string
  message: string
  onEvent: (e: ChatStreamEvent) => void
}

function parseUsage(u: any, durationMs: number): TurnUsage {
  return {
    inputTokens: Number(u?.input_tokens ?? 0) || 0,
    outputTokens: Number(u?.output_tokens ?? 0) || 0,
    cacheReadTokens: Number(u?.cached_input_tokens ?? 0) || 0,
    cacheWriteTokens: 0, // codex doesn't report this
    durationMs,
    costUsd: 0 // ChatGPT subscription — no per-token billing
  }
}

function decorateError(raw: string, hadConversationId: boolean): string {
  const m = (raw || '').trim() || 'codex stopped without a reply'
  const low = m.toLowerCase()
  if (/sign in|not authenticated|unauthorized|no auth|please log in|codex login|chatgpt/.test(low))
    return `${m}\n\n→ Sign in: open Settings → "Switch account" (or run \`codex login\` with your ChatGPT Plus/Pro plan).`
  if (/rate limit|quota|too many requests|usage limit|limit reached/.test(low))
    return `${m}\n\n→ You've hit your ChatGPT plan's usage limit. Wait for it to reset, switch to Claude (Settings → "Switch account"), or pick a lighter model.`
  if (hadConversationId && /(thread|session) .*(not found|expired|does not exist)|resume/.test(low))
    return `${m}\n\n→ This chat's session expired. Start a new chat (the + button) and ask again.`
  return m
}

function toolSummaryFromDetails(details: any, cwd: string): { name: string; summary: string } | null {
  const t = details?.type
  if (t === 'command_execution') {
    const cmd = String(details.command ?? '').replace(/\s+/g, ' ').slice(0, 80)
    return { name: 'Bash', summary: `Bash: ${cmd}` }
  }
  if (t === 'file_change') {
    const ch = Array.isArray(details.changes) ? details.changes[0] : undefined
    const raw = String(ch?.path ?? ch?.file ?? ch?.target ?? '')
    const rel = raw && isAbsolute(raw) ? relative(cwd, raw) || raw : raw
    return { name: 'Edit', summary: rel ? `Edit ${rel}` : 'Edit' }
  }
  if (t === 'web_search') {
    return { name: 'WebSearch', summary: `WebSearch: ${String(details.query ?? details.action ?? '').slice(0, 80)}` }
  }
  if (t === 'mcp_tool_call') {
    return { name: String(details.tool ?? 'tool'), summary: `${details.server ?? ''}${details.server ? ':' : ''}${details.tool ?? ''}` }
  }
  if (t === 'todo_list') {
    const n = Array.isArray(details.items) ? details.items.length : 0
    return { name: 'TodoList', summary: `TodoList (${n} item${n === 1 ? '' : 's'})` }
  }
  return null
}

export function chat({ conversationId, message, onEvent }: ChatOptions): ChatHandle {
  const cwd = getWorkspaceDir()
  const model = getCodexModel()

  // codex exec [resume <id>] [flags...] <PROMPT>. Flags-after-resume keeps the parser happy
  // across versions, and the prompt as a positional argv arg avoids stdin quirks on Windows.
  const args: string[] = ['exec']
  if (conversationId) args.push('resume', conversationId)
  args.push('--json', '--skip-git-repo-check')
  if (model) args.push('--model', model)
  args.push(message)

  let child: ChildProcess
  try {
    child = spawn(resolveCodexBin(), args, { cwd, env: agentEnv('codex'), stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    onEvent({ type: 'error', message: `Could not start \`codex\`: ${(err as Error).message}` })
    return { done: Promise.resolve(), cancel: () => {} }
  }

  let settled = false
  let stderr = ''
  let stdoutBuf = ''
  const startedAt = Date.now()
  /** AgentMessage `text` is cumulative across item.* events for the same item id — track what
   *  we've already streamed so we emit only the new tail as a delta. */
  const shownText = new Map<string, string>()
  const reportedTools = new Set<string>() // item ids we've already announced as a tool
  let lastFinalText = '' // most recent completed agent_message — used as a fallback if the turn
                          // ends without a delta path (matches claude-bridge's `result.result` fallback)
  let usage: any = null
  let resolveDone: () => void
  const done = new Promise<void>((res) => (resolveDone = res))

  const finish = (e?: ChatStreamEvent): void => {
    if (settled) return
    settled = true
    if (e) onEvent(e)
    clearTimeout(timer)
    resolveDone()
  }

  const timer = setTimeout(() => {
    try {
      child.kill()
    } catch {
      /* ignore */
    }
    finish({ type: 'error', message: 'The agent took too long and was stopped (10 min limit).' })
  }, TURN_TIMEOUT_MS)

  const emitAgentTextDelta = (id: string, fullText: string): void => {
    const prev = shownText.get(id) ?? ''
    if (fullText.length <= prev.length) return // shrunk or unchanged — ignore
    const tail = fullText.slice(prev.length)
    shownText.set(id, fullText)
    onEvent({ type: 'delta', text: tail })
  }

  const handleItem = (item: any): void => {
    const id = String(item?.id ?? '')
    const d = item?.details
    if (!d || typeof d !== 'object') return
    if (d.type === 'agent_message' && typeof d.text === 'string') {
      emitAgentTextDelta(id, d.text)
      lastFinalText = d.text
      return
    }
    if (d.type === 'error' && typeof d.message === 'string') {
      // an item-level error — surface but don't terminate; turn.failed (or close) will.
      onEvent({ type: 'tool', name: 'error', summary: `error: ${d.message.slice(0, 120)}` })
      return
    }
    // Tools: announce on first sight (started/updated), don't spam on each update.
    if (!reportedTools.has(id)) {
      const t = toolSummaryFromDetails(d, cwd)
      if (t) {
        reportedTools.add(id)
        onEvent({ type: 'tool', ...t })
      }
    }
  }

  const handleLine = (line: string): void => {
    const trimmed = line.trim()
    if (!trimmed) return
    let obj: any
    try {
      obj = JSON.parse(trimmed)
    } catch {
      return
    }
    switch (obj?.type) {
      case 'thread.started':
        if (typeof obj.thread_id === 'string') onEvent({ type: 'session', id: obj.thread_id })
        break
      case 'item.started':
      case 'item.updated':
      case 'item.completed':
        handleItem(obj.item)
        break
      case 'turn.completed':
        usage = obj.usage ?? null
        break
      case 'turn.failed': {
        const err = typeof obj.error === 'string' ? obj.error : (obj.error?.message ?? 'turn failed')
        finish({ type: 'error', message: decorateError(err, !!conversationId) })
        break
      }
      case 'error': {
        const msg = typeof obj.message === 'string' ? obj.message : 'codex reported an error'
        finish({ type: 'error', message: decorateError(msg, !!conversationId) })
        break
      }
      default:
        break
    }
  }

  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString('utf8')
    let nl: number
    while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, nl)
      stdoutBuf = stdoutBuf.slice(nl + 1)
      handleLine(line)
    }
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8')
  })
  child.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      finish({ type: 'error', message: 'The `codex` command was not found. Install it (`npm i -g @openai/codex`) and sign in (Settings → "Switch account", or `codex login`).' })
    } else {
      finish({ type: 'error', message: decorateError(err.message, !!conversationId) })
    }
  })
  child.on('close', (code) => {
    if (stdoutBuf.trim()) handleLine(stdoutBuf)
    if (settled) return
    if (code === 0) {
      // If for any reason no delta path fired but we did see a final agent_message, surface it now
      // (mirrors claude-bridge's `result.result` fallback).
      const total = Array.from(shownText.values()).reduce((n, s) => n + s.length, 0)
      if (total === 0 && lastFinalText) onEvent({ type: 'delta', text: lastFinalText })
      const u = parseUsage(usage, Date.now() - startedAt)
      try { recordTurn(u) } catch { /* non-fatal */ }
      finish({ type: 'done', usage: u })
    } else {
      const detail = stderr.trim().split(/\r?\n/).filter((l) => l.trim()).slice(-4).join(' ')
      finish({ type: 'error', message: decorateError(detail || `\`codex\` exited with code ${code ?? '?'}`, !!conversationId) })
    }
  })

  return {
    done,
    cancel: () => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      finish()
    }
  }
}
