// "Sync" — if the agent workspace lives inside a git repo, commit & push the training/output changes
// so the developer (machine A) and the marketer (machine B) stay in sync. No-op (with a clear message)
// when the workspace isn't a git checkout.

import spawn from 'cross-spawn'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getWorkspaceDir } from './workspace'

function findRepoRoot(start: string): string | null {
  let dir = start
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function git(repo: string, args: string[]): { code: number; out: string } {
  const r = spawn.sync('git', args, { cwd: repo, encoding: 'utf8', timeout: 120000 })
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}

export interface SyncResult {
  ok: boolean
  message: string
}

export function syncWorkspace(): SyncResult {
  const repo = findRepoRoot(getWorkspaceDir())
  if (!repo) {
    return { ok: false, message: 'This workspace is not inside a git repo, so there is nothing to sync. (Put it in a clone of the project repo to enable Sync.)' }
  }
  const status = git(repo, ['status', '--porcelain'])
  if (status.code !== 0) return { ok: false, message: `git status failed: ${status.out}` }

  if (status.out) {
    const add = git(repo, ['add', '-A'])
    if (add.code !== 0) return { ok: false, message: `git add failed: ${add.out}` }
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
    const commit = git(repo, ['commit', '-m', `agent: training/outputs update ${stamp}`])
    if (commit.code !== 0) return { ok: false, message: `git commit failed: ${commit.out}` }
  }

  const push = git(repo, ['push'])
  if (push.code !== 0) {
    return {
      ok: false,
      message: `Committed locally, but push failed (you may need to log into GitHub once — try running \`git push\` in a terminal):\n${push.out}`
    }
  }
  return { ok: true, message: status.out ? 'Synced: committed your changes and pushed to GitHub.' : 'Already up to date — nothing to commit. Pushed any pending commits.' }
}
