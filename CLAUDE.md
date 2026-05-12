# digital-marketing-agent — repo guide (for Claude Code working ON this repo)

This repo builds a **Windows desktop app**: a double-click `.exe` that starts a local
server and opens a web UI ("Marketing Agent Dashboard"). The end user is the developer's
**wife**, an in-house **digital marketer for ASUS Malaysia notebooks**. She chats with a
marketing agent and can keep "training" it from the UI. The agent runs on **Claude Code**
using a **Claude Pro/Max subscription (NOT the Anthropic API)** and uses **claude-mem** for
long-term memory.

> Two distinct "Claude" layers — don't confuse them:
> 1. **This repo's dev assistant** = you, Claude Code, helping build the app. Your memory is `memory/`.
> 2. **The shipped marketing agent** = a Claude Code instance the app spawns, with cwd
>    `agent-workspace/` and persona `agent-workspace/CLAUDE.md`. That's the product.

## Hard requirements (do not violate)
- The shipped agent must use the **Claude Pro/Max subscription via `claude login`**, never
  an API key. Code that spawns `claude` MUST delete `ANTHROPIC_API_KEY` from the child env.
- Integrate **claude-mem** (`thedotmack/claude-mem`, installed via `npx claude-mem install`).
- UI follows the user's mockup: dark theme, DM Sans, Tailwind, lucide icons; header w/ live
  status dot, left = chat history, center = streaming chat, right = "workspace" panel
  (notes editor + an editor for the agent's `CLAUDE.md`/knowledge = "train the agent").

## Architecture (current decision)
- **Electron** (electron-builder → portable `.exe` + NSIS installer). Express server in the
  main process; BrowserWindow loads the local UI.
- **Renderer/UI:** Vite + React + TypeScript + Tailwind, in `ui/`.
- **`electron/`:** `main.ts`, `preload.ts`, `claude-bridge.ts` (spawns `claude` in headless
  `stream-json` mode against `agent-workspace/`, streams to the UI over SSE), `server.ts` (Express).
- **`agent-workspace/`:** the live cwd for the spawned `claude` — `CLAUDE.md` (the marketing
  agent's persona), `knowledge/` (ASUS MY brand/strategy/channels/KOL/learnings),
  `.claude/skills/` (slash commands: trilingual social posts, seasonal campaign + ad copy,
  monthly report/analytics, KOL mgmt + competitor research), `outputs/` (generated work).
  The wife's "training" edits land here; the app can commit+push them ("Sync" button).
- **`build/`:** icons, electron-builder extra config.
- **`memory/`:** YOUR (dev assistant) Claude Code memory — junctioned from
  `~/.claude/projects/.../memory`. Read `memory/MEMORY.md` at session start.

## Conventions
- TypeScript everywhere. Reply to the user in Chinese (中文). Marketing copy the agent
  produces is EN / Bahasa Melayu / Chinese per campaign.
- Keep big binaries out of git (see `.gitignore`); link them from `agent-workspace/outputs/assets/`.

## Sync between the developer's machine (A) and the wife's machine (B)
Remote: `origin = https://github.com/zheng8825/digital-marketing-agent.git`. See `README.md`.
First push needs the developer's Git Credential Manager popup — they run `git push -u origin main`.
