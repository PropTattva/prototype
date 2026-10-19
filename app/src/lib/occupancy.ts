// Leasable-area roll-ups for a set of buildings, shared by the V2 drill-down cards.
import type { DrillMix } from '../components/drill/Drill'
import type { OptionCtx } from '../entities/types'

export function floorMix(ctx: OptionCtx, buildingIds: string[]): DrillMix & { floors: number; leasable: number } {
  const ids = new Set(buildingIds)
  const fl = ctx.floors.filter((f) => ids.has(f.building_id) && f.floor_use !== 'Parking')
  const sum = (p: (t: string | null) => boolean) => fl.filter((f) => p(f.occupancy_type)).reduce((s, f) => s + (f.chargeable_area ?? 0), 0)
  const vacant = sum((t) => t === 'Vacant')
  const self = sum((t) => t === 'Self-occupied')
  const leasable = fl.reduce((s, f) => s + (f.chargeable_area ?? 0), 0)
  return { floors: fl.length, leasable, vacant, self, occupied: leasable - vacant - self }
}

export const occupancyPct = (m: { leasable: number; vacant: number }) => (m.leasable ? `${(((m.leasable - m.vacant) / m.leasable) * 100).toFixed(0)}%` : '—')
