# Marketing Agent Dashboard (ASUS MY notebooks)

A double-click Windows app for an in-house ASUS Malaysia notebook marketer. It starts a
local server and opens a web UI where she chats with a digital-marketing agent (trilingual
EN / Bahasa Melayu / Chinese) for: social post copy, seasonal campaign plans + ad copy,
monthly reporting / analytics, and KOL management + competitor research. She can keep
**"training"** the agent from the UI (refine its instructions & knowledge). The agent runs
on **Claude Code with a Claude Pro/Max subscription** (no API key, no per-token billing) and
keeps **long-term memory** via [claude-mem](https://github.com/thedotmack/claude-mem).

> ⚠️ Status: **in active development.** Not all of the below is implemented yet — see the
> task list / commit history. This README is the target.

## How it works
- **Electron** app → `electron-builder` produces a portable `MarketingAgent.exe` (and an
  installer). Double-click → an Express server starts in-process → a window opens with the
  dashboard (it's a local web UI, so you can also open `http://localhost:<port>` in a browser).
- The app spawns the **`claude` CLI** in headless streaming mode, with working directory
  `agent-workspace/` (the agent's persona = `agent-workspace/CLAUDE.md`, its knowledge =
  `agent-workspace/knowledge/`, its skills/slash-commands = `agent-workspace/.claude/skills/`).
- `ANTHROPIC_API_KEY` is stripped from the child environment so it always uses the logged-in
  **Pro/Max subscription**, never the paid API.
- **claude-mem** hooks Claude Code's session lifecycle to persist & recall long-term memory.

## Prerequisites (one-time, on whichever machine runs the app)
**The app has a built-in setup wizard** (opens automatically the first time, or via the gear → "Run
setup wizard") that walks the user through these with "Do it for me" buttons. Manually it's:
1. **Node.js 20+** — https://nodejs.org
2. **Claude Code**, signed in with a **Pro or Max** plan:
   ```powershell
   npm install -g @anthropic-ai/claude-code
   claude login          # choose your Pro/Max plan — do NOT set ANTHROPIC_API_KEY
   ```
3. **claude-mem** (long-term memory):
   ```powershell
   npx claude-mem install
   ```

## Settings, model & usage
- Gear (top-right) or the inline header dropdowns: **Model** (Default / Sonnet / Opus / Haiku — passed
  to `claude --model`) and **Effort** (Quick / Standard / Deep — sets the extended-thinking budget via
  `MAX_THINKING_TOKENS`). Saved in `<userData>/config.json`; applies to the next message.
- **Usage** chip in the header shows the last reply's tokens + time; click it for today / all-time totals.
  On a Pro/Max plan there's no per-token charge — it's just throughput info.
- The Settings dialog also shows setup status and an **Open workspace folder** button (the agent's
  `CLAUDE.md`, `knowledge/`, `outputs/`).

## Develop (machine A — the developer)
```powershell
npm install
npm run dev          # Vite UI + Electron with hot reload
```

## Build the .exe
```powershell
npm run build        # → release/ contains MarketingAgent.exe (portable) + the installer
```

## Use on the wife's machine (machine B)
1. Install the prerequisites above (Node, Claude Code + `claude login`, `npx claude-mem install`).
2. Get the app: either copy over the built `MarketingAgent.exe`, **or** `git clone` this repo
   and `npm install && npm run build`.
3. Double-click `MarketingAgent.exe`. First run walks through any missing setup.
4. Chat. Use the right "workspace" panel to refine the agent's instructions/knowledge — that
   is "training" it. Hit **Sync** to commit & push those changes back to GitHub so machine A
   sees them. (Requires `git` + GitHub auth on machine B — an SSH key on the account, or a
   one-time Git Credential Manager login if that machine uses the `https://` remote.)

## A ↔ B sync
Remote: `origin = git@github.com:zheng8825/digital-marketing-agent.git` (SSH).
- Developer (A): work, `git add -A && git commit && git push`.
- Wife (B): `git pull` (or use the app's Sync button), which brings both app updates and any
  training changes.
- Auth on each machine: add that machine's SSH key to the GitHub account, **or** point its
  `origin` at the `https://` URL and sign in via Git Credential Manager on first push.

## Repo layout
| Path | What |
|---|---|
| `electron/` | Electron main, preload, Express server, `claude` CLI bridge |
| `ui/` | Vite + React + TS + Tailwind renderer (the dashboard) |
| `agent-workspace/` | the spawned `claude`'s cwd — `CLAUDE.md` (persona), `knowledge/`, `.claude/skills/`, `outputs/` |
| `build/` | app icons, electron-builder extra config |
| `memory/` | Claude Code (dev assistant) memory for working on this repo — see `CLAUDE.md` |
