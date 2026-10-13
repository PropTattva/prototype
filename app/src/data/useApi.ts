import { useEffect, useState } from 'react'
import { useDbVersion } from './store'

/** Run an async api call and re-run it whenever the store changes (stand-in for a query cache). */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; error: Error | null } {
  const version = useDbVersion()
  const [state, setState] = useState<{ data: T | undefined; error: Error | null }>({ data: undefined, error: null })
  useEffect(() => {
    let live = true
    fn().then(
      (data) => live && setState({ data, error: null }),
      (error) => live && setState({ data: undefined, error }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps])
  return state
}
