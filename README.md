# digital-marketing (ASUS MY)

Working repo for ASUS Malaysia notebook digital marketing — strategy docs, campaign
plans, content, analytics, and the Claude Code memory for this project. Synced between
**Laptop A** and **Computer B** via git.

---

## How the A ↔ B sync works

There is **one git repo**, this folder. Everything that matters lives inside it,
including Claude's memory (`memory/`). Claude's normal memory path
(`~/.claude/projects/C--Users-Leong-Zhen-Documents-LeongZhen-digital-marketing/memory`)
is a **directory junction** that points at `memory/` in this repo, so when Claude reads
or writes memory it actually reads/writes files in the repo, which git then tracks.

### Daily flow

**Before you stop on Laptop A:**
```powershell
cd "$env:USERPROFILE\Documents\LeongZhen\digital-marketing"
git add -A
git commit -m "wip: <what you did>"
git push        # once a remote is added (see below)
```
(For now there is no remote, so instead of `push`: copy this whole folder to
the other machine, or add a remote — see "Adding a remote" below.)

**When you start on Computer B:**
```powershell
cd "$env:USERPROFILE\Documents\LeongZhen\digital-marketing"
git pull        # or copy the folder over
```

**First time on Computer B only — recreate the memory junction** (so Claude's memory
path points into this repo). Run in PowerShell:
```powershell
$src = "$env:USERPROFILE\.claude\projects\C--Users-Leong-Zhen-Documents-LeongZhen-digital-marketing\memory"
$dst = "$env:USERPROFILE\Documents\LeongZhen\digital-marketing\memory"
if (Test-Path $src) { Remove-Item $src -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Split-Path $src) | Out-Null
New-Item -ItemType Junction -Path $src -Target $dst | Out-Null
```
(This requires Computer B to use the same Windows username `Leong Zhen` and the same
folder path. If the path differs, just tell Claude — it will adjust.)

> Tip: you can also just ask Claude "把所有東西 push 上 git" before switching and
> "從 git pull 下來繼續" after — it knows this workflow.

---

## Adding a remote later (recommended for real A ↔ B sync)

A purely local repo can't be `pull`ed by another machine. Pick one:

- **GitHub private repo** (easiest): create an empty private repo, then
  ```powershell
  git remote add origin https://github.com/<you>/<repo>.git
  git push -u origin main
  ```
- **A folder in OneDrive / Google Drive / a USB drive** acting as the remote
  ("bare" repo) — ask Claude to set this up.
- **Company Git server** — get the URL from IT and `git remote add origin <url>`.

---

## Folder layout
See `CLAUDE.md`.
