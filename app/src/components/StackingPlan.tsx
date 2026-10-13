import type { StackCell, StackStatus } from '../data/api'
import type { Building } from '../domain/assets'
import { fmtDate } from '../lib/dates'
import { fmtSft } from '../lib/format'

export const STACK_STYLE: Record<StackStatus, { cell: string; dot: string; label: string }> = {
  Occupied: { cell: 'bg-royal-soft text-royal-dark border-royal/15', dot: 'bg-royal-soft border-royal/30', label: 'Occupied' },
  Expiring: { cell: 'bg-warn-bg text-[#7a5300] border-warn/30', dot: 'bg-warn-bg border-warn/40', label: 'Expiring ≤ 12 mo' },
  Partial: { cell: 'bg-[repeating-linear-gradient(135deg,#eaefff_0_6px,#e4f3ea_6px_12px)] text-royal-dark border-royal/15', dot: 'bg-[repeating-linear-gradient(135deg,#eaefff_0_3px,#e4f3ea_3px_6px)] border-royal/30', label: 'Part leased' },
  Vacant: { cell: 'bg-ok-bg text-ok border-ok/25', dot: 'bg-ok-bg border-ok/40', label: 'Vacant' },
  'Self-use': { cell: 'bg-[#efe8fa] text-[#57368a] border-[#57368a]/20', dot: 'bg-[#efe8fa] border-[#57368a]/30', label: 'Self-use' },
  Parking: { cell: 'bg-hover text-ink-muted border-line', dot: 'bg-hover border-line', label: 'Parking / MLCP' },
}

const ORDER = ['UB', 'G', 'LB', 'B1', 'B2', 'B3']
const floorRank = (f: string) => (/^\d+$/.test(f) ? 1000 - Number(f) : 1000 + (ORDER.indexOf(f) < 0 ? 99 : ORDER.indexOf(f)))

interface Props {
  plans: { building: Building; cells: StackCell[] }[]
  onCell?: (cell: StackCell, building: Building) => void
  /** Show building names in column headers (campus view) */
  multi?: boolean
}

/** E4-S03: floor-by-floor stacking plan. Colour plus a text label in every cell, so status is never colour-only. */
export default function StackingPlan({ plans, onCell, multi }: Props) {
  const cols = plans.flatMap(({ building, cells }) => {
    const wings = [...new Set(cells.map((c) => c.wing ?? ''))].sort()
    return wings.map((w) => ({ building, wing: w, cells: cells.filter((c) => (c.wing ?? '') === w) }))
  })
  const floors = [...new Set(plans.flatMap((p) => p.cells.map((c) => c.floor_no)))].sort((a, b) => floorRank(a) - floorRank(b))
  const all = plans.flatMap((p) => p.cells)
  const totals = (Object.keys(STACK_STYLE) as StackStatus[]).map((st) => ({ st, area: all.filter((c) => c.status === st).reduce((s, c) => s + (c.area ?? 0), 0), n: all.filter((c) => c.status === st).length }))
  const leasable = totals.filter((t) => t.st !== 'Parking').reduce((s, t) => s + t.area, 0)

  if (!all.length) return <p className="rounded-lg border border-line bg-white px-4 py-10 text-center text-sm text-ink-muted">No floors recorded yet — add floors to build the stacking plan.</p>

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-ink-soft">
        {totals.filter((t) => t.n).map(({ st, area, n }) => (
          <span key={st} className="flex items-center gap-1.5">
            <i className={`h-3 w-3 rounded-sm border ${STACK_STYLE[st].dot}`} />
            <b className="text-ink">{STACK_STYLE[st].label}</b> {n} fl · {fmtSft(area)} sq ft
            {st !== 'Parking' && leasable > 0 && <span className="text-ink-muted">({Math.round((area / leasable) * 100)}%)</span>}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full border-separate border-spacing-1 text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-12 bg-white px-1 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">Floor</th>
              {cols.map((c) => (
                <th key={c.building.building_id + c.wing} className="min-w-[118px] px-1 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-royal">
                  {multi ? c.building.name.split(' – ').pop() : ''}
                  {c.wing ? `${multi ? ' · ' : ''}${c.wing}` : multi ? '' : 'All wings'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {floors.map((fl) => (
              <tr key={fl}>
                <td className="sticky left-0 z-10 bg-white px-1 text-center font-mono font-semibold text-ink-soft">{fl}</td>
                {cols.map((c) => {
                  const cell = c.cells.find((x) => x.floor_no === fl)
                  if (!cell) return <td key={c.building.building_id + c.wing} />
                  const st = STACK_STYLE[cell.status]
                  const tip = [
                    `Floor ${cell.floor_no}${cell.wing ? ` · ${cell.wing}` : ''}`,
                    cell.label,
                    cell.area ? `${cell.area.toLocaleString('en-IN')} sq ft` : null,
                    cell.rent != null ? `₹${cell.rent}/sq ft/mo` : null,
                    cell.expiry ? `Expires ${fmtDate(cell.expiry)}` : null,
                    cell.vacancy_days != null ? `Vacant ${cell.vacancy_days} days` : null,
                    cell.masked ? 'Tenant masked for your role' : null,
                  ].filter(Boolean).join('\n')
                  return (
                    <td key={c.building.building_id + c.wing} className="p-0">
                      <button
                        title={tip}
                        onClick={() => onCell?.(cell, c.building)}
                        className={`flex h-[42px] w-full flex-col justify-center rounded border px-1.5 text-left leading-tight transition hover:ring-2 hover:ring-royal/40 ${st.cell}`}
                      >
                        <span className="truncate font-bold">{cell.masked ? <span className="italic">Leased</span> : cell.label}</span>
                        <span className="truncate opacity-80">
                          {cell.status === 'Vacant'
                            ? `${cell.area ? fmtSft(cell.area) : ''}${cell.vacancy_days != null ? ` · ${cell.vacancy_days}d` : ''}`
                            : cell.status === 'Expiring' && cell.expiry
                              ? `exp ${fmtDate(cell.expiry).replace(/^\d+ /, '')}`
                              : cell.area
                                ? fmtSft(cell.area)
                                : ''}
                        </span>
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
