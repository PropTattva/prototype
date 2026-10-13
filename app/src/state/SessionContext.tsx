import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '../access/session'
import { resolveSession, signIn, signInBlocker, startViewAs } from '../data/api'
import { useDbVersion } from '../data/store'
import { navigate } from './router'

const KEY = 'pt-demo-session'

interface Stored {
  userId: string
  /** Real signed-in user; set only while viewing as someone else */
  actorId?: string
}

interface SessionApi {
  session: Session | null
  signInAs: (userId: string) => Promise<void>
  signOut: () => void
  viewAs: (userId: string) => Promise<void>
  exitViewAs: () => void
}

const Ctx = createContext<SessionApi | null>(null)

function loadStored(): Stored | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}

function saveStored(v: Stored | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v))
    else localStorage.removeItem(KEY)
  } catch {
    // ignore: session simply won't survive reload
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored | null>(loadStored)
  const dbVersion = useDbVersion()

  const update = useCallback((v: Stored | null) => {
    saveStored(v)
    setStored(v)
  }, [])

  // Re-resolved whenever the store changes, so role / plan / status edits take effect immediately (EP-A-S04, EP-B-S04).
  const session = useMemo(() => {
    if (!stored) return null
    const s = resolveSession(stored.userId, stored.actorId ?? stored.userId)
    if (!s || signInBlocker(s.actor)) return null
    return s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored, dbVersion])

  const api = useMemo<SessionApi>(
    () => ({
      session,
      signInAs: async (userId) => {
        await signIn(userId)
        update({ userId })
        navigate('')
      },
      signOut: () => {
        update(null)
        navigate('')
      },
      viewAs: async (userId) => {
        if (!session) return
        await startViewAs(session, userId)
        update({ userId, actorId: session.actor.user_id })
        navigate('')
      },
      exitViewAs: () => {
        if (!stored?.actorId) return
        update({ userId: stored.actorId })
        navigate('admin/view-as')
      },
    }),
    [session, stored, update],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useSession() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession outside SessionProvider')
  return v
}

/** For screens rendered only when signed in. */
export function useAuthed(): Session {
  const { session } = useSession()
  if (!session) throw new Error('Not signed in')
  return session
}
