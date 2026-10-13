import type { ReactNode } from 'react'

export default function PageHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-extrabold tracking-tight text-royal">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-soft">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap gap-2">{right}</div>}
    </div>
  )
}
