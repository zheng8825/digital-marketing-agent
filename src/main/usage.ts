// Tracks token usage per day and all-time, in <userData>/usage.json. On a Pro/Max subscription
// there's no per-token billing, so this is just throughput info for the marketer.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TurnUsage, UsageBucket, UsageReport } from '../shared/types'
import { userDataDir } from './runtime'

const file = join(userDataDir(), 'usage.json')

interface Store {
  allTime: UsageBucket
  days: Record<string, UsageBucket>
  lastTurn?: TurnUsage
}

function emptyBucket(): UsageBucket {
  return { turns: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
}

function load(): Store {
  try {
    const s = JSON.parse(readFileSync(file, 'utf8')) as Store
    return { allTime: { ...emptyBucket(), ...s.allTime }, days: s.days ?? {}, lastTurn: s.lastTurn }
  } catch {
    return { allTime: emptyBucket(), days: {} }
  }
}

function save(s: Store): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(s, null, 2), 'utf8')
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function add(bucket: UsageBucket, u: TurnUsage): void {
  bucket.turns += 1
  bucket.inputTokens += u.inputTokens
  bucket.outputTokens += u.outputTokens
  bucket.cacheReadTokens += u.cacheReadTokens
  bucket.cacheWriteTokens += u.cacheWriteTokens
}

export function recordTurn(u: TurnUsage): void {
  const s = load()
  const k = todayKey()
  s.days[k] = s.days[k] ?? emptyBucket()
  add(s.days[k], u)
  add(s.allTime, u)
  s.lastTurn = u
  save(s)
}

export function getUsage(): UsageReport {
  const s = load()
  const k = todayKey()
  return { date: k, today: s.days[k] ?? emptyBucket(), allTime: s.allTime, lastTurn: s.lastTurn }
}
