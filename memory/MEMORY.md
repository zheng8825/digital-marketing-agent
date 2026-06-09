# Memory Index — Digital Marketing Agent (for ASUS MY marketer)

One line per memory. Full content lives in the linked file.

- [User profile](user-profile.md) — user is a developer building a marketing agent for his wife (ASUS MY notebook marketer); replies in Chinese
- [Agent project](project-digital-marketing-agent.md) — building a double-click .exe → local web UI marketing agent, backed by Claude Code (Pro subscription, not API) + claude-mem; Electron+Vite/React; agent-workspace/ holds the agent's persona/knowledge/skills
- [Marketing context](project-current-focus.md) — wife's context: brand awareness + traffic, MY; pushing Vivobook + Zenbook; Meta/Google/TikTok already running
- [Git sync setup](setup-git-sync.md) — this folder is the repo; memory/ is junctioned from ~/.claude; sync A↔B via git
- [Working agreement](feedback-working-style.md) — user wants strategy + hands-on execution, files committed to git
- [Codex CLI reference](reference-codex-cli.md) — `@openai/codex` subcommands & `codex exec --json` event schema (used by codex-bridge.ts)
- [Agent identity guard](decision-agent-identity-guard.md) — spawned agent read repo-root dev CLAUDE.md; fixed via --append-system-prompt in claude-bridge.ts; user declined restructuring
