import { useEffect, type ReactNode } from 'react'

/** Right-hand slide-over used for record view / edit / create. Full width on phones. */
export default function Drawer({ open, onClose, title, sub, children, footer }: {
  open: boolean
  onClose: () => void
  title: ReactNode
  sub?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close" className="absolute inset-0 bg-royal-dark/40" onClick={onClose} />
      <aside role="dialog" aria-modal="true" className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b-2 border-gold px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-extrabold text-royal">{title}</h2>
            {sub && <div className="mt-0.5 text-xs text-ink-soft">{sub}</div>}
          </div>
          <button onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-hover hover:text-ink" aria-label="Close">
            <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current"><path d="M6.3 5 5 6.3 8.7 10 5 13.7 6.3 15 10 11.3 13.7 15 15 13.7 11.3 10 15 6.3 13.7 5 10 8.7z" /></svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas px-5 py-3">{footer}</footer>}
      </aside>
    </div>
  )
}
