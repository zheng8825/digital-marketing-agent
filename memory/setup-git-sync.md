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
- **No remote yet** — user chose "local repo only for now" (2026-05-12). When ready,
  add GitHub private repo / a bare repo on OneDrive / company Git. Until then, A↔B sync
  is by copying the folder or adding a remote.

When the user says "push 上 git" before switching machines → `git add -A && git commit`
(and `git push` once a remote exists). When they say "git pull 繼續" → pull, check
`memory/MEMORY.md`, continue.

Related: [[user-profile]]
