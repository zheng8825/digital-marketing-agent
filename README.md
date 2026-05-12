# Marketing Agent Dashboard (ASUS MY notebooks)

A double-click Windows app for an in-house ASUS Malaysia notebook marketer. It starts a
local server and opens a web UI where she chats with a digital-marketing agent (trilingual
EN / Bahasa Melayu / Chinese) for: social post copy, seasonal campaign plans + ad copy,
monthly reporting / analytics, and KOL management + competitor research. She can keep
**"training"** the agent from the UI (refine its instructions & knowledge). The agent runs
on **Claude Code with a Claude Pro/Max subscription** (no API key, no per-token billing) and
keeps **long-term memory** via [claude-mem](https://github.com/thedotmack/claude-mem).

> Status: the app builds and runs (UI, chat bridge, local API, setup wizard, model/effort/usage,
> sync). Still pending real-world use: the wife's-machine first-run, and exercising the agent's
> skills on live campaigns. See the commit history.

## How it works
- **Electron** app → `electron-builder` produces a portable `Marketing Agent-<version>-portable.exe`
  and an NSIS installer (`Marketing Agent-<version>-x64.exe`). Double-click → an Express server starts
  in-process → a window opens with the dashboard (it's a local web UI, so you can also open
  `http://localhost:<port>` in a browser).
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

## Documents — upload sources, ask about them (NotebookLM-style)
The right sidebar's **"Docs"** tab: drag in (or pick) **PPT / Word / PDF / text** files. They're saved
into the agent's `uploads/` folder — Office files get a `.md` sidecar with the extracted text (decks
slide-by-slide, with speaker notes; spreadsheets as CSV), PDFs/text stay as-is. Tick a doc as a "source"
and your next message tells the agent to read it; or hit **Ask** on a doc to start a question about it.
The agent answers grounded in the file and cites the slide/section. (Old binary `.doc`/`.ppt` aren't
supported — re-save as `.docx`/`.pptx` or export to PDF.) Uploads stay on this machine (not synced).

## Settings, model, account & usage
- Gear (top-right) or the inline header dropdowns: **Model** (Default / Sonnet / Opus / Haiku — passed
  to `claude --model`) and **Effort** (Quick / Standard / Deep — sets the extended-thinking budget via
  `MAX_THINKING_TOKENS`). Saved in `<userData>/config.json`; applies to the next message.
- The header **account chip** (and Settings → "Setup & account") shows who's signed in and on what plan —
  it runs `claude auth status`; green means the agent is using your Claude Pro/Max subscription, not the
  paid API. Settings has a **Switch account** button (signs out, then opens the browser to sign in to a
  different account — useful if you hit a usage limit or need a Pro/Max account), plus **Open a terminal**
  (also the chat composer's "Terminal" button).
- The agent is pinned to **Claude Sonnet** by default (predictable, fast, light on quota) — pick Opus or
  Haiku in the header/Settings if you want. If a reply errors, the message says what to do (sign in /
  switch account / wait for the usage limit / start a new chat).
- **Usage** chip in the header shows the last reply's tokens + time; click it for today / all-time totals.
  On a Pro/Max plan there's no per-token charge — it's just throughput info.
- The Settings dialog also shows setup status and an **Open workspace folder** button (the agent's
  `CLAUDE.md`, `knowledge/`, `uploads/`, `outputs/`).

## Develop (machine A — the developer)
```powershell
npm install
npm run dev          # Vite UI + Electron with hot reload
```

## Build the .exe
```powershell
npm run build        # → release/  →  "Marketing Agent-<version>-portable.exe"  +  "Marketing Agent-<version>-x64.exe" (installer)
```
> First build downloads electron-builder's `winCodeSign` bundle, which contains macOS symlinks.
> Extracting those needs symlink-create rights — turn on **Windows Settings → For developers →
> Developer Mode** (or run the build from an elevated terminal) once, or `npm run build` fails with
> `Cannot create symbolic link : A required privilege is not held by the client`. (`npm run dev` and
> `npm run build:unpacked` don't need this.)

## Use on the wife's machine (machine B)
1. Install the prerequisites above (Node, Claude Code + `claude login`, `npx claude-mem install`).
2. Get the app: either copy over the built portable `.exe` / run the installer, **or** `git clone`
   this repo and `npm install && npm run build`.
3. Double-click the app. First run walks through any missing setup.
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
| `src/main/` | Electron main process: Express server (`server.ts`), `claude` CLI bridge (`claude-bridge.ts`), workspace/config (`workspace.ts`), chat sessions (`sessions.ts`), token usage (`usage.ts`), setup detect/run (`setup.ts`, `setup-run.ts`), git sync (`git-sync.ts`) |
| `src/preload/` | preload script + its `.d.ts` (the `window` API the renderer sees) |
| `src/renderer/` | Vite + React + TS + Tailwind renderer (the dashboard) — `src/App.tsx`, `src/SetupWizard.tsx`, `src/api.ts` |
| `src/shared/` | types shared by main + renderer (`types.ts`) |
| `agent-workspace/` | the spawned `claude`'s cwd — `CLAUDE.md` (persona), `knowledge/`, `.claude/skills/`, `outputs/` |
| `build/` | app icon (`icon.png`) |
| `electron.vite.config.ts`, `electron-builder.yml` | build config (electron-vite bundling; electron-builder packaging → `release/`) |
| `memory/` | Claude Code (dev assistant) memory for working on this repo — see `CLAUDE.md` |
