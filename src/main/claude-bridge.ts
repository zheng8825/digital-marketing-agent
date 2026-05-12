// Drives the Claude Code CLI (`claude`) in headless streaming mode, against the agent workspace,
// using the user's Pro/Max subscription (we strip ANTHROPIC_API_KEY so it never bills the paid API).
//
// Protocol: `claude -p --output-format stream-json --verbose --include-partial-messages [--resume <id>]`
// emits newline-delimited JSON. We translate that into the simple ChatStreamEvent union for the UI.

import spawn from 'cross-spawn'
import type { ChildProcess } from 'node:child_process'
import { relative, isAbsolute } from 'node:path'
import type { ChatStreamEvent, TurnUsage } from '../shared/types'
import { getModel, getThinkingTokens, getWorkspaceDir } from './workspace'
import { recordTurn } from './usage'

const CLAUDE_BIN = process.platform === 'win32' ? 'claude.cmd' : 'claude'
const TURN_TIMEOUT_MS = 10 * 60 * 1000

export interface ChatHandle {
  /** Resolves when the turn is fully done (success or error already emitted). */
  done: Promise<void>
  /** Abort the underlying `claude` process. */
  cancel(): void
}

interface ChatOptions {
  /** Existing Claude Code session id to continue; omit/undefined to start a new conversation. */
  conversationId?: string
  message: string
  onEvent: (e: ChatStreamEvent) => void
}

function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  // Force the logged-in subscription (Pro/Max) — these would otherwise route to the paid API.
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.CLAUDE_CODE_USE_BEDROCK
  delete env.CLAUDE_CODE_USE_VERTEX
  // "Effort" = extended-thinking budget. 0 (or unset) means no extended thinking.
  const thinkTokens = getThinkingTokens()
  if (thinkTokens > 0) env.MAX_THINKING_TOKENS = String(thinkTokens)
  else delete env.MAX_THINKING_TOKENS
  return env
}

function parseUsage(obj: any): TurnUsage {
  const u = obj?.usage ?? {}
  return {
    inputTokens: Number(u.input_tokens ?? 0) || 0,
    outputTokens: Number(u.output_tokens ?? 0) || 0,
    cacheReadTokens: Number(u.cache_read_input_tokens ?? 0) || 0,
    cacheWriteTokens: Number(u.cache_creation_input_tokens ?? 0) || 0,
    durationMs: Number(obj?.duration_ms ?? 0) || 0,
    costUsd: Number(obj?.total_cost_usd ?? 0) || 0
  }
}

/** Add a plain-English hint to a raw error so the marketer knows what to do about it. */
function decorateError(raw: string, hadConversationId: boolean): string {
  const m = (raw || '').trim() || 'the agent stopped without a reply'
  const low = m.toLowerCase()
  if (/invalid api key|please run \/login|not (?:logged in|authenticated)|unauthorized|oauth|no auth|run `?claude login/.test(low))
    return `${m}\n\n→ Sign in: open Settings → "Switch account" (or run \`claude login\` with your Pro/Max plan).`
  if (/rate limit|usage limit|limit reached|5-?hour limit|too many requests|quota/.test(low))
    return `${m}\n\n→ You've hit your Claude plan's usage limit. Wait for it to reset, switch to another account (Settings → "Switch account"), or pick a lighter model in the header.`
  if (hadConversationId && /(no conversation|session not found|session .* (?:not found|expired|does not exist)|resume|invalid session)/.test(low))
    return `${m}\n\n→ This chat's session expired. Start a new chat (the + button) and ask again.`
  return m
}

function toolSummary(name: string, input: unknown, cwd: string): string {
  const inp = (input ?? {}) as Record<string, unknown>
  const fp = inp.file_path ?? inp.path ?? inp.notebook_path
  if (typeof fp === 'string') {
    const rel = isAbsolute(fp) ? relative(cwd, fp) || fp : fp
    return `${name} ${rel}`
  }
  if (name === 'Bash' && typeof inp.command === 'string') {
    return `Bash: ${(inp.command as string).slice(0, 80)}`
  }
  if ((name === 'WebSearch' || name === 'WebFetch') && (inp.query || inp.url)) {
    return `${name}: ${String(inp.query ?? inp.url).slice(0, 80)}`
  }
  return name
}

export function chat({ conversationId, message, onEvent }: ChatOptions): ChatHandle {
  const cwd = getWorkspaceDir()
  const model = getModel()
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages']
  if (conversationId) args.push('--resume', conversationId)
  if (model) args.push('--model', model)

  let child: ChildProcess
  try {
    child = spawn(CLAUDE_BIN, args, { cwd, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (err) {
    onEvent({ type: 'error', message: `Could not start \`claude\`: ${(err as Error).message}` })
    return { done: Promise.resolve(), cancel: () => {} }
  }

  let settled = false
  let deltaCount = 0
  let stderr = ''
  let stdoutBuf = ''
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

  const handleLine = (line: string): void => {
    const trimmed = line.trim()
    if (!trimmed) return
    let obj: any
    try {
      obj = JSON.parse(trimmed)
    } catch {
      return // ignore non-JSON noise
    }
    switch (obj?.type) {
      case 'system':
        if (obj.subtype === 'init' && typeof obj.session_id === 'string') {
          onEvent({ type: 'session', id: obj.session_id })
        }
        break
      case 'stream_event': {
        const ev = obj.event
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && typeof ev.delta.text === 'string') {
          deltaCount++
          onEvent({ type: 'delta', text: ev.delta.text })
        }
        break
      }
      case 'assistant': {
        // A complete assistant turn message — mine it for tool uses (text already streamed via deltas).
        const content = obj.message?.content
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === 'tool_use' && typeof block.name === 'string') {
              onEvent({ type: 'tool', name: block.name, summary: toolSummary(block.name, block.input, cwd) })
            }
          }
        }
        break
      }
      case 'result': {
        const ok = obj.subtype === 'success' && !obj.is_error
        if (ok) {
          if (deltaCount === 0 && typeof obj.result === 'string' && obj.result) {
            onEvent({ type: 'delta', text: obj.result })
          }
          const usage = parseUsage(obj)
          try {
            recordTurn(usage)
          } catch {
            /* non-fatal */
          }
          finish({ type: 'done', usage })
        } else {
          const denials = Array.isArray(obj.permission_denials) ? obj.permission_denials.length : 0
          const base = String(obj.result || obj.api_error_status || obj.subtype || 'claude reported an error')
          finish({ type: 'error', message: decorateError(denials ? `${base} (the agent was denied ${denials} tool action${denials === 1 ? '' : 's'})` : base, !!conversationId) })
        }
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
      finish({ type: 'error', message: 'The `claude` command was not found. Install Claude Code (`npm i -g @anthropic-ai/claude-code`) and sign in (Settings → "Switch account", or `claude login`).' })
    } else {
      finish({ type: 'error', message: decorateError(err.message, !!conversationId) })
    }
  })
  child.on('close', (code) => {
    if (stdoutBuf.trim()) handleLine(stdoutBuf)
    if (!settled) {
      const detail = stderr.trim().split('\n').filter((l) => l.trim()).slice(-4).join(' ')
      finish({ type: 'error', message: decorateError(detail || `\`claude\` exited with code ${code ?? '?'}`, !!conversationId) })
    }
  })

  // Send the user's message via stdin (avoids any shell-quoting of the message).
  try {
    child.stdin?.write(message)
    child.stdin?.end()
  } catch {
    /* the 'error' handler will fire */
  }

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
