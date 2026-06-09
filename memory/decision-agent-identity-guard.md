---
name: decision-agent-identity-guard
description: "Why the spawned marketing agent confused itself with the dev assistant, and the chosen fix"
metadata: 
  node_type: memory
  type: project
  originSessionId: d1858390-a48d-45fa-8f30-739634a8f45b
---

The shipped marketing agent runs with cwd `agent-workspace/`, but Claude Code walks UP the
directory tree and also loads the **repo-root `CLAUDE.md`** (this repo's *developer* guide) as
memory — so the agent introduced itself as "Claude Code, your dev assistant building this app".

**Fix (shipped, commit 43d63cf):** `src/main/claude-bridge.ts` passes `--append-system-prompt`
with an `IDENTITY_GUARD` string that pins the marketing persona and tells it to ignore any
parent-directory developer guide. Verified on real `claude -p` runs.

**Rejected alternatives:** `--bare` skips CLAUDE.md but forces ANTHROPIC_API_KEY auth (breaks the
Pro/Max subscription requirement); `--safe-mode` also disables the agent's skills (`/post` etc.);
`CLAUDE_CODE_DISABLE_CLAUDE_MDS` / `claudeMdExcludes` were unverifiable on the installed CLI.

**User decision (2026-06-09):** do NOT restructure to stop the leak (e.g. rename the root
`CLAUDE.md` or add `agent-workspace/AGENTS.md`) — the developer doesn't want to disturb his own
Claude Code dev workflow. So the dev guide still loads into the agent's context (cache stays ~same)
but the identity guard neutralizes the confusion. Codex path has no persona at all (reads AGENTS.md,
which doesn't exist) — left as-is since the user runs on Claude. See [[project-digital-marketing-agent]].
