import { useState } from 'react'

export interface PieSlice {
  key: string
  label: string
  value: number
  display: string
  color: string
}

/** Categorical slots in fixed order (dataviz reference palette). Assign by entity, never by rank. */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6']
export const OTHER_COLOR = '#a3a29c'

const R = 70
const INNER = 44

function arc(start: number, end: number) {
  // Angles in radians, 0 = 12 o'clock, clockwise.
  const pt = (r: number, a: number) => [100 + r * Math.sin(a), 100 - r * Math.cos(a)]
  const large = end - start > Math.PI ? 1 : 0
  const [x0, y0] = pt(R, start)
  const [x1, y1] = pt(R, end)
  const [x2, y2] = pt(INNER, end)
  const [x3, y3] = pt(INNER, start)
  return `M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${INNER} ${INNER} 0 ${large} 0 ${x3} ${y3} Z`
}

/** Donut with a legend that carries every value and share, so identity is never colour-alone. */
export default function PieChart({ slices, total, empty = 'No data' }: { slices: PieSlice[]; total: string; empty?: string }) {
  const [hover, setHover] = useState<string | null>(null)
  const sum = slices.reduce((s, x) => s + x.value, 0)
  if (!sum) return <p className="py-6 text-center text-sm text-ink-muted">{empty}</p>
  let a = 0
  const arcs = slices.map((s) => {
    const start = a
    a += (s.value / sum) * Math.PI * 2
    return { ...s, start, end: a }
  })
  const active = arcs.find((s) => s.key === hover)
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg viewBox="30 30 140 140" className="h-40 w-40 shrink-0" role="img" aria-label={slices.map((s) => `${s.label} ${s.display}`).join(', ')}>
        {arcs.length === 1 ? (
          <circle cx="100" cy="100" r={(R + INNER) / 2} fill="none" stroke={arcs[0].color} strokeWidth={R - INNER} />
        ) : (
          arcs.map((s) => (
            <path
              key={s.key}
              d={arc(s.start, s.end)}
              fill={s.color}
              stroke="#fff"
              strokeWidth="2"
              strokeLinejoin="round"
              opacity={hover && hover !== s.key ? 0.35 : 1}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              className="cursor-default transition-opacity"
            >
              <title>{`${s.label}: ${s.display} (${((s.value / sum) * 100).toFixed(1)}%)`}</title>
            </path>
          ))
        )}
        <text x="100" y="97" textAnchor="middle" className="fill-royal text-[15px] font-extrabold">
          {active ? `${((active.value / sum) * 100).toFixed(0)}%` : total}
        </text>
        <text x="100" y="112" textAnchor="middle" className="fill-ink-muted text-[8px]">
          {active ? active.label.slice(0, 18) : 'total'}
        </text>
      </svg>
      <ul className="w-full min-w-0 flex-1 space-y-0.5 text-xs">
        {arcs.map((s) => (
          <li
            key={s.key}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-2 rounded px-1.5 py-1 ${hover === s.key ? 'bg-hover' : ''}`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-soft" title={s.label}>{s.label}</span>
            <span className="shrink-0 font-semibold text-ink">{s.display}</span>
            <span className="w-11 shrink-0 text-right text-ink-muted">{((s.value / sum) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
