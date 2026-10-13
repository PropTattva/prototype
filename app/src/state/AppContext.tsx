import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Role, Scope } from '../types'

export type View = 'dashboard' | 'parks' | 'availability' | 'organisations'

interface AppState {
  scope: Scope
  setRole: (role: Role) => void
  setOwnerId: (ownerId: string) => void
  /** Simulated occupier/public lens: masks tenant names and commercials. */
  publicLens: boolean
  setPublicLens: (on: boolean) => void
  view: View
  parkId: string | null
  navigate: (view: View, parkId?: string | null) => void
}

const Ctx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>('admin')
  const [ownerId, setOwnerIdState] = useState('OWN-1')
  const [publicLens, setPublicLens] = useState(false)
  const [view, setView] = useState<View>('dashboard')
  const [parkId, setParkId] = useState<string | null>(null)

  const value = useMemo<AppState>(() => {
    const navigate = (v: View, p: string | null = null) => {
      setView(v)
      setParkId(p)
      window.scrollTo({ top: 0 })
    }
    return {
      scope: { role, ownerId },
      // Switching identity lands on the dashboard so a stale, now out-of-scope park never shows.
      setRole: (r) => {
        setRoleState(r)
        navigate('dashboard')
      },
      setOwnerId: (o) => {
        setOwnerIdState(o)
        navigate('dashboard')
      },
      publicLens,
      setPublicLens,
      view,
      parkId,
      navigate,
    }
  }, [role, ownerId, publicLens, view, parkId])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppProvider')
  return v
}
