// Leasing & occupier entity definitions (PRD §5, epics E2–E4).
import type { PlatformDb } from '../domain/platform'
import { todayIso } from '../lib/dates'
import { buildingName, buildingOptions, floorLabel, floorOptions, leaseLabel, leaseOptions, occupierName, occupierOptions, orgOptions, plural, shortId } from './helpers'
import type { EntityDef, EntityKey, OptionCtx, Rec } from './types'

const SOURCE_TAGS = ['Manual', 'PT-Verified', 'Propstack', 'Owner-Declared']
export const SECTORS = ['IT/ITeS', 'BFSI', 'Flex/Co-working', 'Consulting', 'Manufacturing', 'Pharma/Healthcare', 'EV/Mobility', 'Retail', 'Other']
export const RENEWAL_STAGES = ['Initiated', 'Negotiating', 'Agreed', 'Lost'] as const

const leaseField = { key: 'lease_id', label: 'Lease', type: 'ref' as const, options: (_d: Rec, ctx: OptionCtx) => leaseOptions(ctx), required: true, createOnly: true, column: true }
const inheritFromLease = (d: Rec, db: PlatformDb) => {
  const l = db.leases.find((x) => x.lease_id === d.lease_id)
  if (l) d.org_id = l.org_id
}

/**
 * Keep floor occupancy consistent with active leases (E4-S04): fully covered → Leased, partly → Partially leased,
 * no active lease → Vacant (vacancy clock starts today). Self-occupied and parking floors are left alone.
 */
export function syncFloorOccupancy(db: PlatformDb, floorIds: Iterable<string>) {
  const active = new Set(db.leases.filter((l) => l.status === 'Active').map((l) => l.lease_id))
  for (const id of new Set(floorIds)) {
    const f = db.floors.find((x) => x.floor_id === id)
    if (!f || f.floor_use === 'Parking' || f.occupancy_type === 'Self-occupied') continue
    const leased = db.lease_spaces.filter((s) => s.floor_id === id && active.has(s.lease_id)).reduce((sum, s) => sum + (s.area || 0), 0)
    const next = leased <= 0 ? 'Vacant' : f.chargeable_area && leased < f.chargeable_area * 0.98 ? 'Partially leased' : 'Leased'
    if (next === f.occupancy_type) continue
    f.occupancy_type = next
    if (next === 'Leased') {
      f.vacant_since = null
      f.handover_condition = null
      f.available_from = null
    } else if (!f.vacant_since) {
      f.vacant_since = todayIso()
    }
  }
}

const occupier: EntityDef = {
  key: 'occupier',
  name: 'Occupier',
  label: 'Occupier',
  plural: 'Occupiers',
  idKey: 'occupier_id',
  capability: 'occupiers',
  orgKey: null,
  title: (r) => r.name,
  subtitle: (r) => [r.tier, r.sector_tag, r.is_gcc && 'GCC', r.is_startup && 'Startup'].filter(Boolean).join(' · '),
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, column: true },
    { key: 'tier', label: 'Tier', type: 'enum', options: ['Tier 1', 'Tier 2', 'Tier 3'], column: true, help: 'Tier 1: large MNC or global GCC with a big footprint. Tier 2: established mid-size occupier. Tier 3: small occupier. Startups are at most Tier 2.' },
    { key: 'sector_tag', label: 'Sector', type: 'enum', options: SECTORS, required: true, column: true },
    { key: 'is_gcc', label: 'Captive GCC', type: 'bool', column: true },
    { key: 'is_startup', label: 'Startup', type: 'bool', column: true },
    { key: 'parent_company', label: 'Parent entity', type: 'text', column: true },
    { key: 'parent_country', label: 'Parent HQ country', type: 'text', column: true },
  ],
  filters: ['tier', 'sector_tag', 'parent_country'],
  searchKeys: ['name', 'parent_company'],
  unique: ['name'],
  newId: () => shortId('OC'),
  defaults: () => ({ sector_tag: 'IT/ITeS', is_gcc: false, is_startup: false }),
  related: [{ entity: 'lease', foreignKey: 'occupier_id', title: 'Leases' }],
  blockers: (r, db) => {
    const n = db.leases.filter((l) => l.occupier_id === r.occupier_id).length
    return n ? [plural(n, 'lease')] : []
  },
}

const ownerOnly = 'owner' as const

const lease: EntityDef = {
  key: 'lease',
  name: 'Lease',
  label: 'Lease',
  plural: 'Leases',
  idKey: 'lease_id',
  capability: 'leases',
  orgKey: 'org_id',
  scopeVia: 'building',
  feature: 'basic_leasing',
  title: (r, ctx) => occupierName(ctx, r.occupier_id),
  subtitle: (r, ctx) => `${buildingName(ctx, r.building_id)} · ${r.lease_id}`,
  fields: [
    { key: 'occupier_id', label: 'Occupier', type: 'ref', options: (_d, ctx) => occupierOptions(ctx), required: true, column: true },
    { key: 'building_id', label: 'Building', type: 'ref', options: (_d, ctx) => buildingOptions(ctx), required: true, createOnly: true, column: true },
    { key: 'floor_id', label: 'Primary floor', type: 'ref', options: (d, ctx) => floorOptions(ctx, d.building_id), required: true, createOnly: true },
    { key: 'area', label: 'Leased area', type: 'decimal', unit: 'sq ft', required: true, column: true },
    { key: 'rent', label: 'Rent', type: 'money', unit: '₹/sq ft/mo', visibility: ownerOnly, column: true },
    { key: 'CAM', label: 'CAM', type: 'money', unit: '₹/sq ft/mo', visibility: ownerOnly },
    { key: 'escalation_pct', label: 'Escalation', type: 'percent', visibility: ownerOnly },
    { key: 'escalation_freq', label: 'Escalation frequency', type: 'enum', options: ['Annual', 'Biennial', 'Every 3 years'], visibility: ownerOnly },
    { key: 'rent_free_months', label: 'Rent-free period', type: 'int', unit: 'months', visibility: ownerOnly },
    { key: 'rent_free_conditions', label: 'Rent-free conditions', type: 'textarea', visibility: ownerOnly, showIf: (d) => (d.rent_free_months ?? 0) > 0 },
    { key: 'TI_contribution', label: 'Fit-out / TI contribution', type: 'money', unit: '₹/sq ft', visibility: ownerOnly },
    { key: 'start', label: 'Start', type: 'date', required: true, column: true },
    { key: 'expiry', label: 'Expiry', type: 'date', required: true, column: true },
    { key: 'break_date', label: 'Break option', type: 'date', column: true },
    { key: 'deposit_months', label: 'Deposit basis', type: 'int', unit: 'months', visibility: ownerOnly },
    { key: 'deposit', label: 'Security deposit', type: 'money', unit: '₹', visibility: ownerOnly, help: 'Defaults to rent × area × months.' },
    { key: 'deposit_form', label: 'Deposit form', type: 'enum', options: ['Cash', 'Bank Guarantee'], visibility: ownerOnly },
    { key: 'deposit_received', label: 'Deposit received', type: 'bool', visibility: ownerOnly },
    { key: 'received_date', label: 'Received on', type: 'date', visibility: ownerOnly, showIf: (d) => !!d.deposit_received },
    { key: 'parking_slots', label: 'Parking slots', type: 'int' },
    { key: 'source_tag', label: 'Source', type: 'enum', options: SOURCE_TAGS, required: true, help: 'How confident is this rent record? (E2-S04)' },
    { key: 'status', label: 'Status', type: 'enum', options: ['Draft', 'Active', 'Expired', 'Terminated'], required: true, column: true, help: 'Expiring or terminating a lease frees its floors.' },
    { key: 'lease_id', label: 'Lease ID', type: 'text', system: true },
  ],
  filters: ['building_id', 'status'],
  searchKeys: ['lease_id'],
  newId: () => shortId('LSE'),
  defaults: () => ({ status: 'Active', source_tag: 'Owner-Declared', escalation_pct: 5, escalation_freq: 'Annual', deposit_months: 6, deposit_form: 'Cash', deposit_received: false, rent_free_months: 0 }),
  validate: (d, db) => {
    const e: Record<string, string> = {}
    if (d.start && d.expiry && d.expiry <= d.start) e.expiry = 'Expiry must be after the start date.'
    if (d.break_date && ((d.start && d.break_date <= d.start) || (d.expiry && d.break_date >= d.expiry))) e.break_date = 'Break date must fall between start and expiry.'
    if (d.area != null && d.area <= 0) e.area = 'Area must be more than zero.'
    if (d.deposit_received && !d.received_date) e.received_date = 'When was the deposit received? (E2-S10)'
    // E6-S06: parking entitlements across leases cannot exceed the building's bay inventory.
    const inventory = db.bays.filter((b) => b.building_id === d.building_id && b.type !== 'Visitor').length
    if (inventory && d.parking_slots) {
      const others = db.leases.filter((l) => l.building_id === d.building_id && l.status === 'Active' && l.lease_id !== d.lease_id).reduce((s, l) => s + (l.parking_slots ?? 0), 0)
      if (others + d.parking_slots > inventory)
        e.parking_slots = `Only ${Math.max(0, inventory - others)} of ${inventory} bays are unallocated in this building.`
    }
    const allocated = db.bays.filter((b) => b.lease_id === d.lease_id).length
    if (d.parking_slots != null && allocated > d.parking_slots) e.parking_slots = `${allocated} bays are already allocated to this lease; release some first.`
    return e
  },
  derive: (d, db, mode, orig) => {
    const b = db.buildings.find((x) => x.building_id === d.building_id)
    if (b) d.org_id = b.org_id
    const depositInputsChanged = !orig || orig.rent !== d.rent || orig.area !== d.area || orig.deposit_months !== d.deposit_months
    if ((d.deposit == null || (mode === 'edit' && depositInputsChanged && orig?.deposit === d.deposit)) && d.rent && d.area && d.deposit_months)
      d.deposit = Math.round(d.rent * d.area * d.deposit_months)
    if (!d.deposit_received) d.received_date = null
    if (!(d.rent_free_months > 0)) d.rent_free_conditions = null
  },
  afterWrite: (r, db, mode, orig) => {
    if (mode === 'edit' && orig?.status === r.status) return
    syncFloorOccupancy(db, db.lease_spaces.filter((s) => s.lease_id === r.lease_id).map((s) => s.floor_id))
    // An ended lease gives its parking bays back to the pool.
    if (r.status !== 'Active') for (const b of db.bays) if (b.lease_id === r.lease_id) Object.assign(b, { lease_id: null, status: 'Available' })
  },
  related: [
    { entity: 'leaseSpace', foreignKey: 'lease_id', title: 'Spaces' },
    { entity: 'renewal', foreignKey: 'lease_id', title: 'Renewal' },
  ],
  blockers: (r, db) => {
    const inv = db.rent_invoices.filter((x) => x.lease_id === r.lease_id).length
    return inv ? [plural(inv, 'invoice')] : []
  },
  deleteHint: 'Set the status to Terminated or Expired instead — the floors are released and the history is kept.',
}

const leaseSpace: EntityDef = {
  key: 'leaseSpace',
  name: 'LeaseSpace',
  label: 'Lease space',
  plural: 'Lease spaces',
  idKey: 'space_id',
  capability: 'leases',
  orgKey: 'org_id',
  scopeVia: 'lease',
  feature: 'basic_leasing',
  title: (r, ctx) => floorLabel(ctx, r.floor_id),
  subtitle: (r, ctx) => `${r.area?.toLocaleString('en-IN')} sq ft · ${leaseLabel(ctx, r.lease_id)}`,
  fields: [
    leaseField,
    {
      key: 'floor_id',
      label: 'Floor',
      type: 'ref',
      options: (d, ctx) => floorOptions(ctx, ctx.leases.find((l) => l.lease_id === d.lease_id)?.building_id ?? null),
      required: true,
      column: true,
    },
    { key: 'unit_id', label: 'Unit', type: 'ref', options: (d, ctx) => ctx.units.filter((u) => u.floor_id === d.floor_id).map((u) => ({ value: u.unit_id, label: u.unit_label })) },
    { key: 'area', label: 'Area', type: 'decimal', unit: 'sq ft', required: true, column: true },
  ],
  searchKeys: ['floor_id'],
  newId: () => shortId('SPC'),
  validate: (d, db) => {
    const l = db.leases.find((x) => x.lease_id === d.lease_id)
    const f = db.floors.find((x) => x.floor_id === d.floor_id)
    return l && f && f.building_id !== l.building_id ? { floor_id: 'Floor must be in the lease’s building.' } : {}
  },
  derive: inheritFromLease,
  afterWrite: (r, db, _mode, orig) => syncFloorOccupancy(db, [r.floor_id, ...(orig ? [orig.floor_id] : [])]),
}

const renewal: EntityDef = {
  key: 'renewal',
  name: 'LeaseRenewal',
  label: 'Renewal',
  plural: 'Renewals',
  idKey: 'renewal_id',
  capability: 'leases',
  orgKey: 'org_id',
  scopeVia: 'lease',
  feature: 'lease_crm',
  title: (r, ctx) => `Renewal — ${leaseLabel(ctx, r.lease_id)}`,
  subtitle: (r) => r.stage,
  fields: [
    leaseField,
    { key: 'stage', label: 'Stage', type: 'enum', options: RENEWAL_STAGES, required: true, column: true },
    { key: 'assignee', label: 'Owner (assignee)', type: 'ref', options: (d, ctx) => ctx.users.filter((u) => u.status === 'Active' && (!d.org_id || u.org_id === d.org_id || u.org_id === 'ORG-PT')).map((u) => ({ value: u.user_id, label: u.name })), column: true },
    { key: 'target_date', label: 'Target date', type: 'date', column: true },
    { key: 'notes', label: 'Next steps', type: 'textarea', column: true },
  ],
  filters: ['stage'],
  searchKeys: ['notes'],
  newId: () => shortId('REN'),
  defaults: () => ({ stage: 'Initiated' }),
  validate: (d, db, _m, orig) => {
    const open = db.renewals.find((x) => x.lease_id === d.lease_id && x.renewal_id !== orig?.renewal_id && x.stage !== 'Lost' && x.stage !== 'Agreed')
    return open && d.stage !== 'Lost' && d.stage !== 'Agreed' ? { lease_id: 'This lease already has an open renewal.' } : {}
  },
  derive: inheritFromLease,
}

const leaseDoc: EntityDef = {
  key: 'leaseDoc',
  name: 'LeaseDoc',
  label: 'Lease document',
  plural: 'Lease documents',
  idKey: 'doc_id',
  capability: 'leases',
  orgKey: 'org_id',
  scopeVia: 'lease',
  feature: 'lease_crm',
  title: (r) => r.file_ref ?? 'Lease abstract',
  subtitle: (r, ctx) => leaseLabel(ctx, r.lease_id),
  fields: [
    leaseField,
    { key: 'file_ref', label: 'Lease deed', type: 'file', column: true },
    { key: 'abstract', label: 'Plain-English abstract', type: 'textarea', column: true, help: 'Key terms, searchable without opening the deed (E3-S05).' },
  ],
  searchKeys: ['abstract', 'file_ref'],
  newId: () => shortId('LDOC'),
  derive: inheritFromLease,
}

const rent: EntityDef = {
  key: 'rent',
  name: 'Rent',
  label: 'Invoice',
  plural: 'Invoices',
  idKey: 'rent_id',
  capability: 'invoices',
  orgKey: 'org_id',
  scopeVia: 'lease',
  feature: 'invoicing',
  title: (r) => r.invoice_no,
  subtitle: (r, ctx) => `${r.period} · ${leaseLabel(ctx, r.lease_id)}`,
  fields: [
    leaseField,
    { key: 'invoice_no', label: 'Invoice no.', type: 'text', required: true, column: true },
    { key: 'period', label: 'Period', type: 'text', required: true, column: true, placeholder: 'YYYY-MM' },
    { key: 'amount', label: 'Amount (pre-GST)', type: 'money', unit: '₹', required: true, column: true },
    { key: 'gst', label: 'GST', type: 'percent', required: true },
    { key: 'due_date', label: 'Due', type: 'date', required: true, column: true },
    { key: 'paid_amount', label: 'Paid', type: 'money', unit: '₹', column: true },
    { key: 'paid_date', label: 'Paid on', type: 'date' },
    { key: 'source_tag', label: 'Source', type: 'enum', options: SOURCE_TAGS, required: true },
  ],
  filters: ['period'],
  searchKeys: ['invoice_no'],
  unique: ['invoice_no'],
  newId: () => shortId('INV'),
  defaults: () => ({ gst: 18, paid_amount: 0, source_tag: 'Manual' }),
  validate: (d) => {
    const e: Record<string, string> = {}
    if (d.period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(d.period)) e.period = 'Use YYYY-MM.'
    const total = Math.round((d.amount ?? 0) * (1 + (d.gst ?? 0) / 100))
    if (d.paid_amount > total) e.paid_amount = `More than the invoice total (₹${total.toLocaleString('en-IN')}).`
    if (d.paid_amount > 0 && !d.paid_date) e.paid_date = 'When was it paid?'
    return e
  },
  derive: inheritFromLease,
}

const brokerLog: EntityDef = {
  key: 'brokerLog',
  name: 'OccupierBrokerLog',
  label: 'Introduction',
  plural: 'Broker introductions',
  idKey: 'log_id',
  capability: 'broker_log',
  orgKey: 'owner_org_id',
  scopeVia: 'building',
  immutable: true,
  title: (r, ctx) => `${occupierName(ctx, r.occupier_id)} → ${buildingName(ctx, r.building_id)}`,
  subtitle: (r, ctx) => `${ctx.organisations.find((o) => o.org_id === r.broker_org_id)?.name ?? 'Broker'} · ${r.status}`,
  fields: [
    { key: 'occupier_id', label: 'Occupier introduced', type: 'ref', options: (_d, ctx) => occupierOptions(ctx), required: true, column: true },
    { key: 'building_id', label: 'Building', type: 'ref', options: (_d, ctx) => buildingOptions(ctx), required: true, column: true },
    { key: 'broker_org_id', label: 'Broker firm', type: 'ref', options: (_d, ctx) => orgOptions(ctx).filter((o) => o.group === 'Enabler'), required: true, column: true, adminOnly: true },
    { key: 'timestamp', label: 'Registered at', type: 'datetime', system: true, column: true },
    { key: 'status', label: 'Status', type: 'enum', options: ['Registered', 'Duplicate', 'Expired'], system: true, column: true },
    { key: 'notes', label: 'Requirement notes', type: 'textarea' },
  ],
  filters: ['status', 'broker_org_id'],
  searchKeys: ['notes'],
  newId: () => shortId('BRK'),
  derive: (d, db) => {
    const b = db.buildings.find((x) => x.building_id === d.building_id)
    if (b) d.owner_org_id = b.org_id
    d.timestamp = new Date().toISOString()
    // E3-S12: first registration of an occupier for a building wins for 180 days; later ones are duplicates.
    const cutoff = new Date(Date.now() - 180 * 86_400_000).toISOString()
    const prior = db.broker_log.find((x) => x.occupier_id === d.occupier_id && x.building_id === d.building_id && x.status === 'Registered' && x.timestamp >= cutoff)
    d.status = prior ? 'Duplicate' : 'Registered'
  },
}

const relationshipLog: EntityDef = {
  key: 'relationshipLog',
  name: 'RelationshipLog',
  label: 'Relationship note',
  plural: 'Relationship log',
  idKey: 'log_id',
  capability: 'leases',
  orgKey: 'org_id',
  scopeVia: 'lease',
  feature: 'lease_crm',
  title: (r) => `${r.type} · ${r.date}`,
  subtitle: (r) => r.summary,
  fields: [
    leaseField,
    { key: 'date', label: 'Date', type: 'date', required: true, column: true },
    { key: 'type', label: 'Type', type: 'enum', options: ['Meeting', 'Issue', 'Request', 'Note'], required: true, column: true },
    { key: 'summary', label: 'Summary', type: 'textarea', required: true, column: true },
  ],
  filters: ['type'],
  searchKeys: ['summary'],
  newId: () => shortId('REL'),
  defaults: () => ({ date: todayIso(), type: 'Note' }),
  derive: inheritFromLease,
}

export const LEASING_ENTITIES: Partial<Record<EntityKey, EntityDef>> = {
  occupier, lease, leaseSpace, renewal, leaseDoc, rent, brokerLog, relationshipLog,
}
