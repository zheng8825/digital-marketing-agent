---
name: project-digital-marketing-agent
description: Goal/architecture — a double-click Windows .exe that hosts a local web UI marketing-agent, backed by Claude Code on the user's Claude Pro subscription, with claude-mem long-term memory
metadata:
  type: project
---

**What we're building (confirmed 2026-05-12):** a **Windows `.exe`** the user's wife
double-clicks → it **starts a local server + opens a web UI** ("Marketing Agent Dashboard")
→ she chats with a digital-marketing agent tuned for **ASUS Malaysia notebooks** and can
**keep "training" it** (refine its instructions/knowledge) from the UI. Built in this repo,
pushed to **https://github.com/zheng8825/digital-marketing-agent** ; the user clones it on
his wife's machine.

**Hard requirements from the user:**
1. Must run on the user's/wife's **Claude Pro subscription, NOT the Anthropic API** → so the
   backend drives the **Claude Code CLI** (`claude`), which authenticates via `claude login`
   (Pro/Max OAuth). Must ensure `ANTHROPIC_API_KEY` is unset before spawning so it doesn't
   fall back to paid API billing. (The official Agent SDK officially disallows subscription
   billing, so we drive the CLI directly rather than `query()`.)
2. Must integrate **claude-mem** (`thedotmack/claude-mem`, `npx claude-mem install`) for
   long-term memory — it hooks Claude Code's session lifecycle, compresses & stores to local
   SQLite + vector search, injects context into future sessions.
3. UI roughly like the mockup the user provided: header w/ live status dot, left sidebar =
   chat history, center = chat, right sidebar = "workspace" notes/editor panel. Dark theme,
   DM Sans, Tailwind, lucide icons.

**Chosen architecture (Claude's call, user can override):**
- **Electron** app (electron-builder → portable `.exe` + NSIS installer). BrowserWindow
  loads the local web UI; an Express server runs in the main process.
- Backend: `electron/claude-bridge.ts` spawns `claude` in headless streaming mode
  (`-p --output-format stream-json --input-format stream-json --include-partial-messages`,
  per-conversation persistent process / `--resume <session-id>`), streams tokens to the UI
  over SSE. Ships `@anthropic-ai/claude-code` as a dependency so the `.exe` includes the CLI
  binary; first-run setup screen runs `claude login` if not authed, and `npx claude-mem install`.
- UI: **Vite + React + TS + Tailwind** (renderer).
- **`agent-workspace/`** = the cwd `claude` runs in = "the marketing agent" itself:
  - `CLAUDE.md` — the agent's persona/instructions (senior DM for ASUS MY notebooks,
    trilingual EN/BM/ZH, knows channels: Meta/Google/TikTok+KOL already running, pushing
    Vivobook+Zenbook). Editable from the UI's "workspace" panel = how the wife "trains" it.
  - `knowledge/` — brand notes, strategy (`00-brand-awareness-strategy.md` moved here),
    channel info, KOL list, campaign learnings.
  - `.claude/skills/` — custom slash commands for her 4 core tasks: trilingual social posts,
    seasonal campaign + ad copy, monthly report/analytics, KOL mgmt + competitor research.
  - `outputs/` — generated deliverables.

**Repo layout:** `electron/`, `ui/` (Vite React), `agent-workspace/`, `build/` (icons,
electron-builder cfg), `memory/` (dev-side Claude Code memory, junctioned), top-level
`CLAUDE.md` (for Claude Code working ON this repo) + `README.md` (run/build/deploy).

**Open / to confirm with user:** Electron-app-window vs a lighter "server + open browser
tab" packaging (proceeding with Electron unless told otherwise); whether the GitHub repo
exists yet (push needs his GCM auth — have him run `! git push -u origin main`).

Related: [[user-profile]], [[setup-git-sync]], [[feedback-working-style]], [[project-current-focus]]
