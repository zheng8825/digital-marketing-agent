# Marketing Agent Dashboard (ASUS MY notebooks)

A **double-click, no-install** local web app for an in-house ASUS Malaysia notebook marketer.
You double-click `start.bat`; it serves a dashboard on `localhost` and opens it in your normal
browser. There's no installer and no desktop app — nothing shows up in "installed programs".
She chats with a digital-marketing agent (trilingual EN / Bahasa Melayu / Chinese) for: social
post copy, seasonal campaign plans + ad copy, monthly reporting / analytics, and KOL management
+ competitor research, and can keep **"training"** the agent from the UI (refine its instructions
& knowledge). The agent runs on the user's own **Claude Pro/Max** *or* **ChatGPT Plus/Pro**
subscription (no API key, no per-token billing); with Claude it keeps **long-term memory** via
[claude-mem](https://github.com/thedotmack/claude-mem).

## How it works
- **No Electron, no .exe.** `start.bat` finds Node.js (system install, or a portable copy you drop
  into a `node/` folder), runs `npm install` + `npm run build` on the first run (or after an update),
  then starts a plain **Node + Express** server. The server hosts the built React UI and the local API
  on `127.0.0.1`, and opens your default browser at that address.
- **Runs hidden, stop on purpose.** The server is launched with no visible console (via
  `launch-hidden.vbs`), so there's nothing to close by accident — closing the browser tab does *not*
  stop it. To stop it, double-click **`stop.bat`**. Logs go to `data/server.log`.
- **Friendly bits for the non-technical user:** first launch auto-creates a **Desktop shortcut**
  ("Marketing Agent", with icon); launching while it's already running just **re-opens the tab**
  instead of starting a second copy; and `start.bat` **auto-rebuilds after a `git pull`** (it stamps
  the built commit in `out/.build-commit`), so there's nothing to remember.
- It spawns the **`claude`** (or **`codex`**) CLI in headless streaming mode, with working directory
  `agent-workspace/` (the agent's persona = `agent-workspace/CLAUDE.md`, its knowledge =
  `agent-workspace/knowledge/`, its skills/slash-commands = `agent-workspace/.claude/skills/`).
- API-key env vars (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) are stripped from the child environment
  so it always uses the logged-in **subscription**, never the paid API.
- **claude-mem** hooks Claude Code's session lifecycle to persist & recall long-term memory.
- Machine-local data (config, chat history, usage) lives in a self-contained `data/` folder next to
  `start.bat` — not in AppData.

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
  `MAX_THINKING_TOKENS`). Saved in `data/config.json`; applies to the next message.
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
npm run dev          # Vite UI (port 5273, hot reload) + Node server (port 8731), /api proxied
```
Then open http://localhost:5273. (`npm run dev:server` / `npm run dev:web` run the two halves separately.)

## Build / run locally
```powershell
npm run build        # vite build → out/renderer  +  esbuild → out/main/index.cjs
npm start            # node out/main/index.cjs  (serves the UI, opens the browser)
```
Or just double-click **`start.bat`**, which does install + build (first run) then start.

## Use on the wife's machine (machine B) — no install
1. Make sure **Node.js 20+** is available — either installed (https://nodejs.org), or bundled: on
   machine A run `npm run fetch-node` (downloads a portable Node into `node/`), then copy the whole
   folder over. With `node\node.exe` present, nothing needs installing on machine B.
2. Get the app: `git clone` this repo (or copy the folder over).
3. Double-click **`start.bat`** (first run installs + builds, a few minutes). It creates a **Desktop
   shortcut** — after that she just double-clicks the "Marketing Agent" icon. The server runs hidden
   and the browser opens automatically.
4. First launch shows the **setup screen** to sign in to Claude Pro/Max or ChatGPT Plus/Pro (and,
   optionally, install claude-mem) — all from the UI.
5. To **stop** the agent, double-click **`stop.bat`** (closing the browser tab doesn't stop it).
6. Chat. Use the right "workspace" panel to refine the agent's instructions/knowledge — that
   is "training" it. Hit **Sync** to commit & push those changes back to GitHub so machine A
   sees them. After pulling new app code, run **`update.bat`** (stops the instance + `git pull`);
   the next `start.bat` rebuilds automatically. (Requires `git` + GitHub auth on machine B — an SSH
   key on the account, or a one-time Git Credential Manager login if it uses the `https://` remote.)

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
| `start.bat` | the launcher: single-instance check, find Node, install/build on first run or after an update, then launch the server hidden + open the browser, and make a desktop shortcut once |
| `stop.bat` | stops the hidden server (and anything it spawned) by the recorded PID |
| `update.bat` | stops the instance + `git pull` (next `start.bat` auto-rebuilds) |
| `launch-hidden.vbs`, `create-shortcut.vbs` | run the server with no console window; create the desktop shortcut |
| `src/main/` | Node server: entry (`index.ts`), Express server (`server.ts`), `claude`/`codex` CLI bridges (`claude-bridge.ts`, `codex-bridge.ts`), CLI discovery (`cli-bin.ts`), host runtime helpers (`runtime.ts`), workspace/config (`workspace.ts`), chat sessions (`sessions.ts`), token usage (`usage.ts`), setup detect/run (`setup.ts`, `setup-run.ts`), git sync (`git-sync.ts`) |
| `src/renderer/` | Vite + React + TS + Tailwind renderer (the dashboard) — `src/App.tsx`, `src/SetupWizard.tsx`, `src/api.ts` |
| `src/shared/` | types shared by main + renderer (`types.ts`) |
| `agent-workspace/` | the spawned CLI's cwd — `CLAUDE.md` (persona), `knowledge/`, `.claude/skills/`, `outputs/` |
| `build/` | app icon + build helpers (`build-server.mjs` = esbuild server bundle; `fetch-node.mjs` = download portable Node into `node/`) |
| `vite.config.ts` | web build config (Vite → `out/renderer`) |
| `out/` | build output (gitignored): `out/renderer` (UI), `out/main/index.cjs` (server) |
| `data/` | machine-local runtime data (gitignored): config, chat sessions, usage, `server.pid`/`server.url`, `server.log` |
| `node/` | optional bundled portable Node (gitignored) — present when delivered to a machine without Node |
| `memory/` | Claude Code (dev assistant) memory for working on this repo — see `CLAUDE.md` |
