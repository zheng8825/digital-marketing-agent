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
  - `.claude/commands/` — custom slash commands (NOT `.claude/skills/`): `post`, `campaign`, `gtm`,
    `report`, `kol`, `ppt` (see the "Added 2026-05-12" note below for the full current list).
  - `outputs/` — generated deliverables.

**Repo layout (actual):** `src/main/` (Electron main: server, claude-bridge, workspace, sessions, usage,
setup, setup-run, git-sync), `src/preload/`, `src/renderer/` (Vite React — `src/App.tsx` etc.),
`src/shared/types.ts`, `agent-workspace/`, `build/` (`icon.png`), `electron.vite.config.ts` +
`electron-builder.yml`, `memory/` (dev-side Claude Code memory, junctioned), top-level `CLAUDE.md`
(for Claude Code working ON this repo) + `README.md`. (The early `electron/` + `ui/` scaffold was
never used — electron-vite's `src/{main,preload,renderer}` layout is what shipped.)

**Progress (2026-05-12):**
- ✅ `agent-workspace/` built: `CLAUDE.md` (the marketing agent's persona), `knowledge/`
  (01 brand&products, 02 channels&partners, 03 kol-list, 04 calendar&moments, 05 learnings,
  _inputs-needed, README, strategy/00-brand-awareness-strategy), `.claude/settings.json`
  (acceptEdits + allowlist), `.claude/commands/{post,campaign,report,kol}.md`, `outputs/`.
- ✅ App scaffold committed (commit c3abc3c): `package.json` (electron-vite, Vite+React+TS,
  Tailwind 3.4, electron-builder; deps: express, cross-spawn; **no `"type":"module"`** — CJS),
  `electron.vite.config.ts`, `tsconfig.*`, `tailwind.config.js`+`postcss.config.js` (CJS),
  `electron-builder.yml` (win nsis+portable; `extraResources` ships agent-workspace as template),
  `build/README.md` (icon TODO).
  - `src/main/`: `workspace.ts` (resolves per-user workspace: config > dev-repo's agent-workspace
    > `<userData>/agent-workspace` seeded from `process.resourcesPath/agent-workspace`; safe
    read/write of TRAINABLE_FILES; config.json for model/workspaceDir), `sessions.ts` (chat
    index+transcripts in userData, NOT the repo), `claude-bridge.ts` (spawns `claude -p
    --output-format stream-json --verbose --include-partial-messages [--resume <id>]` via
    cross-spawn, cwd=workspace, **deletes ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN/Bedrock/Vertex
    env so it uses the Pro/Max subscription**, message via stdin, parses stream-json → ChatStreamEvent,
    10-min timeout, cancel on client disconnect), `setup.ts` (best-effort detect claude version /
    logged-in / api-key-in-env / claude-mem), `git-sync.ts` ("Sync": find repo root, add/commit/push),
    `server.ts` (Express on 127.0.0.1 random port: /api/setup,/sessions,/agent/file{s},/sync,/config,
    POST /api/chat = SSE), `index.ts` (Electron: BrowserWindow loads ELECTRON_RENDERER_URL or built
    index.html; `ipcMain.handle('get-api-port')`).
  - `src/preload/index.ts`: contextBridge `appBridge.getApiPort()`.
  - `src/renderer/`: `index.html` (CSP), `src/main.tsx`, `src/index.css` (DM Sans via @fontsource,
    tailwind, pulse-dot), `src/api.ts` (fetch wrapper + SSE `streamChat` + `relTime`), `src/App.tsx`
    (the dashboard: header+status dot+Sync btn, setup banner, left chat-history sidebar, center
    streaming chat w/ tool-use chips + `/post /campaign /report /kol` quick buttons, right panel:
    Notes scratchpad (localStorage) + "Train agent" file editor (loads/saves TRAINABLE_FILES)).
- `origin = git@github.com:zheng8825/digital-marketing-agent.git` (SSH); `main` **pushed** &
  tracking `origin/main` as of 2026-05-12. See [[setup-git-sync]].

**Added 2026-05-12 (commits 07cf714, b005238, 4414ecf):**
- App icon: `build/icon.png` (user-supplied) → electron-builder auto-converts; dev window icon too.
- Model selector (Default/Sonnet/Opus/Haiku → `claude --model`) + Effort selector (Quick/Standard/Deep
  → `MAX_THINKING_TOKENS` env on the child) — inline in the header AND in a Settings modal; persisted in
  `<userData>/config.json`. `MODEL_OPTIONS`/`EFFORT_OPTIONS`/`AppConfig` in `src/shared/types.ts`;
  `getModel`/`getThinkingTokens` in workspace.ts; `GET /api/models`.
- Usage: `src/main/usage.ts` (per-day + all-time token totals in `<userData>/usage.json`); bridge parses
  `usage`/`duration_ms`/`total_cost_usd` from the CLI `result` event → emitted on the `done` SSE event +
  `recordTurn()`. `GET /api/usage`. Header usage chip + a usage popover (notes Pro/Max = no per-token bill).
- First-time **setup wizard** (`src/renderer/SetupWizard.tsx` + `src/main/setup-run.ts` + `POST
  /api/setup/run` SSE + `POST /api/setup/terminal`): per-step "Do it for me" (runs npm i -g
  @anthropic-ai/claude-code / `claude login` [scans output for the auth URL → `shell.openExternal`] /
  `npx --yes claude-mem install`, streams output) + "Copy command" + "Open a terminal" (PowerShell in
  the workspace) + "Re-check". Auto-opens when `claude` isn't installed; also reachable from the banner
  and Settings. Preload gained `openWorkspace()` + `open-workspace` IPC.

**Verified 2026-05-12:** `npm install` (603 pkgs, Electron binary downloaded — `package-lock.json` now
committed), `npm run typecheck`, `npm run build:unpacked` (electron-vite build of main+preload+renderer)
all pass; `npm run dev` boots the vite dev server and launches Electron (only sandbox GPU/network-service
crash noise, expected in a headless env). `npm run build` (electron-builder) **also passes** → produces
`release/Marketing Agent-0.1.0-portable.exe`, `release/Marketing Agent-0.1.0-x64.exe` (NSIS installer),
`release/win-unpacked/`; launching `release/win-unpacked/Marketing Agent.exe` stays alive with the normal
3 child procs (renderer/GPU/utility) → packaged app runs. Two typecheck fixes in that pass: added
`baseUrl`+`paths` (`@shared/*`, `@renderer/*`) to `tsconfig.web.json` so `tsc` resolves the renderer's
`@shared/types` imports (the alias was only in `electron.vite.config.ts`); removed unused
`modelLabel`/`effortLabel` in `App.tsx`.

**electron-builder gotcha (this machine):** `npm run build` first downloads `winCodeSign-2.6.0.7z`,
whose extraction creates macOS `.dylib` symlinks → fails with `Cannot create symbolic link : A required
privilege is not held by the client` unless Windows **Developer Mode** is on (or the build runs
elevated). Workaround used here: manually extract that .7z (minus `darwin/`) into
`%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\`, then re-run — electron-builder
finds the cache and skips re-extracting. Documented in README's "Build the .exe" section.

**Added 2026-05-12 (account badge + terminal button + 2 skills):**
- **Account/auth badge.** `setup.ts` now also runs `claude auth status` (JSON output) — probed with the
  same env the agent uses (ANTHROPIC_API_KEY/AUTH_TOKEN/Bedrock/Vertex stripped), so it reflects the
  agent's real auth. New `ClaudeAuthInfo` type on `SetupStatus.auth` (`loggedIn`, `authMethod` e.g.
  `'claude.ai'`, `apiProvider` e.g. `'firstParty'`, `email`, `orgName`, `subscriptionType` e.g.
  `'max'`/`'pro'`, derived `usingSubscription`). Header shows a chip (email · plan; green if subscription,
  amber if API/not-signed-in) → clicking it opens Settings; Settings "Setup & account" section spells it
  out, plus an info line if `ANTHROPIC_API_KEY` is in the env (agent ignores it). `App.tsx` helpers
  `planLabel()` / `authChip()`.
- **"Terminal" button in the chat composer** (`api.openTerminal()` → existing `POST /api/setup/terminal`
  → `openTerminal()` in setup-run.ts, opens PowerShell in the agent workspace). Also added an "Open a
  terminal" button to the Settings dialog.
- **2 new slash commands** in `agent-workspace/.claude/commands/`: `gtm.md` (go-to-market plan for a new
  notebook launch — pre-launch → launch → sustain phases, PR/seeding, KOL embargo, retail co-marketing,
  KPIs per phase; distinct from `/campaign` which is for existing-product promo moments) and `ppt.md`
  (turn a plan/report/topic into a slide-by-slide deck w/ speaker notes + suggested visual per slide;
  中文 for internal/boss, EN/BM for partners; offers to also emit a real `.pptx` via python-pptx, or a
  Marp deck, else the markdown pastes straight into PowerPoint). `agent-workspace/CLAUDE.md` core-jobs
  list updated to 6 jobs (`/post /campaign /gtm /report /kol /ppt`); UI quick-action pills updated to
  match (6 pills + the Terminal button).

**Added 2026-05-12 (document upload — NotebookLM-style "sources"):**
- The marketer can upload PPT / Word / PDF / text files; the agent reads them and answers questions
  grounded in them. Files land in `<workspace>/uploads/`: the original, plus — for `.docx`/`.pptx`/`.xlsx`
  — a `.md` sidecar holding the extracted text (the agent reads the sidecar; `.pptx` is slide-by-slide
  with speaker notes; `.xlsx` is CSV per sheet). PDFs & text files stay as-is (Claude Code reads PDFs
  natively). `uploads/_index.md` is an auto-maintained table the agent reads to know what's available
  and which file to open for each; `uploads/.docs.json` is the UI's metadata (hidden from the agent).
  Old binary `.doc`/`.ppt`/`.xls` are rejected with a "re-save as .docx/.pptx or PDF" note.
- New files: `src/main/doc-extract.ts` (pure-JS extraction — `mammoth` for docx, hand-rolled `jszip`
  parsers for pptx slide XML & xlsx; new deps `mammoth` + `jszip` in `dependencies`) and `src/main/docs.ts`
  (`getUploadsDir`/`listDocs`/`addDoc`/`deleteDoc`/`rewriteIndex`). `UploadedDoc` type + `MAX_UPLOAD_BYTES`
  (40 MB) in shared/types. Server: `GET /api/docs`, `POST /api/docs/upload` (raw body via
  `express.raw({type:'*/*'})`, filename in `x-filename` header), `DELETE /api/docs/:id`. `ensureWorkspace()`
  also mkdirs `uploads/`; `electron-builder.yml` ships an empty `uploads/` (filter `!uploads/**` +
  `uploads/.gitkeep`); `.gitignore` excludes `agent-workspace/uploads/*` (local working area, not synced).
- UI: a 3rd right-sidebar tab **"Docs"** (Notes / Docs / Train) — add-files button + drag-drop, the doc
  list with kind/size/time, a per-doc checkbox ("use as a source for the next message"), "Ask" (pre-fills
  the chat input referencing it) and remove. When sources are ticked, `send()` prepends
  `[Use these uploaded sources to answer (read them first): <paths>]` to the outgoing message (the bubble
  shows the clean text) and a "Using N sources: …" chip shows above the composer. A `Docs` button in the
  quick-actions row jumps to the tab + opens the file picker. `agent-workspace/CLAUDE.md` gained an
  "Uploaded documents — `uploads/`" section telling the agent to read `_index.md`, answer grounded, cite
  which file/slide/section, and not invent content.

**Still TODO:** the wife's-machine first run (clone or copy the `.exe`, walk the setup wizard, real
chat). Optional later: a UI view that reads claude-mem's SQLite memory.

**Known risks / things to revisit:** `--include-partial-messages` / `--verbose` flags must be
supported by the installed Claude Code (it's a prerequisite — keep it updated); `looksLoggedIn()`
heuristic can false-negative on Windows (credential-manager storage); the official Agent SDK
forbids subscription billing so we deliberately drive the CLI directly; if `claude` prompts for a
tool permission in headless mode and the allowlist/acceptEdits doesn't cover it, the turn may stall
— may need `--permission-prompt-tool` handling later.

Related: [[user-profile]], [[setup-git-sync]], [[feedback-working-style]], [[project-current-focus]]
