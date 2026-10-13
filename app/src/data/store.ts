// In-browser database: platform records live here and persist to localStorage (demo edits survive reloads).
// Only data/api.ts should import this module.
import { useSyncExternalStore } from 'react'
import type { PlatformDb } from '../domain/platform'
import { createSeed } from './seed'

const KEY = 'pt-demo-db'
// Bump when the stored shape changes so old browsers re-seed instead of crashing.
const VERSION = 1

let db: PlatformDb = load()
const listeners = new Set<() => void>()

function load(): PlatformDb {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.version === VERSION) return parsed.db as PlatformDb
    }
  } catch {
    // storage unavailable or corrupt: fall through to a fresh seed
  }
  return createSeed()
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, db }))
  } catch {
    // private mode / quota: keep working in memory
  }
}

export function readDb(): PlatformDb {
  return db
}

/** Apply a change immutably: the mutator receives a deep copy and returns nothing. */
export function writeDb(mutate: (draft: PlatformDb) => void) {
  const next = structuredClone(db)
  mutate(next)
  db = next
  persist()
  listeners.forEach((l) => l())
}

export function resetDb() {
  db = createSeed()
  persist()
  listeners.forEach((l) => l())
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Re-render when anything in the store changes. */
export function useDbVersion() {
  return useSyncExternalStore(subscribe, () => db)
}
