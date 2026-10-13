// Mandate & GTM (E5), BD pipeline (v6) and parking (E6) entity definitions.
import type { PlatformDb } from '../domain/platform'
import { buildingName, buildingOptions, leaseOptions, occupierName, occupierOptions, plural, shortId } from './helpers'
import type { EntityDef, EntityKey, OptionCtx, Rec } from './types'

export const EXEC_MODES = ['Internal (owner team)', 'AA team', 'External agency', 'Hybrid'] as const
export const OPP_STAGES = ['Prospect', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'] as const
const FREQ = ['Annual', 'Biennial', 'Every 3 years']

const inheritFromBuilding = (d: Rec, db: PlatformDb) => {
  const b = db.buildings.find((x) => x.building_id === d.building_id)
  if (b) d.org_id = b.org_id
}
const directoryOptions = (ctx: OptionCtx) =>
  (ctx.directory.length ? ctx.directory : ctx.buildings).map((b) => ({ value: b.building_id, label: b.name, group: ctx.organisations.find((o) => o.org_id === b.org_id)?.name ?? 'Owner' }))
const directoryName = (ctx: OptionCtx, id: string) => ctx.directory.find((b) => b.building_id === id)?.name ?? buildingName(ctx, id)

const mandate: EntityDef = {
  key: 'mandate',
  name: 'Mandate',
  label: 'Mandate',
  plural: 'Mandates',
  idKey: 'mandate_id',
  capability: 'mandates',
  orgKey: 'org_id',
  scopeVia: 'building',
  title: (r, ctx) => `Mandate — ${directoryName(ctx, r.building_id)}`,
  subtitle: (r) => `${r.status} · ${r.exec_mode}`,
  fields: [
    { key: 'building_id', label: 'Building', type: 'ref', options: (_d, ctx) => directoryOptions(ctx), required: true, createOnly: true, column: true },
    { key: 'status', label: 'Status', type: 'enum', options: ['Active', 'Expired', 'Terminated'], required: true, column: true, help: 'Only an active mandate lets AA act on the building (E5-S01).' },
    { key: 'exec_mode', label: 'Leasing executed by', type: 'enum', options: EXEC_MODES, required: true, column: true, help: 'Internal: AA has no access · External agency: AA read-only · AA team / Hybrid: AA can act (E5-S02).' },
    { key: 'vendor_id', label: 'Vendor', type: 'ref', options: (_d, ctx) => ctx.vendors.map((v) => ({ value: v.vendor_id, label: v.name, group: v.type })), showIf: (d) => d.exec_mode === 'External agency' || d.exec_mode === 'Hybrid', column: true },
    { key: 'threshold_noi', label: 'Threshold NOI', type: 'money', unit: '₹/sq ft/mo', visibility: 'owner', column: true, help: 'Set by the owner: no success fee below this rent (E2-S02).' },
    { key: 'start', label: 'Start', type: 'date', required: true, column: true },
    { key: 'expiry', label: 'Expiry', type: 'date', required: true, column: true },
    { key: 'swot', label: 'SWOT', type: 'json', system: true, visibility: 'aa', hideInDetail: true },
    { key: 'pricing_model', label: 'Pricing model', type: 'json', system: true, visibility: 'aa', hideInDetail: true },
    { key: 'mandate_id', label: 'Mandate ID', type: 'text', system: true },
  ],
  filters: ['status', 'exec_mode'],
  searchKeys: ['mandate_id'],
  newId: () => shortId('MND'),
  defaults: () => ({ status: 'Active', exec_mode: 'AA team', start: new Date().toISOString().slice(0, 10) }),
  validate: (d, db, _m, orig) => {
    const e: Record<string, string> = {}
    if (d.start && d.expiry && d.expiry <= d.start) e.expiry = 'Expiry must be after the start date.'
    if (d.exec_mode === 'External agency' && !d.vendor_id) e.vendor_id = 'Link the external agency running the leasing.'
    const clash = db.mandates.find((m) => m.building_id === d.building_id && m.status === 'Active' && m.mandate_id !== orig?.mandate_id)
    if (clash && d.status === 'Active') e.building_id = 'This building already has an active mandate.'
    return e
  },
  derive: (d, db, mode) => {
    inheritFromBuilding(d, db)
    if (d.exec_mode !== 'External agency' && d.exec_mode !== 'Hybrid') d.vendor_id = null
    if (mode === 'create') {
      d.swot = { strengths: [], weaknesses: [], opportunities: [], threats: [] }
      d.pricing_model = { versions: [] }
    }
  },
  related: [{ entity: 'targetOccupier', foreignKey: 'mandate_id', title: 'Target occupiers' }],
}

const vendor: EntityDef = {
  key: 'vendor',
  name: 'Vendor',
  label: 'Vendor',
  plural: 'Vendors',
  idKey: 'vendor_id',
  capability: 'vendors',
  orgKey: null,
  title: (r) => r.name,
  subtitle: (r) => r.type,
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, column: true },
    { key: 'type', label: 'Type', type: 'enum', options: ['Marketing agency', 'Campus management', 'Tech vendor', 'Other'], required: true, column: true },
    { key: 'contact', label: 'Contact', type: 'text', column: true },
    { key: 'scope', label: 'Scope of work', type: 'textarea', column: true },
  ],
  filters: ['type'],
  searchKeys: ['name', 'scope'],
  unique: ['name'],
  newId: () => shortId('VEN'),
  defaults: () => ({ type: 'Marketing agency' }),
  blockers: (r, db) => {
    const n = db.mandates.filter((m) => m.vendor_id === r.vendor_id).length
    return n ? [plural(n, 'mandate')] : []
  },
}

const targetOccupier: EntityDef = {
  key: 'targetOccupier',
  name: 'TargetOccupierList',
  label: 'Target occupier',
  plural: 'Target occupiers',
  idKey: 'list_id',
  capability: 'aa_only',
  orgKey: 'org_id',
  scopeVia: 'building',
  title: (r, ctx) => occupierName(ctx, r.occupier_ref),
  subtitle: (r, ctx) => `${buildingName(ctx, r.building_id)} · ${r.status}`,
  fields: [
    { key: 'occupier_ref', label: 'Occupier', type: 'ref', options: (_d, ctx) => occupierOptions(ctx), required: true, column: true },
    { key: 'building_id', label: 'Building', type: 'ref', options: (_d, ctx) => buildingOptions(ctx), required: true, createOnly: true, column: true },
    { key: 'status', label: 'Status', type: 'enum', options: ['Identified', 'Contacted', 'Accepted', 'Rejected'], required: true, column: true },
    { key: 'source', label: 'Source', type: 'enum', options: ['AA research', 'Auto-suggested'], system: true, column: true },
    { key: 'notes', label: 'Notes', type: 'textarea', column: true },
    { key: 'mandate_id', label: 'Mandate', type: 'text', system: true },
  ],
  filters: ['status', 'source', 'building_id'],
  searchKeys: ['notes'],
  newId: () => shortId('TGT'),
  defaults: () => ({ status: 'Identified' }),
  validate: (d, db, _m, orig) =>
    db.target_occupiers.some((t) => t.building_id === d.building_id && t.occupier_ref === d.occupier_ref && t.list_id !== orig?.list_id)
      ? { occupier_ref: 'Already on this building’s target list.' }
      : {},
  derive: (d, db, mode) => {
    inheritFromBuilding(d, db)
    if (mode === 'create') {
      d.source = d.source ?? 'AA research'
      d.mandate_id = db.mandates.find((m) => m.building_id === d.building_id && m.status === 'Active')?.mandate_id ?? null
    }
  },
}

const assessment: EntityDef = {
  key: 'assessment',
  name: 'BuildingAssessment',
  label: 'Assessment',
  plural: 'Assessments',
  idKey: 'assessment_id',
  capability: 'aa_only',
  orgKey: 'org_id',
  scopeVia: 'building',
  title: (r, ctx) => `Assessment — ${buildingName(ctx, r.building_id)}`,
  subtitle: (r) => `${r.status} · ${r.assessment_date}`,
  fields: [
    { key: 'building_id', label: 'Building', type: 'ref', options: (_d, ctx) => buildingOptions(ctx), required: true, createOnly: true, column: true },
    { key: 'assessment_date', label: 'Audit started', type: 'date', required: true, column: true },
    { key: 'assessor', label: 'Assessor', type: 'text', required: true, column: true },
    { key: 'audit_due', label: 'Audit window closes', type: 'date', system: true, column: true },
    { key: 'total_score', label: 'Score', type: 'decimal', system: true, column: true, unit: '/ 100' },
    { key: 'grade', label: 'Grade', type: 'enum', options: ['A+', 'A', 'B', 'C'], system: true, column: true },
    { key: 'status', label: 'Status', type: 'enum', options: ['Draft', 'Completed'], system: true, column: true },
  ],
  filters: ['status', 'grade'],
  searchKeys: ['assessor'],
  newId: () => shortId('ASM'),
  derive: inheritFromBuilding,
  blockers: (r) => (r.status === 'Completed' ? ['a completed scorecard (it set the building grade)'] : []),
}

const assessmentCriterion: EntityDef = {
  key: 'assessmentCriterion',
  name: 'AssessmentCriterion',
  label: 'Criterion',
  plural: 'Criteria',
  idKey: 'criterion_id',
  capability: 'aa_only',
  orgKey: 'org_id',
  scopeVia: 'assessment',
  title: (r) => r.criterion_name,
  fields: [
    { key: 'criterion_name', label: 'Criterion', type: 'text', required: true, column: true },
    { key: 'category', label: 'Category', type: 'enum', options: ['NBC', 'LEED', 'WELL', 'Structural', 'MEP', 'Amenity', 'Other'], required: true, column: true },
    { key: 'weight', label: 'Weight', type: 'decimal', required: true, column: true },
    { key: 'score', label: 'Score (0–10)', type: 'decimal', column: true },
  ],
  searchKeys: ['criterion_name'],
  newId: () => shortId('CRI'),
  validate: (d) => (d.score != null && (d.score < 0 || d.score > 10) ? { score: 'Score 0–10.' } : {}),
}

const opportunity: EntityDef = {
  key: 'opportunity',
  name: 'Opportunity',
  label: 'Opportunity',
  plural: 'Opportunities',
  idKey: 'opp_id',
  capability: 'bd',
  orgKey: null,
  title: (r) => r.account_name,
  subtitle: (r) => `${r.team} · ${r.stage}`,
  fields: [
    { key: 'account_name', label: 'Company', type: 'text', required: true, column: true },
    { key: 'stage', label: 'Stage', type: 'enum', options: OPP_STAGES, required: true, column: true },
    { key: 'deal_type', label: 'Deal type', type: 'enum', options: ['New office', 'Expansion', 'Renewal', 'Relocation'], required: true, column: true },
    { key: 'team', label: 'Team', type: 'enum', options: ['AA', 'N8'], required: true, column: true },
    { key: 'potential_lakh', label: 'Mandate potential', type: 'decimal', unit: '₹ L', column: true },
    { key: 'probability', label: 'Probability', type: 'percent', column: true },
    { key: 'owner_user_id', label: 'BD owner', type: 'ref', options: (_d, ctx) => ctx.users.filter((u) => u.org_id === 'ORG-PT').map((u) => ({ value: u.user_id, label: u.name })), adminOnly: true, column: true },
    { key: 'last_activity', label: 'Last activity', type: 'datetime', system: true, column: true },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  filters: ['stage', 'team'],
  searchKeys: ['account_name', 'notes'],
  newId: () => shortId('OPP'),
  defaults: () => ({ stage: 'Prospect', deal_type: 'New office', team: 'AA', co_owners: [] }),
  derive: (d, _db, mode) => {
    d.last_activity = new Date().toISOString()
    if (mode === 'create') d.co_owners = d.co_owners ?? []
  },
}

const bayLeaseOptions = (d: Rec, ctx: OptionCtx) => leaseOptions({ ...ctx, leases: ctx.leases.filter((l) => l.building_id === d.building_id && l.status === 'Active') })

const bay: EntityDef = {
  key: 'bay',
  name: 'Bay',
  label: 'Bay',
  plural: 'Bays',
  idKey: 'bay_id',
  capability: 'buildings',
  orgKey: 'org_id',
  scopeVia: 'building',
  feature: 'parking',
  title: (r) => `Bay ${r.bay_label}`,
  subtitle: (r, ctx) => `${r.level} · ${r.type} · ${buildingName(ctx, r.building_id)}`,
  fields: [
    { key: 'building_id', label: 'Building', type: 'ref', options: (_d, ctx) => buildingOptions(ctx), required: true, createOnly: true, column: true },
    { key: 'bay_label', label: 'Bay ID', type: 'text', required: true, column: true, placeholder: 'B1-014' },
    { key: 'level', label: 'Level', type: 'enum', options: ['B1', 'B2', 'B3', 'Ground', 'Upper'], required: true, column: true },
    { key: 'type', label: 'Type', type: 'enum', options: ['Covered', 'Open', 'EV', 'Visitor'], required: true, column: true },
    { key: 'rate', label: 'Rate override', type: 'money', unit: '₹/slot/mo', visibility: 'owner', help: 'Blank = the building rate for this slot type.' },
    { key: 'status', label: 'Status', type: 'enum', options: ['Available', 'Allocated', 'Reserved'], required: true, column: true },
    { key: 'lease_id', label: 'Allocated to lease', type: 'ref', options: bayLeaseOptions, showIf: (d) => d.status === 'Allocated', column: true },
  ],
  filters: ['level', 'type', 'status'],
  searchKeys: ['bay_label'],
  newId: () => shortId('BAY'),
  defaults: () => ({ level: 'B1', type: 'Covered', status: 'Available' }),
  validate: (d, db, _m, orig) => {
    const e: Record<string, string> = {}
    if (db.bays.some((b) => b.building_id === d.building_id && b.bay_label.toLowerCase() === String(d.bay_label ?? '').toLowerCase() && b.bay_id !== orig?.bay_id)) e.bay_label = 'This bay ID already exists in the building.'
    if (d.status === 'Allocated' && !d.lease_id) e.lease_id = 'Choose the lease this bay is allocated to.'
    const l = db.leases.find((x) => x.lease_id === d.lease_id)
    if (l && l.building_id !== d.building_id) e.lease_id = 'Lease must be in the same building.'
    if (l && d.lease_id !== orig?.lease_id) {
      const used = db.bays.filter((b) => b.lease_id === l.lease_id && b.bay_id !== orig?.bay_id).length
      if (used >= (l.parking_slots ?? 0)) e.lease_id = `This lease is entitled to ${l.parking_slots ?? 0} slots and already has ${used} bays (E6-S06).`
    }
    return e
  },
  derive: (d, db) => {
    inheritFromBuilding(d, db)
    if (d.status !== 'Allocated') d.lease_id = null
  },
}

const parkingRate: EntityDef = {
  key: 'parkingRate',
  name: 'ParkingRate',
  label: 'Parking rate',
  plural: 'Parking rates',
  idKey: 'rate_id',
  capability: 'buildings',
  orgKey: 'org_id',
  scopeVia: 'building',
  feature: 'parking',
  title: (r) => `${r.slot_type} — ₹${r.rate ?? '—'}/slot/mo`,
  subtitle: (r, ctx) => `${buildingName(ctx, r.building_id)} · from ${r.effective_from}`,
  fields: [
    { key: 'building_id', label: 'Building', type: 'ref', options: (_d, ctx) => buildingOptions(ctx), required: true, createOnly: true, column: true },
    { key: 'slot_type', label: 'Slot type', type: 'enum', options: ['Covered', 'Open', 'EV', 'Visitor'], required: true, column: true },
    { key: 'rate', label: 'Rate', type: 'money', unit: '₹/slot/mo', required: true, visibility: 'owner', column: true },
    { key: 'effective_from', label: 'Effective from', type: 'date', required: true, column: true },
    { key: 'escalation_pct', label: 'Escalation', type: 'percent', visibility: 'owner', column: true },
    { key: 'escalation_freq', label: 'Escalation frequency', type: 'enum', options: FREQ, visibility: 'owner', column: true },
  ],
  filters: ['slot_type'],
  searchKeys: ['slot_type'],
  newId: () => shortId('PRK'),
  defaults: () => ({ slot_type: 'Covered', effective_from: new Date().toISOString().slice(0, 10), escalation_pct: 5, escalation_freq: 'Annual' }),
  validate: (d, db, _m, orig) =>
    db.parking_rates.some((r) => r.building_id === d.building_id && r.slot_type === d.slot_type && r.effective_from === d.effective_from && r.rate_id !== orig?.rate_id)
      ? { effective_from: 'A rate for this slot type already starts on this date.' }
      : {},
  derive: inheritFromBuilding,
}

export const MANDATE_ENTITIES: Partial<Record<EntityKey, EntityDef>> = {
  mandate, vendor, targetOccupier, assessment, assessmentCriterion, opportunity, bay, parkingRate,
}
