import type { Option, OptionCtx } from './types'

export const shortId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
export const plural = (n: number, w: string, many = `${w}s`) => `${n} ${n === 1 ? w : many}`
export const isLive = (s: { status: string }) => s.status === 'Active' || s.status === 'Trial'

export const orgName = (ctx: OptionCtx, id: string | null) => ctx.organisations.find((o) => o.org_id === id)?.name ?? id ?? '—'
export const orgOptions = (ctx: OptionCtx): Option[] => ctx.organisations.map((o) => ({ value: o.org_id, label: o.name, group: o.type }))
export const orgTypeOf = (ctx: OptionCtx, id: string | null) => ctx.organisations.find((o) => o.org_id === id)?.type

export const buildingName = (ctx: OptionCtx, id: string | null) => ctx.buildings.find((b) => b.building_id === id)?.name ?? id ?? '—'
export const occupierName = (ctx: OptionCtx, id: string | null) => ctx.occupiers.find((o) => o.occupier_id === id)?.name ?? (id ? 'Occupier' : '—')

export const buildingOptions = (ctx: OptionCtx): Option[] =>
  ctx.buildings.map((b) => ({ value: b.building_id, label: b.name, group: ctx.campuses.find((c) => c.campus_id === b.campus_id)?.name ?? 'Standalone' }))
export const campusOptions = (ctx: OptionCtx): Option[] => ctx.campuses.map((c) => ({ value: c.campus_id, label: c.name, group: c.city }))
export const occupierOptions = (ctx: OptionCtx): Option[] => ctx.occupiers.map((o) => ({ value: o.occupier_id, label: o.name, group: o.sector_tag }))

export function floorLabel(ctx: OptionCtx, floorId: string | null) {
  const f = ctx.floors.find((x) => x.floor_id === floorId)
  return f ? `Floor ${f.floor_no}${f.wing ? ` · ${f.wing}` : ''}` : '—'
}
export const floorOptions = (ctx: OptionCtx, buildingId: string | null): Option[] =>
  ctx.floors
    .filter((f) => f.building_id === buildingId && f.floor_use !== 'Parking')
    .map((f) => ({ value: f.floor_id, label: `Floor ${f.floor_no}${f.wing ? ` · ${f.wing}` : ''}${f.chargeable_area ? ` — ${f.chargeable_area.toLocaleString('en-IN')} sq ft` : ''}` }))

export function leaseLabel(ctx: OptionCtx, leaseId: string | null) {
  const l = ctx.leases.find((x) => x.lease_id === leaseId)
  return l ? `${occupierName(ctx, l.occupier_id)} · ${buildingName(ctx, l.building_id)}` : leaseId ?? '—'
}
export const leaseOptions = (ctx: OptionCtx): Option[] =>
  ctx.leases.map((l) => ({ value: l.lease_id, label: `${occupierName(ctx, l.occupier_id)} — ${l.lease_id}`, group: buildingName(ctx, l.building_id) }))
