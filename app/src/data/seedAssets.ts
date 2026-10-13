// Builds the PRD asset & leasing entities from the demo dataset (mockData.json, generated from
// PropTattva_Demo_Database.xlsx). Anything the dataset lacks — lease commercials and dates, documents,
// contacts, invoices — is SAMPLE data from a seeded generator, so a reset always produces the same records.
import raw from './mockData.json'
import type { Dataset } from '../domain/legacy'
import { DOC_TYPES } from '../domain/assets'
import type {
  Building, BuildingAmenity, BuildingDocument, BuildingFloor, Campus, CampusAmenity, Certification, DevelopmentStatus,
  DocumentShare, FloorUnit, HandoverCondition, Owner, OwnerContact, OwnershipHistory,
} from '../domain/assets'
import type { Lease, LeaseDoc, LeaseRenewal, LeaseSpace, Occupier, OccupierBrokerLog, RelationshipLog, RentInvoice } from '../domain/leasing'
import type { PlatformDb } from '../domain/platform'
import { addDays, addMonths, todayIso } from '../lib/dates'
import { geocode } from '../lib/geo'

const demo = raw as Dataset

/** Deterministic PRNG (mulberry32) seeded from a string, so every record's sample values are stable. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
  let a = h >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
  }
}

const CITY_PIN: Record<string, string> = { 'City 1': '5600', 'City 2': '4110', 'City 3': '5000' }

function timelineToDate(t: string, today: string): string | null {
  if (/immediate/i.test(t)) return today
  const q = t.match(/Q([1-4])\s*(\d{4})/)
  if (q) return `${q[2]}-${String((+q[1] - 1) * 3 + 1).padStart(2, '0')}-01`
  const m = t.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i)
  if (m) {
    const month = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[1].toLowerCase()) / 3 + 1
    return `${m[2]}-${String(month).padStart(2, '0')}-01`
  }
  return null
}

const handoverOf = (h: string): HandoverCondition | null => (h === 'Warm Shell' || h === 'Furnished' || h === 'BTS' ? h : null)

export function createAssetSeed(): Omit<PlatformDb, 'organisations' | 'users' | 'invites' | 'plans' | 'subscriptions' | 'audit_log' | 'mandates' | 'vendors' | 'target_occupiers' | 'assessments' | 'assessment_criteria' | 'opportunities' | 'access_requests' | 'bays' | 'parking_rates'> {
  const today = todayIso()
  const parks = demo.parks

  // ---------------------------------------------------------------- owners & campuses
  const owners: Owner[] = [
    { owner_id: 'OWNR-1', org_id: 'OWN-1', name: 'Northstar Estates', sub_type: 'Owner (mixed)' },
    { owner_id: 'OWNR-2', org_id: 'OWN-2', name: 'Meridian Developers', sub_type: 'Owner (developer / under-construction)' },
    { owner_id: 'OWNR-3', org_id: 'OWN-3', name: 'Trinity Realty', sub_type: 'Owner (developer / under-construction)' },
    { owner_id: 'OWNR-4', org_id: 'OWN-4', name: 'Harbour Holdings', sub_type: 'Owner (leasing)' },
  ]
  const ownerOf = (orgId: string) => owners.find((o) => o.org_id === orgId)!.owner_id

  const campuses: Campus[] = parks.map((p) => ({
    campus_id: `CMP-${p.parkId}`,
    org_id: p.ownerId,
    name: p.name,
    total_area: p.msft ? Math.round(p.msft * 1e6) : null,
    num_buildings: demo.blocks.filter((b) => b.parkId === p.parkId).length,
    city: p.city,
    location: p.location.replace(/,\s*City \d$/, ''),
    development_status: p.status as DevelopmentStatus,
    acres: p.acres,
    management_company: p.ownerId === 'OWN-1' ? 'Northstar Facility Services' : null,
  }))

  // ---------------------------------------------------------------- buildings
  const listings = demo.availability.filter((a) => a.source === 'Owner listing')
  const floorsByBlock = new Map<string, typeof demo.floors>()
  for (const f of demo.floors) floorsByBlock.set(f.blockId, [...(floorsByBlock.get(f.blockId) ?? []), f])

  const buildings: Building[] = demo.blocks.map((b) => {
    const p = parks.find((x) => x.parkId === b.parkId)!
    const r = rng(b.blockId)
    const hasFloors = floorsByBlock.has(b.blockId)
    const whole = listings.find((a) => a.blockId === b.blockId && /full building|3B \+ G/i.test(a.floorLabel))
    const pincode = `${CITY_PIN[p.city] ?? '5600'}${String(r.int(10, 99))}`
    const geo = geocode(pincode)
    const preOc = !hasFloors && !!whole
    return {
      building_id: `BLD-${b.blockId}`,
      org_id: p.ownerId,
      owner_id: ownerOf(p.ownerId),
      campus_id: `CMP-${p.parkId}`,
      name: `${p.name} – ${b.name}`,
      address: `${b.name}, ${p.name}, ${p.location.replace(/,\s*City \d$/, '')}, ${p.city}`,
      pincode,
      city: p.city,
      micro_market: p.location.replace(/,\s*City \d$/, '').replace(/\s*\(.*\)$/, ''),
      lat: geo?.lat ?? null,
      long: geo?.long ?? null,
      grade: preOc ? null : /gold/i.test(p.certification ?? '') ? 'A+' : 'A',
      total_area: b.totalSft ?? whole?.areaSft ?? null,
      ownership_type: b.blockId === 'D-D2' ? 'Strata' : b.blockId === 'E-E1' ? 'Multi-owner' : 'Sole',
      multi_owner_struct:
        b.blockId === 'E-E1'
          ? [
              { name: 'Meridian Developers', pct: 51, decision_rights: 'Leasing, capex and board chair' },
              { name: 'Lakeshore Capital (JV partner)', pct: 49, decision_rights: 'Veto on sale and refinancing' },
            ]
          : [],
      status: preOc ? 'Pre-OC' : 'Active',
      // Trinity is still onboarding (nothing published); others publish every built asset and some pre-OC ones.
      published: p.ownerId !== 'OWN-3' && (!preOc || r.chance(0.6)),
      handover_condition: whole ? handoverOf(whole.handover) : null,
      expected_completion: whole ? timelineToDate(whole.timeline, today) : null,
      mandate_threshold_pct: b.blockId === 'D-D2' ? 80 : null,
      grade_source: preOc ? null : 'Imported',
      grade_assessed_at: null,
    }
  })

  // ---------------------------------------------------------------- floors (+ listing-only floors)
  const floorNum = (label: string) => label.match(/^(\d+)/)?.[1] ?? null
  const floors: BuildingFloor[] = []
  for (const f of demo.floors) {
    const p = parks.find((x) => x.parkId === f.parkId)!
    const r = rng(f.floorId)
    const parking = f.status === 'Parking'
    const area = f.areaSft ?? (parking ? null : r.int(22, 34) * 1000)
    const eff = r.int(70, 78) / 100
    const listing = listings.find((a) => a.blockId === f.blockId && floorNum(a.floorLabel) === f.floorNo)
    const vacant = f.status === 'Vacant'
    floors.push({
      floor_id: `FLR-${f.floorId}`,
      org_id: p.ownerId,
      building_id: `BLD-${f.blockId}`,
      floor_no: f.floorNo,
      wing: f.wing,
      floor_use: parking ? 'Parking' : 'Office',
      chargeable_area: area,
      carpet_area: area ? Math.round(area * eff) : null,
      efficiency: area ? Math.round(eff * 1000) / 10 : null,
      occupancy_type: parking ? null : f.status === 'Self-use' ? 'Self-occupied' : vacant ? 'Vacant' : 'Leased',
      self_occupied_entity: f.status === 'Self-use' ? 'Northstar Facility Services Pvt Ltd' : null,
      vacant_since: vacant ? addDays(today, -r.int(25, 640)) : null,
      asking_rent: parking ? null : (p.askingRent ?? 95) + r.int(-8, 8),
      handover_condition: vacant ? handoverOf(listing?.handover ?? '') ?? 'Warm Shell' : null,
      available_from: vacant ? timelineToDate(listing?.timeline ?? 'Immediate', today) : null,
    })
  }
  // Blocks with no stacking data but floor-level listings (e.g. B1 5th floor, E9 4th–7th).
  for (const a of listings) {
    const n = floorNum(a.floorLabel)
    if (!a.blockId || !n || floorsByBlock.has(a.blockId)) continue
    const p = parks.find((x) => x.parkId === a.parkId)!
    floors.push({
      floor_id: `FLR-${a.blockId}-${n}`,
      org_id: p.ownerId,
      building_id: `BLD-${a.blockId}`,
      floor_no: n,
      wing: null,
      floor_use: 'Office',
      chargeable_area: a.areaSft,
      carpet_area: a.areaSft ? Math.round(a.areaSft * 0.74) : null,
      efficiency: 74,
      occupancy_type: 'Vacant',
      self_occupied_entity: null,
      vacant_since: addDays(today, -rng(a.availId).int(10, 200)),
      asking_rent: p.askingRent ?? 98,
      handover_condition: handoverOf(a.handover),
      available_from: timelineToDate(a.timeline, today),
    })
  }
  for (const b of buildings) {
    if (b.total_area == null) b.total_area = floors.filter((f) => f.building_id === b.building_id).reduce((s, f) => s + (f.chargeable_area ?? 0), 0) || null
  }

  // Split a few large vacant floors into units (FloorUnit).
  const units: FloorUnit[] = []
  for (const f of floors.filter((x) => x.occupancy_type === 'Vacant' && (x.chargeable_area ?? 0) > 50000).slice(0, 4)) {
    const half = Math.round((f.chargeable_area ?? 0) / 2)
    for (const label of ['A', 'B']) {
      units.push({
        unit_id: `UNT-${f.floor_id.slice(4)}-${label}`,
        org_id: f.org_id,
        floor_id: f.floor_id,
        building_id: f.building_id,
        unit_label: `Unit ${label}`,
        chargeable_area: half,
        carpet_area: Math.round(half * 0.74),
        status: 'Available',
      })
    }
  }

  // ---------------------------------------------------------------- occupiers
  const PARENTS = ['Inc.', 'GmbH', 'plc', 'AG', 'SA', 'Corp.']
  const COUNTRIES = ['United States', 'Germany', 'United Kingdom', 'Switzerland', 'France', 'Japan']
  const occupiers: Occupier[] = demo.occupiers
    .filter((o) => o.sector !== 'Self-use')
    .map((o) => {
      const r = rng(o.occupierId)
      const i = r.int(0, PARENTS.length - 1)
      return {
        occupier_id: `OC-${o.occupierId.replace(/[^A-Z0-9]/gi, '')}`,
        name: o.name,
        sector_tag: o.sector as Occupier['sector_tag'],
        is_gcc: o.isGcc,
        is_startup: o.isStartup,
        parent_company: o.isGcc ? `${o.name} Holdings ${PARENTS[i]}` : o.isStartup ? null : `${o.name} Group`,
        parent_country: o.isGcc ? COUNTRIES[i] : 'India',
      }
    })
  occupiers.push({ occupier_id: 'OC-UNDISCLOSED', name: 'Undisclosed', sector_tag: 'Other', is_gcc: false, is_startup: false, parent_company: null, parent_country: null })
  const occupierId = (name: string) => occupiers.find((o) => o.name === name)?.occupier_id ?? 'OC-UNDISCLOSED'

  // ---------------------------------------------------------------- leases (one per occupier per building, spanning floors)
  const groups = new Map<string, BuildingFloor[]>()
  demo.floors.forEach((f, i) => {
    if (f.status !== 'Occupied' || !f.occupier) return
    const key = `${f.blockId}|${f.occupier}`
    groups.set(key, [...(groups.get(key) ?? []), floors[i]])
  })
  const leases: Lease[] = []
  const spaces: LeaseSpace[] = []
  let n = 0
  for (const [key, fls] of groups) {
    const [blockId, occName] = key.split('|')
    const p = parks.find((x) => x.parkId === blockId.split('-')[0])!
    const lease_id = `LSE-${String(++n).padStart(3, '0')}`
    const r = rng(lease_id)
    const area = fls.reduce((s, f) => s + (f.chargeable_area ?? 0), 0)
    const rent = Math.round((p.askingRent ?? 105) * (0.85 + r.next() * 0.25))
    const term = r.pick([5, 6, 9, 10] as const)
    // ~1 in 5 leases expire within the next 12 months so renewals and alerts have data.
    const expiring = r.chance(0.2)
    const expiry = expiring ? addDays(today, r.int(20, 360)) : addDays(today, r.int(400, 2900))
    const start = addMonths(expiry, -term * 12)
    const breakDate = r.chance(0.4) ? addMonths(start, 36 + r.pick([0, 12, 24])) : null
    const months = r.int(6, 10)
    const received = r.chance(0.9)
    leases.push({
      lease_id,
      org_id: fls[0].org_id,
      building_id: fls[0].building_id,
      floor_id: fls[0].floor_id,
      unit_id: null,
      occupier_id: occupierId(occName),
      area,
      rent,
      CAM: r.int(14, 22),
      escalation_pct: r.chance(0.7) ? 5 : 15,
      escalation_freq: null,
      rent_free_months: r.int(0, 6),
      rent_free_conditions: null,
      TI_contribution: r.pick([0, 0, 150, 250]),
      start,
      expiry,
      break_date: breakDate && breakDate > today ? breakDate : null,
      deposit: rent * area * months,
      deposit_months: months,
      deposit_form: r.chance(0.6) ? 'Cash' : 'Bank Guarantee',
      deposit_received: received,
      received_date: received ? addDays(start, -r.int(5, 30)) : null,
      parking_slots: Math.round(area / 1000),
      source_tag: r.pick(['PT-Verified', 'Owner-Declared', 'Owner-Declared', 'Propstack'] as const),
      status: 'Active',
    })
    const l = leases[leases.length - 1]
    l.escalation_freq = l.escalation_pct === 5 ? 'Annual' : 'Every 3 years'
    if (l.rent_free_months) l.rent_free_conditions = 'Fit-out period from handover; rent-free ends on occupation if earlier'
    fls.forEach((f, i) => spaces.push({ space_id: `SPC-${lease_id.slice(4)}-${i + 1}`, org_id: f.org_id, lease_id, floor_id: f.floor_id, unit_id: null, area: f.chargeable_area ?? 0 }))
  }

  // ---------------------------------------------------------------- renewals, abstracts, invoices, logs
  const ownerUser: Record<string, string> = { 'OWN-1': 'U-OWN-1', 'OWN-2': 'U-OWN-2', 'OWN-3': 'U-OWN-3' }
  const STAGES: LeaseRenewal['stage'][] = ['Initiated', 'Negotiating', 'Negotiating', 'Agreed', 'Lost']
  const renewals: LeaseRenewal[] = leases
    .filter((l) => l.expiry <= addDays(today, 365))
    .filter((l) => rng(`${l.lease_id}-ren`).chance(0.65))
    .map((l, i) => ({
      renewal_id: `REN-${String(i + 1).padStart(3, '0')}`,
      org_id: l.org_id,
      lease_id: l.lease_id,
      stage: rng(`${l.lease_id}-stage`).pick(STAGES),
      assignee: ownerUser[l.org_id] ?? null,
      target_date: addDays(l.expiry, -60),
      notes: 'Share renewal proposal; confirm escalation and fit-out refresh.',
    }))

  const occName = (id: string) => occupiers.find((o) => o.occupier_id === id)?.name ?? id
  const lease_docs: LeaseDoc[] = leases.slice(0, 24).map((l, i) => ({
    doc_id: `LDOC-${String(i + 1).padStart(3, '0')}`,
    org_id: l.org_id,
    lease_id: l.lease_id,
    file_ref: `${l.lease_id}_${occName(l.occupier_id)}_lease_deed.pdf`,
    abstract:
      `${occName(l.occupier_id)} leases ${l.area.toLocaleString('en-IN')} sq ft from ${l.start} to ${l.expiry} at ₹${l.rent}/sq ft/month plus CAM ₹${l.CAM}. ` +
      `Rent escalates ${l.escalation_pct}% ${l.escalation_freq?.toLowerCase()}. ${l.rent_free_months ? `${l.rent_free_months} months rent-free for fit-out. ` : ''}` +
      `Security deposit of ${l.deposit_months} months (${l.deposit_form}). ${l.break_date ? `Tenant break option on ${l.break_date}. ` : 'No break option. '}` +
      `${l.parking_slots} parking slots included.`,
  }))

  const rent_invoices: RentInvoice[] = []
  for (const l of leases.filter((x) => x.org_id !== 'OWN-3')) {
    for (let m = 4; m >= 1; m--) {
      const period = addMonths(today, -m + 1).slice(0, 7)
      const r = rng(`${l.lease_id}-${period}`)
      const amount = Math.round(((l.rent ?? 0) + (l.CAM ?? 0)) * l.area)
      const total = Math.round(amount * 1.18)
      const due = `${period}-10`
      const outcome = due > today ? 'unpaid' : r.chance(0.82) ? 'paid' : r.chance(0.5) ? 'partial' : 'unpaid'
      rent_invoices.push({
        rent_id: `INV-${l.lease_id.slice(4)}-${period.replace('-', '')}`,
        org_id: l.org_id,
        lease_id: l.lease_id,
        invoice_no: `${l.org_id.replace('-', '')}/${period.replace('-', '')}/${l.lease_id.slice(4)}`,
        period,
        amount,
        gst: 18,
        paid_amount: outcome === 'paid' ? total : outcome === 'partial' ? Math.round(total * 0.5) : 0,
        paid_date: outcome === 'unpaid' ? null : addDays(due, r.int(-5, 20)),
        due_date: due,
        source_tag: 'Manual',
      })
    }
  }

  const leaseIn = (orgId: string, k: number) => leases.filter((l) => l.org_id === orgId)[k]
  const relationship_log: RelationshipLog[] = [
    { log_id: 'REL-001', org_id: 'OWN-1', lease_id: leaseIn('OWN-1', 0).lease_id, date: addDays(today, -40), type: 'Meeting', summary: 'Quarterly review with facilities head; satisfied with HVAC upgrade.' },
    { log_id: 'REL-002', org_id: 'OWN-1', lease_id: leaseIn('OWN-1', 0).lease_id, date: addDays(today, -12), type: 'Request', summary: 'Asked for 40 additional parking slots from next quarter.' },
    { log_id: 'REL-003', org_id: 'OWN-1', lease_id: leaseIn('OWN-1', 2).lease_id, date: addDays(today, -6), type: 'Issue', summary: 'Water leak on floor 6 pantry; maintenance ticket raised.' },
    { log_id: 'REL-004', org_id: 'OWN-2', lease_id: leaseIn('OWN-2', 1).lease_id, date: addDays(today, -20), type: 'Note', summary: 'Expansion appetite: 50–80k sq ft in 2027.' },
  ]

  const bOf = (id: string) => buildings.find((b) => b.building_id === id)!
  const broker_log: OccupierBrokerLog[] = [
    { log_id: 'BRK-001', occupier_id: occupierId('AYG'), broker_org_id: 'ENB-1', building_id: 'BLD-F-F5', owner_org_id: bOf('BLD-F-F5').org_id, timestamp: `${addDays(today, -32)}T10:12:00.000Z`, status: 'Registered', notes: '60–100k sq ft GCC expansion' },
    { log_id: 'BRK-002', occupier_id: occupierId('AYG'), broker_org_id: 'ENB-2', building_id: 'BLD-F-F5', owner_org_id: bOf('BLD-F-F5').org_id, timestamp: `${addDays(today, -18)}T15:40:00.000Z`, status: 'Duplicate', notes: 'Same requirement; Crestline registered first' },
    { log_id: 'BRK-003', occupier_id: occupierId('TYT'), broker_org_id: 'ENB-1', building_id: 'BLD-D-D6', owner_org_id: bOf('BLD-D-D6').org_id, timestamp: `${addDays(today, -9)}T09:05:00.000Z`, status: 'Registered', notes: 'Looking for 2 warm-shell floors' },
    { log_id: 'BRK-004', occupier_id: occupierId('WNU'), broker_org_id: 'ENB-1', building_id: 'BLD-E-E9', owner_org_id: bOf('BLD-E-E9').org_id, timestamp: `${addDays(today, -200)}T11:00:00.000Z`, status: 'Expired', notes: 'Registration lapsed after 180 days' },
  ]

  // ---------------------------------------------------------------- documents, certifications, title chain
  const documents: BuildingDocument[] = []
  const certifications: Certification[] = []
  const ownership_history: OwnershipHistory[] = []
  for (const b of buildings) {
    const r = rng(`${b.building_id}-docs`)
    const p = parks.find((x) => `CMP-${x.parkId}` === b.campus_id)!
    const types = b.status === 'Pre-OC' ? ['RERA certificate', 'Title document', 'Building Insurance'] : DOC_TYPES.filter(() => r.chance(0.8))
    types.forEach((type, i) => {
      const roll = r.next()
      const validity = type === 'Title document' || type === 'OC' ? null : roll < 0.08 ? addDays(today, -r.int(5, 120)) : roll < 0.2 ? addDays(today, r.int(10, 85)) : addDays(today, r.int(120, 1100))
      documents.push({
        doc_id: `DOC-${b.building_id.slice(4)}-${i + 1}`,
        org_id: b.org_id,
        building_id: b.building_id,
        type,
        file_ref: `${b.name.replace(/[^A-Za-z0-9]+/g, '_')}_${type.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`,
        validity,
        sharing_scope: type === 'OC' || type === 'Fire NOC' || type === 'RERA certificate' ? 'Shared with prospects' : type === 'Title document' ? 'Private (owner + AA)' : 'Private (owner + AA)',
        reminder_lead: type === 'Fire NOC' || type === 'Building Insurance' ? '3 months' : '30 days',
      })
    })
    if (p.certification && b.status === 'Active') {
      certifications.push({ cert_id: `CRT-${b.building_id.slice(4)}`, org_id: b.org_id, building_id: b.building_id, scheme: 'LEED', level: /gold/i.test(p.certification) ? 'Gold' : 'Certified', validity: addDays(today, r.int(-30, 900)) })
    }
    if (b.status === 'Active' && r.chance(0.3)) {
      certifications.push({ cert_id: `CRT-${b.building_id.slice(4)}-I`, org_id: b.org_id, building_id: b.building_id, scheme: 'IGBC', level: 'Platinum', validity: addDays(today, r.int(60, 1200)) })
    }
    const owner = owners.find((o) => o.owner_id === b.owner_id)!.name
    ownership_history.push(
      { history_id: `TTL-${b.building_id.slice(4)}-1`, org_id: b.org_id, building_id: b.building_id, floor_id: null, unit_id: null, owner_name: 'State Industrial Development Board', ownership_pct: 100, event_type: 'Grant', from_date: '2004-04-01', to_date: '2009-03-31', encumbrance: null },
      { history_id: `TTL-${b.building_id.slice(4)}-2`, org_id: b.org_id, building_id: b.building_id, floor_id: null, unit_id: null, owner_name: owner, ownership_pct: 100, event_type: 'Sale', from_date: '2009-04-01', to_date: null, encumbrance: null },
    )
    if (r.chance(0.35)) {
      ownership_history.push({ history_id: `TTL-${b.building_id.slice(4)}-3`, org_id: b.org_id, building_id: b.building_id, floor_id: null, unit_id: null, owner_name: 'Bank A (lender)', ownership_pct: null, event_type: 'Mortgage', from_date: addDays(today, -r.int(300, 1500)), to_date: null, encumbrance: `Term loan of ₹${r.int(80, 400)} Cr secured on land and building` })
    }
  }

  // ---------------------------------------------------------------- contacts, strata, committee
  const owner_contacts: OwnerContact[] = [
    { contact_id: 'CON-1', org_id: 'OWN-1', owner_id: 'OWNR-1', building_id: null, name: 'Meera Kapoor', email: 'northstar@owner.com', phone: '+91 98860 20001', role: 'Primary contact', unit: null, area: null, ownership_pct: null, is_primary: true, signed_mandate: false },
    { contact_id: 'CON-2', org_id: 'OWN-1', owner_id: 'OWNR-1', building_id: null, name: 'Arjun Menon', email: 'arjun.menon@northstar.example', phone: '+91 98860 20002', role: 'Representative', unit: null, area: null, ownership_pct: null, is_primary: false, signed_mandate: false },
    { contact_id: 'CON-3', org_id: 'OWN-2', owner_id: 'OWNR-2', building_id: null, name: 'Rahul Desai', email: 'meridian@owner.com', phone: '+91 99000 30001', role: 'Primary contact', unit: null, area: null, ownership_pct: null, is_primary: true, signed_mandate: false },
    { contact_id: 'CON-4', org_id: 'OWN-3', owner_id: 'OWNR-3', building_id: null, name: 'Kavya Reddy', email: 'trinity@owner.com', phone: '+91 97400 40001', role: 'Primary contact', unit: null, area: null, ownership_pct: null, is_primary: true, signed_mandate: false },
  ]
  const strata = [
    ['Sunrise Family Trust', 'Floors 1–3', 30],
    ['K. Venkatesh', 'Floor 4', 12],
    ['Orbit Investments LLP', 'Floors 5–7', 28],
    ['P. Shah & Co.', 'Floor 8', 10],
    ['Northstar Estates', 'Floors 9–10', 20],
  ] as const
  const d2Area = buildings.find((b) => b.building_id === 'BLD-D-D2')?.total_area ?? 200000
  strata.forEach(([name, unit, pct], i) =>
    owner_contacts.push({ contact_id: `CON-S${i + 1}`, org_id: 'OWN-1', owner_id: 'OWNR-1', building_id: 'BLD-D-D2', name, email: null, phone: null, role: 'Strata unit owner', unit, area: Math.round((d2Area * pct) / 100), ownership_pct: pct, is_primary: false, signed_mandate: i !== 1 && i !== 3 }),
  )
  ;['Rahul Desai', 'Ishaan Verma (Lakeshore Capital)', 'Neha Joshi'].forEach((name, i) =>
    owner_contacts.push({ contact_id: `CON-C${i + 1}`, org_id: 'OWN-2', owner_id: 'OWNR-2', building_id: 'BLD-E-E1', name, email: null, phone: null, role: 'Committee member', unit: null, area: null, ownership_pct: null, is_primary: i === 0, signed_mandate: false }),
  )

  const campus_amenities: CampusAmenity[] = []
  for (const c of campuses.filter((x) => x.org_id === 'OWN-1' && x.development_status === 'Operational')) {
    ;(['Food court', 'Crèche', 'Gym', 'Conference'] as const).forEach((type, i) =>
      campus_amenities.push({ amenity_id: `CAM-${c.campus_id.slice(4)}-${i + 1}`, org_id: c.org_id, campus_id: c.campus_id, type, capacity: [1200, 80, 150, 300][i], notes: null }),
    )
  }
  const building_amenities: BuildingAmenity[] = buildings
    .filter((b) => b.status === 'Active' && rng(`${b.building_id}-am`).chance(0.5))
    .map((b, i) => ({ amenity_id: `BAM-${String(i + 1).padStart(3, '0')}`, org_id: b.org_id, building_id: b.building_id, type: 'Cafeteria', capacity: 250, notes: 'Ground floor, vendor-run' }))

  const document_shares: DocumentShare[] = [
    { share_id: 'SHR-001', org_id: 'OWN-1', building_id: 'BLD-A-A1', scope: 'Single document', doc_id: documents.find((d) => d.building_id === 'BLD-A-A1')?.doc_id ?? null, category: null, email: 'counsel@lawfirm.example', access: 'View only', expires_at: addDays(today, 21), status: 'Active' },
    { share_id: 'SHR-002', org_id: 'OWN-1', building_id: 'BLD-A-A3', scope: 'Category', doc_id: null, category: 'Fire NOC', email: 'auditor@safety.example', access: 'Comment', expires_at: addDays(today, 60), status: 'Active' },
    { share_id: 'SHR-003', org_id: 'OWN-2', building_id: null, scope: 'Building folder', doc_id: null, category: null, email: 'diligence@fund.example', access: 'View only', expires_at: addDays(today, -4), status: 'Active' },
  ]

  return {
    campuses, owners, buildings, floors, units, building_amenities, campus_amenities, images: [], documents, certifications,
    ownership_history, owner_contacts, document_shares,
    occupiers, leases, lease_spaces: spaces, renewals, lease_docs, rent_invoices, broker_log, relationship_log,
  }
}
