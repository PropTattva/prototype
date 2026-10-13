import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Kind = 'ok' | 'error' | 'info'
interface Item { id: number; kind: Kind; text: string }

const Ctx = createContext<(kind: Kind, text: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const push = useCallback((kind: Kind, text: string) => {
    const id = Date.now() + Math.random()
    setItems((xs) => [...xs, { id, kind, text }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500)
  }, [])
  const tone = { ok: 'border-l-ok', error: 'border-l-crit', info: 'border-l-royal' }
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-4 z-[70] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto rounded-md border border-l-4 border-line bg-white px-4 py-3 text-[13px] text-ink shadow-lg ${tone[t.kind]}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
