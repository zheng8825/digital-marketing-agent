---
name: reference-codex-cli
description: "OpenAI Codex CLI command-line surface and `codex exec --json` event schema — used by the marketing-agent app's codex-bridge.ts. Useful when extending the bridge or debugging the codex protocol."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 7048c221-a7d9-439e-8905-2f6e69a3206c
---

OpenAI Codex CLI (npm package `@openai/codex`) — what the marketing-agent integration relies on.

**Subcommands we use:**
- `codex login` — OAuth flow for ChatGPT Plus/Pro subscription (no API key needed)
- `codex login status` — exit code 0 = signed in (no JSON output)
- `codex logout` — clears stored credentials
- `codex exec [resume <SESSION_ID>] [FLAGS] <PROMPT>` — headless mode
  - `--json` emits NDJSON events
  - `--skip-git-repo-check` — codex requires a git repo by default; flag bypasses
  - `--model <id>` — override the default model
  - resume sub-subcommand: `codex exec resume <SESSION_ID> [...]`

**`codex exec --json` event schema** — source of truth is `codex-rs/exec/src/exec_events.rs` in github.com/openai/codex:
- `{"type":"thread.started","thread_id":"..."}` — emit once at start
- `{"type":"turn.started"}` — ignore
- `{"type":"item.started"|"item.updated"|"item.completed","item":{"id":"...","details":{...}}}`
  - details.type variants: `agent_message` (text — cumulative across updates, must diff), `reasoning`, `command_execution` (command, exit_code, status), `file_change` (changes[], status), `mcp_tool_call` (server, tool, arguments), `collab_tool_call`, `web_search` (query, action), `todo_list` (items[]), `error` (message)
- `{"type":"turn.completed","usage":{"input_tokens","output_tokens","cached_input_tokens","reasoning_output_tokens"}}` — note no duration field (time the turn ourselves)
- `{"type":"turn.failed","error":"..."}` — recoverable turn failure
- `{"type":"error","message":"..."}` — fatal

**Auth env to strip** (so the OAuth subscription is used, not the paid API): `OPENAI_API_KEY`, `CODEX_API_KEY`. The latter is mentioned in the docs as the CI/automation override.

**Windows binary**: `codex.cmd` (npm shim) — resolved via [[cli-bin]] candidate dirs alongside `claude.cmd`.

Stream timeout, ENOENT handling, decorateError sign-in/quota hints all mirror [[claude-bridge]].
