// E5-S04: a starting SWOT generated from PT data — the AA team then edits it.
import type { Building, BuildingFloor } from '../domain/assets'
import type { Lease } from '../domain/leasing'
import type { Swot } from '../domain/mandates'
import { addMonths, daysFromToday, todayIso } from './dates'

export function suggestSwot(b: Building, floors: BuildingFloor[], leases: Lease[], marketMedian: number | null, certs: string[]): Swot {
  const leasable = floors.filter((f) => f.floor_use !== 'Parking')
  const area = leasable.reduce((s, f) => s + (f.chargeable_area ?? 0), 0)
  const vacant = leasable.filter((f) => f.occupancy_type === 'Vacant')
  const vacantArea = vacant.reduce((s, f) => s + (f.chargeable_area ?? 0), 0)
  const aged = vacant.filter((f) => f.vacant_since && -daysFromToday(f.vacant_since) > 180)
  const active = leases.filter((l) => l.status === 'Active')
  const in12 = addMonths(todayIso(), 12)
  const expiring = active.filter((l) => l.expiry <= in12)
  const avgPlate = leasable.length ? area / leasable.length : 0
  const ask = leasable.map((f) => f.asking_rent).filter((x): x is number => x != null)
  const avgAsk = ask.length ? ask.reduce((s, x) => s + x, 0) / ask.length : null
  const occ = area ? (area - vacantArea) / area : 0
  const out: Swot = { strengths: [], weaknesses: [], opportunities: [], threats: [] }

  if (b.grade === 'A+' || b.grade === 'A') out.strengths.push(`Grade ${b.grade} asset in ${b.micro_market}`)
  if (certs.length) out.strengths.push(`Green certified: ${certs.join(', ')}`)
  if (occ >= 0.9) out.strengths.push(`Proven demand — ${(occ * 100).toFixed(0)}% occupied`)
  if (avgPlate >= 40000) out.strengths.push(`Large floor plates (~${Math.round(avgPlate / 1000)}k sq ft) suit GCC requirements`)

  if (aged.length) out.weaknesses.push(`${aged.length} floor${aged.length === 1 ? '' : 's'} vacant for more than 180 days`)
  if (avgAsk && marketMedian && avgAsk > marketMedian * 1.1) out.weaknesses.push(`Asking rent ₹${Math.round(avgAsk)} is above the market median ₹${marketMedian}`)
  if (!certs.length) out.weaknesses.push('No green certification — a gap for ESG-led occupiers')
  if (b.ownership_type !== 'Sole') out.weaknesses.push(`${b.ownership_type} ownership adds decision steps for mandates`)

  if (vacantArea) out.opportunities.push(`${Math.round(vacantArea / 1000)}k sq ft available to lease now`)
  if (avgAsk && marketMedian && avgAsk < marketMedian) out.opportunities.push(`Priced below the market median (₹${Math.round(avgAsk)} vs ₹${marketMedian}) — room to firm up rents`)
  if (expiring.length) out.opportunities.push(`${expiring.length} renewal${expiring.length === 1 ? '' : 's'} in the next 12 months to re-price`)
  out.opportunities.push('GCC expansion demand in the micro-market')

  if (expiring.length) out.threats.push(`${Math.round(expiring.reduce((s, l) => s + l.area, 0) / 1000)}k sq ft of leases expire within 12 months`)
  if (b.status === 'Pre-OC') out.threats.push('Completion risk until the occupancy certificate is issued')
  out.threats.push('New supply in competing micro-markets')
  return out
}
