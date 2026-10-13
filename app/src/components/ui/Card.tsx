import type { ReactNode } from 'react'

interface Props {
  title?: ReactNode
  sub?: ReactNode
  action?: ReactNode
  className?: string
  flush?: boolean
  children: ReactNode
}

/** v6 card: white, hairline border, gold rule under the header. */
export default function Card({ title, sub, action, className = '', flush, children }: Props) {
  return (
    <section className={`rounded-lg border border-line bg-white ${flush ? '' : 'p-4 sm:p-[18px]'} ${className}`}>
      {(title || action) && (
        <header className={`flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-gold pb-2.5 ${flush ? 'mx-4 mt-4 sm:mx-[18px] sm:mt-[18px]' : ''} mb-3`}>
          <div>
            {title && <h3 className="text-sm font-extrabold text-royal">{title}</h3>}
            {sub && <p className="mt-0.5 text-[11px] text-ink-muted">{sub}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
