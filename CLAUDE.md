# ASUS Malaysia — Digital Marketing Workspace

This repo is **both** the working directory and the memory store for digital-marketing
work on ASUS notebooks (Malaysia market). It is synced between two computers (Laptop A
and Computer B) with git, so all plans, copy, trackers, and Claude's memory travel with it.

## At the start of every session, Claude should:
1. Read `memory/MEMORY.md` and any relevant files in `memory/` — that is the persistent context.
2. Check `strategy/` and `campaigns/` for current plans before proposing new ones.
3. Respond to the user in Chinese (中文) unless asked otherwise. Marketing copy itself is
   produced in English / Bahasa Melayu / Chinese depending on the campaign target.

## Role context (summary — full detail in memory/)
- User is an **ASUS Malaysia employee (原廠/HQ)** working on notebook marketing.
- Current primary objective: **brand awareness + traffic** in the Malaysian market.

## Repo layout
| Folder        | What goes in it |
|---------------|-----------------|
| `memory/`     | Claude's persistent memory (also junctioned from `~/.claude/projects/.../memory`) |
| `strategy/`   | Overall strategy, frameworks, annual/quarterly plans, audience & competitor notes |
| `campaigns/`  | One file (or folder) per campaign — brief, channels, budget, results |
| `content/`    | Content calendar, post copy, creative briefs, SEO content |
| `analytics/`  | UTM plan, tracking setup, GA4 notes, dashboards, performance reports |
| `assets/`     | Creative briefs + links to creative files (keep big binaries in cloud, link here) |

## Syncing Laptop A ↔ Computer B
See `README.md` for the exact commands. Short version: commit & note before switching
machines; on the other machine `git pull`, then (first time only) recreate the memory
junction with the command in `README.md`.
