export interface BarRow {
  key: string
  label: string
  value: number
  display: string
  tooltip?: string
  onClick?: () => void
}

/** Horizontal single-series bars: one hue, rounded data end, hover tooltip, optional click-through. */
export default function BarList({ rows, color = 'bg-brand', empty = 'No data' }: { rows: BarRow[]; color?: string; empty?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-ink-muted">{empty}</p>
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="space-y-1">
      {rows.map((r) => {
        const Tag = r.onClick ? 'button' : 'div'
        return (
          <li key={r.key}>
            <Tag
              onClick={r.onClick}
              className={`group relative flex w-full items-center gap-3 rounded-md px-1 py-1 text-left text-xs ${r.onClick ? 'hover:bg-slate-50' : ''}`}
            >
              <span className="w-20 shrink-0 truncate text-ink-soft sm:w-24" title={r.label}>{r.label}</span>
              <span className="h-3.5 flex-1 overflow-hidden rounded-r bg-slate-100">
                <span className={`block h-full rounded-r ${color}`} style={{ width: `${Math.max((r.value / max) * 100, 1.5)}%` }} />
              </span>
              <span className="w-16 shrink-0 text-right font-semibold text-ink">{r.display}</span>
              <span className="pointer-events-none absolute -top-8 left-24 z-10 hidden whitespace-nowrap rounded-md bg-navy-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block">
                {r.tooltip ?? `${r.label}: ${r.display}`}
              </span>
            </Tag>
          </li>
        )
      })}
    </ul>
  )
}
