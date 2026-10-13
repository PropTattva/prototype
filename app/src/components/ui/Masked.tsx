import type { ReactNode } from 'react'
import { useApp } from '../../state/AppContext'

/** Renders children normally; under the public lens shows a lock badge instead (PRD §7.1 "Owner + own team"). */
export default function Masked({ children, label = 'Owner only' }: { children: ReactNode; label?: string }) {
  const { publicLens } = useApp()
  if (!publicLens) return <>{children}</>
  return (
    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500" title="Hidden in the occupier / public view">
      <svg viewBox="0 0 16 16" className="h-3 w-3 fill-current" aria-hidden>
        <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
      </svg>
      {label}
    </span>
  )
}
