// Minimal hash router: #/admin/users/U-OWN-1 -> ['admin', 'users', 'U-OWN-1']. Links survive reloads and can be shared.
import { useSyncExternalStore } from 'react'

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const read = () => window.location.hash.replace(/^#\/?/, '')

export function useRoute(): string[] {
  const hash = useSyncExternalStore(subscribe, read)
  return hash.split('/').filter(Boolean).map(decodeURIComponent)
}

export function navigate(path: string) {
  const next = `#/${path.replace(/^\/+/, '')}`
  if (window.location.hash !== next) window.location.hash = next
}

export const href = (path: string) => `#/${path.replace(/^\/+/, '')}`
