# digital-marketing-agent — repo guide (for Claude Code working ON this repo)

This repo builds a **double-click, no-install Windows local web app**: `start.bat` starts a local
Node server and opens a web UI ("Marketing Agent Dashboard") in the system browser — deliberately
*not* an installed app, because the end user's company audits installed software. The end user is the developer's
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
- **No Electron / no installer.** Double-click `start.bat` → it finds Node (system PATH, or a
  portable `node/node.exe` dropped in the folder), `npm install` + `npm run build` on first run,
  then runs a plain **Node + Express** server. The server hosts the built UI + API on `127.0.0.1`;
  the entry (`src/main/index.ts`) opens the system default browser at that URL. Reason: the wife's
  company audits *installed apps*, so the product must be just files + a browser tab — nothing installed.
- **Launcher UX (Windows, no PowerShell — exec policy may be locked down):** `start.bat` does a
  single-instance check (re-opens the tab if already running via `data/server.pid`+`server.url`),
  auto-rebuilds after a `git pull` (compares `git rev-parse HEAD` to `out/.build-commit`), launches
  the server **hidden** through `launch-hidden.vbs` (no console to close by accident; logs →
  `data/server.log`), and auto-creates a desktop shortcut once (`create-shortcut.vbs`). `stop.bat`
  taskkills the recorded PID. `npm run fetch-node` bundles portable Node for Node-less machines.
- **Server (`src/main/`):** `index.ts` (entry: start server + open browser), `server.ts` (Express:
  serves `out/renderer` + the `/api/*` routes), `claude-bridge.ts` / `codex-bridge.ts` (spawn the CLI
  in headless streaming mode against `agent-workspace/`, stream to the UI over SSE), `cli-bin.ts`
  (locate the CLI + strip API-key env), `runtime.ts` (host helpers replacing Electron `app`/`shell`:
  data dir, open browser/folder), `workspace.ts`, `sessions.ts`, `usage.ts`, `setup.ts`/`setup-run.ts`,
  `git-sync.ts`, `docs.ts`. Data (config/sessions/usage) lives in a self-contained `data/` folder.
- **Renderer/UI (`src/renderer/`):** Vite + React + TypeScript + Tailwind. Same-origin API (no preload).
- **Build:** `vite.config.ts` (Vite → `out/renderer`), `build/build-server.mjs` (esbuild → `out/main/index.cjs`).
- **`agent-workspace/`:** the live cwd for the spawned CLI — `CLAUDE.md` (the marketing
  agent's persona), `knowledge/` (ASUS MY brand/strategy/channels/KOL/learnings),
  `.claude/skills/` (slash commands: trilingual social posts, seasonal campaign + ad copy,
  monthly report/analytics, KOL mgmt + competitor research), `outputs/` (generated work).
  The wife's "training" edits land here; the app can commit+push them ("Sync" button).
- **`memory/`:** YOUR (dev assistant) Claude Code memory — junctioned from
  `~/.claude/projects/.../memory`. Read `memory/MEMORY.md` at session start.

## Conventions
- TypeScript everywhere. Reply to the user in Chinese (中文). Marketing copy the agent
  produces is EN / Bahasa Melayu / Chinese per campaign.
- Keep big binaries out of git (see `.gitignore`); link them from `agent-workspace/outputs/assets/`.

## Sync between the developer's machine (A) and the wife's machine (B)
Remote: `origin = https://github.com/zheng8825/digital-marketing-agent.git`. See `README.md`.
First push needs the developer's Git Credential Manager popup — they run `git push -u origin main`.
