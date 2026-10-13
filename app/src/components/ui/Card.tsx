import type { ReactNode } from 'react'

interface Props {
  title?: string
  action?: ReactNode
  className?: string
  children: ReactNode
}

export default function Card({ title, action, className = '', children }: Props) {
  return (
    <section className={`rounded-xl border border-line bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-2">
          {title && <h3 className="text-xs font-semibold uppercase tracking-wider text-navy">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
