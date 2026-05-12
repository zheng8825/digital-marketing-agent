---
name: setup-git-sync
description: This project folder is a git repo; memory/ is junctioned from ~/.claude; synced between Laptop A and Computer B
metadata:
  type: project
---

The project working directory `C:\Users\Leong Zhen\Documents\LeongZhen\digital-marketing`
**is a git repo** (created 2026-05-12, branch `main`). It is the single source of truth
and is synced between **Laptop A** and **Computer B**.

Key setup:
- Claude's memory dir `~/.claude/projects/C--Users-Leong-Zhen-Documents-LeongZhen-digital-marketing/memory`
  is a **directory junction** pointing to `<repo>/memory/`. So memory files are inside
  the repo and tracked by git. Writing to either path is the same file.
- On a new machine: `git pull` (or copy the folder), then recreate the junction with the
  command block in `README.md` (one time).
- **Remote (2026-05-12):** `origin = git@github.com:zheng8825/digital-marketing-agent.git` (SSH —
  switched from the HTTPS URL; SSH key on Laptop A authenticates fine, no GCM popup needed).
  `main` is **pushed** and tracking `origin/main`. Computer B needs its own SSH key added to the
  GitHub account (or switch that machine's `origin` to HTTPS + GCM). (Local folder name stays
  `digital-marketing`; the GitHub repo / wife's clone is `digital-marketing-agent` — names
  differing is fine.) This repo is now an **app codebase** (Electron marketing-agent), not just
  marketing docs — see [[project-digital-marketing-agent]].

When the user says "push 上 git" before switching machines → `git add -A && git commit`
(and `git push` once a remote exists). When they say "git pull 繼續" → pull, check
`memory/MEMORY.md`, continue.

Related: [[user-profile]]
