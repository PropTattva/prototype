// Phase 4 seed: mandates, vendors, assessments, target lists, the v6 BD pipeline, and parking.
// Built on top of the asset seed so bays, mandates and assessments attach to real buildings and leases.
// All names here are fictional SAMPLE data (the v6 demo's real brand names are not reused on the public site).
import type { createAssetSeed } from './seedAssets'
import type { AccessRequest, AssessmentCriterion, BuildingAssessment, Mandate, Opportunity, PricingInputs, TargetOccupier, Vendor } from '../domain/mandates'
import type { Bay, ParkingRate } from '../domain/parking'
import { ASSESSMENT_TEMPLATE, assessmentScore, gradeBand } from '../lib/assessment'
import { addDays, addMonths, todayIso } from '../lib/dates'
import { priceModel } from '../lib/pricing'
import { suggestSwot } from '../lib/swot'

type Assets = ReturnType<typeof createAssetSeed>

const EMPTY_SWOT = { strengths: [], weaknesses: [], opportunities: [], threats: [] }

export function createMandateSeed(a: Assets) {
  const today = todayIso()
  const iso = (d: number) => `${addDays(today, d)}T10:00:00.000Z`

  // ---------------------------------------------------------------- vendors
  const vendors: Vendor[] = [
    { vendor_id: 'VEN-1', type: 'Other', name: 'Keystone Leasing Partners', contact: 'deals@keystone.example', scope: 'External leasing agency — exclusive on assigned floors' },
    { vendor_id: 'VEN-2', type: 'Marketing agency', name: 'Brightline Media', contact: 'studio@brightline.example', scope: 'Brochures, broker events and digital campaign' },
    { vendor_id: 'VEN-3', type: 'Campus management', name: 'Northstar Facility Services', contact: 'fm@northstar.example', scope: 'Common-area control, security, housekeeping' },
    { vendor_id: 'VEN-4', type: 'Tech vendor', name: 'SpaceIQ Analytics', contact: 'hello@spaceiq.example', scope: 'Occupancy sensors and utilisation reports' },
  ]

  // ---------------------------------------------------------------- mandates
  const askOf = (bid: string) => {
    const xs = a.floors.filter((f) => f.building_id === bid && f.asking_rent != null).map((f) => f.asking_rent!)
    return xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 100
  }
  const plan: { campus?: string; building?: string; exec: Mandate['exec_mode']; vendor: string | null; status: Mandate['status'] }[] = [
    { campus: 'CMP-E', exec: 'AA team', vendor: null, status: 'Active' },
    { campus: 'CMP-F', exec: 'Hybrid', vendor: 'VEN-2', status: 'Active' },
    { building: 'BLD-D-D6', exec: 'External agency', vendor: 'VEN-1', status: 'Active' },
    { building: 'BLD-A-A1', exec: 'Internal (owner team)', vendor: null, status: 'Active' },
    { building: 'BLD-C-C1', exec: 'AA team', vendor: null, status: 'Expired' },
  ]
  const mandates: Mandate[] = []
  for (const p of plan) {
    const bs = a.buildings.filter((b) => (p.campus ? b.campus_id === p.campus : b.building_id === p.building))
    for (const b of bs) {
      mandates.push({
        mandate_id: `MND-${String(mandates.length + 1).padStart(3, '0')}`,
        org_id: b.org_id,
        building_id: b.building_id,
        status: p.status,
        exec_mode: p.exec,
        vendor_id: p.vendor,
        threshold_noi: Math.round(askOf(b.building_id) * 0.85),
        pricing_model: { versions: [] },
        swot: EMPTY_SWOT,
        start: p.status === 'Expired' ? addDays(today, -500) : addDays(today, -150),
        expiry: p.status === 'Expired' ? addDays(today, -40) : addDays(today, 215),
      })
    }
  }

  // Market median for a micro-market from active leases (what the comparables page shows).
  const median = (mm: string) => {
    const xs = a.leases.filter((l) => l.rent != null && a.buildings.find((b) => b.building_id === l.building_id)?.micro_market === mm).map((l) => l.rent!).sort((x, y) => x - y)
    return xs.length ? xs[Math.floor(xs.length / 2)] : null
  }

  for (const id of ['BLD-E-E1', 'BLD-F-F1']) {
    const m = mandates.find((x) => x.building_id === id)
    const b = a.buildings.find((x) => x.building_id === id)
    if (!m || !b) continue
    const certs = a.certifications.filter((c) => c.building_id === id).map((c) => `${c.scheme} ${c.level ?? ''}`.trim())
    m.swot = suggestSwot(b, a.floors.filter((f) => f.building_id === id), a.leases.filter((l) => l.building_id === id), median(b.micro_market), certs)
    const base: PricingInputs = {
      market_rent: median(b.micro_market) ?? 110, grade_adj_pct: 5, floor_plate_adj_pct: 3, vacancy_adj_pct: -4, fitout_adj_pct: 0,
      rent_free_months: 4, ti_per_sqft: 150, escalation_pct: 5, cam: 18, parking_per_slot: 4500, term_years: 9, threshold_noi: m.threshold_noi ?? 90,
    }
    const v2 = { ...base, vacancy_adj_pct: -2, rent_free_months: 3 }
    m.pricing_model.versions = [
      { version: 1, created_at: iso(-60), created_by: 'U-AA-1', inputs: base, output: priceModel(base), note: 'Initial pricing at mandate signing' },
      { version: 2, created_at: iso(-12), created_by: 'U-AA-1', inputs: v2, output: priceModel(v2), note: 'Absorption improved; trimmed rent-free' },
    ]
  }

  // ---------------------------------------------------------------- assessments (33-item audit → score → grade)
  const assessments: BuildingAssessment[] = []
  const assessment_criteria: AssessmentCriterion[] = []
  const scoreFor = (seed: number, i: number) => Math.max(3, Math.min(10, 6 + ((seed * (i + 3)) % 5)))
  const addAssessment = (bid: string, seed: number, completed: boolean, daysAgo: number) => {
    const b = a.buildings.find((x) => x.building_id === bid)
    if (!b) return
    const id = `ASM-${String(assessments.length + 1).padStart(3, '0')}`
    const rows = ASSESSMENT_TEMPLATE.map((t, i) => ({
      criterion_id: `${id}-${String(i + 1).padStart(2, '0')}`,
      org_id: b.org_id,
      assessment_id: id,
      criterion_name: t.name,
      category: t.category,
      weight: t.weight,
      score: completed || i < 18 ? scoreFor(seed, i) : null,
    }))
    assessment_criteria.push(...rows)
    const score = assessmentScore(rows)
    assessments.push({
      assessment_id: id,
      org_id: b.org_id,
      building_id: bid,
      assessment_date: addDays(today, -daysAgo),
      assessor: 'Ananya Rao',
      total_score: completed ? score : null,
      grade: completed ? gradeBand(score) : null,
      status: completed ? 'Completed' : 'Draft',
      audit_due: addDays(today, -daysAgo + 14),
    })
    if (completed) {
      b.grade = gradeBand(score)
      b.grade_source = 'AA scorecard'
      b.grade_assessed_at = `${addDays(today, -daysAgo + 10)}T12:00:00.000Z`
    }
  }
  addAssessment('BLD-E-E1', 7, true, 90)
  addAssessment('BLD-F-F1', 3, true, 70)
  addAssessment('BLD-F-F2', 5, false, 8)

  // ---------------------------------------------------------------- target occupiers (AA-only)
  const occ = (name: string) => a.occupiers.find((o) => o.name === name)?.occupier_id
  const e1 = mandates.find((m) => m.building_id === 'BLD-E-E1')!
  const targets: [string, TargetOccupier['status'], TargetOccupier['source'], string][] = [
    ['TYT', 'Contacted', 'AA research', 'Consolidating two campuses; 80–100k sq ft'],
    ['AYG', 'Accepted', 'Auto-suggested', 'GCC expansion; site visit scheduled'],
    ['WNU', 'Identified', 'AA research', 'Lease at Park A expires next year'],
    ['DDC', 'Identified', 'Auto-suggested', 'Sector fit: BFSI cluster in the micro-market'],
    ['FFN', 'Rejected', 'Auto-suggested', 'Committed to a build-to-suit elsewhere'],
  ]
  const target_occupiers: TargetOccupier[] = targets
    .filter(([n]) => occ(n))
    .map(([n, status, source, notes], i) => ({ list_id: `TGT-${i + 1}`, org_id: e1.org_id, building_id: e1.building_id, mandate_id: e1.mandate_id, occupier_ref: occ(n)!, status, source, notes }))

  // ---------------------------------------------------------------- v6 BD pipeline (fictional accounts)
  const o = (id: string, account: string, owner: string | null, team: Opportunity['team'], stage: Opportunity['stage'], deal: Opportunity['deal_type'], lakh: number, prob: number | null, days: number, notes: string): Opportunity => ({
    opp_id: id, account_name: account, owner_user_id: owner, co_owners: [], team, stage, deal_type: deal, potential_lakh: lakh, probability: prob, last_activity: iso(-days), notes,
  })
  const opportunities: Opportunity[] = [
    o('OPP-01', 'Kestrel Retail Tech', 'U-AA-1', 'N8', 'Prospect', 'Relocation', 35, 20, 3, 'HQ relocation, 120k sq ft'),
    o('OPP-02', 'Northwind Analytics', 'U-AA-1', 'N8', 'Prospect', 'Expansion', 50, 25, 9, 'Bengaluru expansion'),
    o('OPP-03', 'Lumen Design Studio', 'U-AA-1', 'N8', 'Prospect', 'New office', 28, 15, 14, 'Office consolidation'),
    o('OPP-04', 'Bluepeak Bank GCC', 'U-AA-1', 'N8', 'Qualified', 'Expansion', 45, 50, 2, 'GCC expansion — hot'),
    o('OPP-05', 'Tideway Energy Trading', 'U-AA-1', 'N8', 'Qualified', 'New office', 32, 40, 6, 'Two-city setup'),
    o('OPP-06', 'Sterling Harbour Bank', 'U-AA-1', 'N8', 'Proposal', 'New office', 30, 85, 1, 'Bengaluru GCC — proposal sent'),
    o('OPP-07', 'Acme GCC India', 'U-AA-1', 'N8', 'Won', 'Expansion', 65, 100, 20, '4-city portfolio — signed'),
    o('OPP-08', 'Orion Search India', 'U-AA-2', 'AA', 'Proposal', 'Expansion', 90, 60, 4, 'Large campus requirement'),
    o('OPP-09', 'Helix Pharma GCC', 'U-AA-2', 'AA', 'Negotiation', 'Relocation', 55, 70, 2, 'Negotiating fit-out contribution'),
    o('OPP-10', 'Vantage Mobility', 'U-AA-2', 'AA', 'Qualified', 'New office', 25, 35, 15, 'EV R&D centre'),
    o('OPP-11', 'Quill Learning', null, 'AA', 'Prospect', 'Renewal', 18, null, 125, 'Released after 120 days of inactivity'),
  ]
  const access_requests: AccessRequest[] = [
    { request_id: 'ACR-1', opp_id: 'OPP-04', requester_id: 'U-AA-2', status: 'Pending', created_at: iso(-1), escalate_at: iso(1) },
  ]

  // ---------------------------------------------------------------- parking: bays, allocation, rates
  const bays: Bay[] = []
  const parking_rates: ParkingRate[] = []
  const ownersWithParking = new Set(['OWN-1', 'OWN-2'])
  for (const b of a.buildings.filter((x) => ownersWithParking.has(x.org_id))) {
    const pFloors = a.floors.filter((f) => f.building_id === b.building_id && f.floor_use === 'Parking')
    if (!pFloors.length) continue
    for (const f of pFloors) {
      const level: Bay['level'] = /^B\d$/.test(f.floor_no) ? (f.floor_no as Bay['level']) : f.floor_no === 'G' ? 'Ground' : 'Upper'
      const code = level === 'Upper' ? `P${f.floor_no}` : level === 'Ground' ? 'G' : f.floor_no
      const wing = f.wing ? f.wing.replace('Wing ', '') : ''
      for (let n = 1; n <= 24; n++) {
        bays.push({
          bay_id: `BAY-${b.building_id.slice(4)}-${code}${wing}-${n}`,
          org_id: b.org_id,
          building_id: b.building_id,
          bay_label: `${code}${wing}-${String(n).padStart(2, '0')}`,
          level,
          type: n <= 2 ? 'EV' : n <= 4 ? 'Visitor' : 'Covered',
          rate: null,
          status: n <= 4 && n > 2 ? 'Reserved' : 'Available',
          lease_id: null,
        })
      }
    }
    // E6-S05/S06: allocate bays to leases in proportion to area, never beyond the building's inventory.
    const own = bays.filter((x) => x.building_id === b.building_id && x.type !== 'Visitor')
    const ls = a.leases.filter((l) => l.building_id === b.building_id && l.status === 'Active')
    const total = ls.reduce((s, l) => s + l.area, 0)
    let next = 0
    for (const l of ls) {
      const slots = total ? Math.floor(((own.length * 0.85) * l.area) / total) : 0
      l.parking_slots = slots
      for (let k = 0; k < slots && next < own.length; k++, next++) {
        own[next].status = 'Allocated'
        own[next].lease_id = l.lease_id
      }
    }
    const rates: [ParkingRate['slot_type'], number][] = [['Covered', 4500], ['Open', 2500], ['EV', 6500], ['Visitor', 0]]
    rates.forEach(([slot_type, rate], i) =>
      parking_rates.push({ rate_id: `PRK-${b.building_id.slice(4)}-${i + 1}`, org_id: b.org_id, building_id: b.building_id, slot_type, rate, effective_from: addMonths(today, -14), escalation_pct: 5, escalation_freq: 'Annual' }),
    )
    if (b.building_id === 'BLD-A-A1') {
      parking_rates.push({ rate_id: 'PRK-A-A1-NEXT', org_id: b.org_id, building_id: b.building_id, slot_type: 'Covered', rate: 4800, effective_from: addMonths(today, 2), escalation_pct: 5, escalation_freq: 'Annual' })
    }
  }

  return { mandates, vendors, target_occupiers, assessments, assessment_criteria, opportunities, access_requests, bays, parking_rates }
}
