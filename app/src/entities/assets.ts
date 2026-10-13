// Asset & registry entity definitions (PRD §5, epic E1).
import { DOC_TYPES } from '../domain/assets'
import type { PlatformDb } from '../domain/platform'
import { todayIso } from '../lib/dates'
import { geocode, isValidPincode } from '../lib/geo'
import { buildingName, buildingOptions, campusOptions, floorLabel, floorOptions, orgName, orgOptions, plural, shortId } from './helpers'
import type { EntityDef, EntityKey, Option, OptionCtx, Rec } from './types'

const AMENITY_TYPES = ['Cafeteria', 'Food court', 'Crèche', 'Gym', 'Conference', 'Hotel proximity', 'Other']
export const SHARING_SCOPES = ['Private (owner + AA)', 'Shared with prospects', 'Public']
export const REMINDER_LEADS = ['7 days', '30 days', '3 months', '6 months', '12 months', '18 months']

const ownerOrgOptions = (_d: Rec, ctx: OptionCtx) => orgOptions(ctx).filter((o) => o.group === 'Owner')
const buildingField = { key: 'building_id', label: 'Building', type: 'ref' as const, options: (_d: Rec, ctx: OptionCtx) => buildingOptions(ctx), required: true, createOnly: true, column: true }
const orgOf = (db: PlatformDb, buildingId: string | null) => db.buildings.find((b) => b.building_id === buildingId)?.org_id

/** Child records inherit the building's org — every business record carries org_id (EP-A-S02). */
const inheritFromBuilding = (d: Rec, db: PlatformDb) => {
  const org = orgOf(db, d.building_id)
  if (org) d.org_id = org
}

const campus: EntityDef = {
  key: 'campus',
  name: 'Campus',
  label: 'Campus',
  plural: 'Campuses',
  idKey: 'campus_id',
  capability: 'buildings',
  orgKey: 'org_id',
  scopeVia: 'self-campus',
  publicReadable: true,
  feature: 'campus',
  title: (r) => r.name,
  subtitle: (r, ctx) => `${r.location}, ${r.city} · ${orgName(ctx, r.org_id)}`,
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, column: true },
    { key: 'org_id', label: 'Owner org', type: 'ref', options: ownerOrgOptions, required: true, column: true, adminOnly: true, createOnly: true },
    { key: 'city', label: 'City', type: 'text', required: true, column: true },
    { key: 'location', label: 'Location / micro-market', type: 'text', required: true },
    { key: 'development_status', label: 'Development status', type: 'enum', options: ['Operational', 'Operational / U.C.', 'U.C. / BTS', 'Upcoming'], required: true, column: true },
    { key: 'total_area', label: 'Total area', type: 'decimal', unit: 'sq ft', column: true, help: 'Built potential across all buildings.' },
    { key: 'num_buildings', label: 'Buildings', type: 'int', system: true, column: true },
    { key: 'acres', label: 'Land', type: 'decimal', unit: 'acres' },
    { key: 'management_company', label: 'Campus management company', type: 'text', help: 'Holds common-area control (E1-S16).' },
    { key: 'campus_id', label: 'Campus ID', type: 'text', system: true },
  ],
  filters: ['city', 'development_status'],
  searchKeys: ['name', 'location', 'city'],
  newId: () => shortId('CMP'),
  defaults: (ctx) => ({ org_id: ctx.orgId, development_status: 'Upcoming', num_buildings: 0 }),
  derive: (d, db) => {
    d.num_buildings = db.buildings.filter((b) => b.campus_id === d.campus_id).length
  },
  related: [
    { entity: 'building', foreignKey: 'campus_id', title: 'Buildings' },
    { entity: 'campusAmenity', foreignKey: 'campus_id', title: 'Shared amenities' },
  ],
  blockers: (r, db) => {
    const n = db.buildings.filter((b) => b.campus_id === r.campus_id).length
    return n ? [plural(n, 'building')] : []
  },
}

const owner: EntityDef = {
  key: 'owner',
  name: 'Owner',
  label: 'Owner',
  plural: 'Owners',
  idKey: 'owner_id',
  capability: 'buildings',
  orgKey: 'org_id',
  title: (r) => r.name,
  subtitle: (r) => r.sub_type,
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, column: true },
    { key: 'org_id', label: 'Organisation', type: 'ref', options: ownerOrgOptions, required: true, column: true, adminOnly: true, createOnly: true },
    {
      key: 'sub_type',
      label: 'Sub-type',
      type: 'enum',
      options: ['Owner (leasing)', 'Owner (self-occupied)', 'Owner (mixed)', 'Owner (developer / under-construction)', 'Owner (REIT / Fund)'],
      required: true,
      column: true,
      help: 'Developer is a sub-type of Owner (pre-OC). REIT / Fund is modelled now; its journey is P2.',
    },
    { key: 'owner_id', label: 'Owner ID', type: 'text', system: true },
  ],
  searchKeys: ['name'],
  filters: ['sub_type'],
  newId: () => shortId('OWNR'),
  defaults: (ctx) => ({ org_id: ctx.orgId, sub_type: 'Owner (leasing)' }),
  related: [
    { entity: 'ownerContact', foreignKey: 'owner_id', title: 'Contacts, committee & strata owners' },
    { entity: 'building', foreignKey: 'owner_id', title: 'Buildings' },
  ],
  blockers: (r, db) => {
    const n = db.buildings.filter((b) => b.owner_id === r.owner_id).length
    return n ? [plural(n, 'building')] : []
  },
}

const building: EntityDef = {
  key: 'building',
  name: 'Building',
  label: 'Building',
  plural: 'Buildings',
  idKey: 'building_id',
  capability: 'buildings',
  orgKey: 'org_id',
  scopeVia: 'self-building',
  publicReadable: true,
  feature: 'registry',
  title: (r) => r.name,
  subtitle: (r, ctx) => [ctx.campuses.find((c) => c.campus_id === r.campus_id)?.name, r.micro_market, r.city].filter(Boolean).join(' · '),
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, column: true },
    { key: 'owner_id', label: 'Owner', type: 'ref', options: (_d, ctx) => ctx.owners.map((o) => ({ value: o.owner_id, label: o.name, group: o.sub_type })), required: true, createOnly: true },
    { key: 'org_id', label: 'Owner org', type: 'ref', options: (_d, ctx) => orgOptions(ctx), system: true, column: true },
    {
      key: 'campus_id',
      label: 'Campus',
      type: 'ref',
      options: (d, ctx) => {
        const org = ctx.owners.find((o) => o.owner_id === d.owner_id)?.org_id
        return campusOptions(ctx).filter((c) => !org || ctx.campuses.find((x) => x.campus_id === c.value)?.org_id === org)
      },
      help: 'Leave blank for a standalone building.',
    },
    { key: 'address', label: 'Address', type: 'textarea', required: true },
    { key: 'pincode', label: 'PIN code', type: 'text', required: true, placeholder: '560066', help: '6 digits; coordinates are derived from it if left blank.' },
    { key: 'city', label: 'City', type: 'text', required: true, column: true },
    { key: 'micro_market', label: 'Micro-market', type: 'text', required: true, column: true, placeholder: 'e.g. ORR, Whitefield' },
    { key: 'lat', label: 'Latitude', type: 'decimal' },
    { key: 'long', label: 'Longitude', type: 'decimal' },
    { key: 'grade', label: 'Grade', type: 'enum', options: ['A+', 'A', 'B', 'C'], system: true, column: true },
    { key: 'grade_source', label: 'Grade source', type: 'enum', options: ['Indicative (calculator)', 'AA scorecard', 'Imported'], system: true, help: 'The calculator grade stays indicative until an AA scorecard overrides it (E1-S04).' },
    { key: 'grade_assessed_at', label: 'Graded on', type: 'datetime', system: true },
    { key: 'total_area', label: 'Total chargeable area', type: 'decimal', unit: 'sq ft', column: true },
    { key: 'ownership_type', label: 'Ownership', type: 'enum', options: ['Sole', 'Multi-owner', 'Strata'], required: true, column: true },
    { key: 'multi_owner_struct', label: 'JV / consortium / SPV partners', type: 'partners', visibility: 'owner', showIf: (d) => d.ownership_type === 'Multi-owner' },
    { key: 'mandate_threshold_pct', label: 'Strata signatures needed for a mandate', type: 'percent', showIf: (d) => d.ownership_type === 'Strata', help: '% of strata area that must sign (E1-S14).' },
    { key: 'status', label: 'Status', type: 'enum', options: ['Active', 'Pre-OC', 'Inactive'], required: true, column: true, help: 'Pre-OC = under construction (developer owners).' },
    { key: 'handover_condition', label: 'Handover condition', type: 'enum', options: ['Warm Shell', 'Furnished', 'BTS'], showIf: (d) => d.status === 'Pre-OC' },
    { key: 'expected_completion', label: 'Expected completion', type: 'date', showIf: (d) => d.status === 'Pre-OC' },
    { key: 'published', label: 'Published to occupiers & brokers', type: 'bool', column: true, help: 'Public fields become visible to occupiers and brokers.' },
    { key: 'building_id', label: 'Building ID', type: 'text', system: true },
  ],
  filters: ['org_id', 'city', 'status', 'grade'],
  searchKeys: ['name', 'micro_market', 'city', 'address'],
  newId: () => shortId('BLD'),
  defaults: (ctx) => ({
    owner_id: ctx.owners.find((o) => o.org_id === ctx.orgId)?.owner_id ?? null,
    ownership_type: 'Sole',
    status: 'Active',
    published: false,
    multi_owner_struct: [],
    grade: null,
    grade_source: null,
    grade_assessed_at: null,
  }),
  validate: (d) => {
    const e: Record<string, string> = {}
    if (d.pincode && !isValidPincode(d.pincode)) e.pincode = 'Enter a valid 6-digit PIN code.'
    if (d.lat != null && (d.lat < 6 || d.lat > 37)) e.lat = 'Latitude must be within India (6–37).'
    if (d.long != null && (d.long < 68 || d.long > 98)) e.long = 'Longitude must be within India (68–98).'
    if (d.ownership_type === 'Multi-owner' && d.multi_owner_struct?.length) {
      const total = d.multi_owner_struct.reduce((s: number, p: { pct: number }) => s + (Number(p.pct) || 0), 0)
      if (Math.abs(total - 100) > 0.01) e.multi_owner_struct = `Partner shares add up to ${total}%; they must total 100%.`
      if (d.multi_owner_struct.some((p: { name: string }) => !p.name?.trim())) e.multi_owner_struct = 'Every partner needs a name.'
    }
    return e
  },
  derive: (d, db) => {
    const o = db.owners.find((x) => x.owner_id === d.owner_id)
    if (o) d.org_id = o.org_id
    if ((d.lat == null || d.long == null) && d.pincode) {
      const g = geocode(d.pincode)
      if (g) Object.assign(d, g)
    }
    if (d.ownership_type !== 'Multi-owner') d.multi_owner_struct = []
    if (d.ownership_type !== 'Strata') d.mandate_threshold_pct = null
    if (d.status !== 'Pre-OC') {
      d.handover_condition = null
      d.expected_completion = null
    }
  },
  afterWrite: (r, db, mode) => {
    if (mode === 'delete') return
    const c = db.campuses.find((x) => x.campus_id === r.campus_id)
    if (c) c.num_buildings = db.buildings.filter((b) => b.campus_id === c.campus_id).length
  },
  blockers: (r, db) => {
    const out: string[] = []
    const f = db.floors.filter((x) => x.building_id === r.building_id).length
    const l = db.leases.filter((x) => x.building_id === r.building_id).length
    if (f) out.push(plural(f, 'floor'))
    if (l) out.push(plural(l, 'lease'))
    return out
  },
  deleteHint: 'Set the status to Inactive instead to retire the building but keep its history.',
}

const occupancyNeedsVacancy = (d: Rec) => d.occupancy_type === 'Vacant' || d.occupancy_type === 'Partially leased'

const floor: EntityDef = {
  key: 'floor',
  name: 'BuildingFloor',
  label: 'Floor',
  plural: 'Floors',
  idKey: 'floor_id',
  capability: 'buildings',
  orgKey: 'org_id',
  scopeVia: 'building',
  publicReadable: true,
  feature: 'floors',
  title: (r, ctx) => `Floor ${r.floor_no}${r.wing ? ` · ${r.wing}` : ''} — ${buildingName(ctx, r.building_id)}`,
  subtitle: (r) => [r.floor_use, r.occupancy_type].filter(Boolean).join(' · '),
  fields: [
    buildingField,
    { key: 'floor_no', label: 'Floor no.', type: 'text', required: true, column: true, placeholder: 'G, 1, 2, B1' },
    { key: 'wing', label: 'Wing', type: 'text', column: true },
    { key: 'floor_use', label: 'Use', type: 'enum', options: ['Office', 'Parking', 'Retail', 'Amenity'], required: true, column: true },
    { key: 'chargeable_area', label: 'Chargeable area', type: 'decimal', unit: 'sq ft', column: true },
    { key: 'carpet_area', label: 'Carpet area (RERA)', type: 'decimal', unit: 'sq ft' },
    { key: 'efficiency', label: 'Efficiency', type: 'percent', system: true, column: true },
    { key: 'occupancy_type', label: 'Occupancy', type: 'enum', options: ['Leased', 'Vacant', 'Partially leased', 'Self-occupied'], column: true, showIf: (d) => d.floor_use !== 'Parking' },
    { key: 'self_occupied_entity', label: 'Self-occupying group company', type: 'text', showIf: (d) => d.occupancy_type === 'Self-occupied', help: 'E4-S05' },
    { key: 'vacant_since', label: 'Vacant since', type: 'date', showIf: occupancyNeedsVacancy, help: 'Drives vacancy age.' },
    { key: 'asking_rent', label: 'Asking rent', type: 'money', unit: '₹/sq ft/mo', visibility: 'owner', column: true, showIf: (d) => d.floor_use !== 'Parking' },
    { key: 'handover_condition', label: 'Handover condition', type: 'enum', options: ['Warm Shell', 'Furnished', 'BTS'], showIf: occupancyNeedsVacancy },
    { key: 'available_from', label: 'Available from', type: 'date', showIf: occupancyNeedsVacancy },
    { key: 'floor_id', label: 'Floor ID', type: 'text', system: true },
  ],
  filters: ['occupancy_type', 'floor_use'],
  searchKeys: ['floor_no', 'wing'],
  newId: () => shortId('FLR'),
  defaults: () => ({ floor_use: 'Office', occupancy_type: 'Vacant', vacant_since: todayIso() }),
  validate: (d, db, _m, orig) => {
    const e: Record<string, string> = {}
    if (d.carpet_area != null && d.chargeable_area != null && d.carpet_area > d.chargeable_area) e.carpet_area = 'Carpet area cannot exceed chargeable area.'
    if (d.occupancy_type === 'Self-occupied' && !d.self_occupied_entity?.trim()) e.self_occupied_entity = 'Name the group company occupying this floor.'
    const clash = db.floors.find((f) => f.building_id === d.building_id && f.floor_no === d.floor_no && (f.wing ?? '') === (d.wing ?? '') && f.floor_id !== orig?.floor_id)
    if (clash) e.floor_no = 'This floor already exists in the building.'
    return e
  },
  derive: (d, db, _m, orig) => {
    inheritFromBuilding(d, db)
    d.efficiency = d.chargeable_area && d.carpet_area ? Math.round((d.carpet_area / d.chargeable_area) * 1000) / 10 : null
    if (d.floor_use === 'Parking') {
      d.occupancy_type = null
      d.asking_rent = null
    }
    if (occupancyNeedsVacancy(d)) {
      if (!d.vacant_since || (orig && !occupancyNeedsVacancy(orig))) d.vacant_since = d.vacant_since && orig && occupancyNeedsVacancy(orig) ? d.vacant_since : todayIso()
    } else {
      d.vacant_since = null
      d.handover_condition = null
      d.available_from = null
    }
    if (d.occupancy_type !== 'Self-occupied') d.self_occupied_entity = null
  },
  related: [{ entity: 'unit', foreignKey: 'floor_id', title: 'Units' }],
  blockers: (r, db) => {
    const n = db.lease_spaces.filter((s) => s.floor_id === r.floor_id).length
    const u = db.units.filter((s) => s.floor_id === r.floor_id).length
    return [...(n ? [plural(n, 'lease space')] : []), ...(u ? [plural(u, 'unit')] : [])]
  },
}

const unit: EntityDef = {
  key: 'unit',
  name: 'FloorUnit',
  label: 'Unit',
  plural: 'Units',
  idKey: 'unit_id',
  capability: 'buildings',
  orgKey: 'org_id',
  scopeVia: 'building',
  publicReadable: true,
  feature: 'floors',
  title: (r, ctx) => `${r.unit_label} — ${floorLabel(ctx, r.floor_id)}`,
  subtitle: (r, ctx) => buildingName(ctx, r.building_id),
  fields: [
    buildingField,
    { key: 'floor_id', label: 'Floor', type: 'ref', options: (d, ctx) => floorOptions(ctx, d.building_id), required: true, createOnly: true, column: true },
    { key: 'unit_label', label: 'Unit', type: 'text', required: true, column: true, placeholder: 'Unit A' },
    { key: 'chargeable_area', label: 'Chargeable area', type: 'decimal', unit: 'sq ft', column: true },
    { key: 'carpet_area', label: 'Carpet area', type: 'decimal', unit: 'sq ft' },
    { key: 'status', label: 'Status', type: 'enum', options: ['Available', 'Leased', 'Vacant'], required: true, column: true },
  ],
  filters: ['status'],
  searchKeys: ['unit_label'],
  newId: () => shortId('UNT'),
  defaults: () => ({ status: 'Available' }),
  validate: (d, db, _m, orig) => {
    const e: Record<string, string> = {}
    const f = db.floors.find((x) => x.floor_id === d.floor_id)
    if (f && f.building_id !== d.building_id) e.floor_id = 'Floor is not in this building.'
    const others = db.units.filter((u) => u.floor_id === d.floor_id && u.unit_id !== orig?.unit_id).reduce((s, u) => s + (u.chargeable_area ?? 0), 0)
    if (f?.chargeable_area && d.chargeable_area && others + d.chargeable_area > f.chargeable_area)
      e.chargeable_area = `Units would total ${(others + d.chargeable_area).toLocaleString('en-IN')} sq ft, more than the floor’s ${f.chargeable_area.toLocaleString('en-IN')}.`
    return e
  },
  derive: inheritFromBuilding,
}

const amenityFields = (parent: 'building' | 'campus') => [
  parent === 'building'
    ? buildingField
    : { key: 'campus_id', label: 'Campus', type: 'ref' as const, options: (_d: Rec, ctx: OptionCtx) => campusOptions(ctx), required: true, createOnly: true, column: true },
  { key: 'type', label: 'Type', type: 'enum' as const, options: AMENITY_TYPES, required: true, column: true },
  { key: 'capacity', label: 'Capacity', type: 'int' as const, column: true },
  { key: 'notes', label: 'Notes', type: 'textarea' as const, column: true },
]

const buildingAmenity: EntityDef = {
  key: 'buildingAmenity',
  name: 'BuildingAmenity',
  label: 'Amenity',
  plural: 'Amenities',
  idKey: 'amenity_id',
  capability: 'buildings',
  orgKey: 'org_id',
  scopeVia: 'building',
  publicReadable: true,
  title: (r) => r.type,
  subtitle: (r, ctx) => buildingName(ctx, r.building_id),
  fields: amenityFields('building'),
  searchKeys: ['type', 'notes'],
  newId: () => shortId('BAM'),
  derive: inheritFromBuilding,
}

const campusAmenity: EntityDef = {
  key: 'campusAmenity',
  name: 'CampusAmenity',
  label: 'Shared amenity',
  plural: 'Shared amenities',
  idKey: 'amenity_id',
  capability: 'buildings',
  orgKey: 'org_id',
  scopeVia: 'campus',
  publicReadable: true,
  feature: 'campus',
  title: (r) => r.type,
  subtitle: (r, ctx) => ctx.campuses.find((c) => c.campus_id === r.campus_id)?.name ?? '',
  fields: amenityFields('campus'),
  searchKeys: ['type', 'notes'],
  newId: () => shortId('CAM'),
  derive: (d, db) => {
    const c = db.campuses.find((x) => x.campus_id === d.campus_id)
    if (c) d.org_id = c.org_id
  },
}

const image: EntityDef = {
  key: 'image',
  name: 'BuildingImages',
  label: 'Image',
  plural: 'Images',
  idKey: 'image_id',
  capability: 'buildings',
  orgKey: 'org_id',
  scopeVia: 'building',
  publicReadable: true,
  feature: 'images',
  title: (r) => r.caption || r.type,
  subtitle: (r, ctx) => buildingName(ctx, r.building_id),
  fields: [
    buildingField,
    { key: 'data_url', label: 'Image', type: 'image', required: true, hideInDetail: true, help: 'Stored in your browser, downscaled to 640 px.' },
    { key: 'type', label: 'Type', type: 'enum', options: ['Exterior', 'Amenity', 'Typical floor', 'Parking plan', 'Other'], required: true, column: true },
    { key: 'caption', label: 'Caption', type: 'text', column: true },
    { key: 'is_cover', label: 'Cover image', type: 'bool', column: true },
    { key: 'display_order', label: 'Order', type: 'int', system: true },
  ],
  searchKeys: ['caption', 'type'],
  newId: () => shortId('IMG'),
  defaults: () => ({ type: 'Exterior', is_cover: false }),
  validate: (d, db, mode) => {
    const count = db.images.filter((i) => i.building_id === d.building_id).length
    return mode === 'create' && count >= 20 ? { data_url: 'A building can have at most 20 images (E1-S05).' } : {}
  },
  derive: (d, db, mode) => {
    inheritFromBuilding(d, db)
    if (mode === 'create') d.display_order = Math.max(0, ...db.images.filter((i) => i.building_id === d.building_id).map((i) => i.display_order)) + 1
  },
  afterWrite: (r, db, mode) => {
    if (mode === 'delete' || !r.is_cover) return
    for (const i of db.images) if (i.building_id === r.building_id && i.image_id !== r.image_id) i.is_cover = false
  },
}

const document: EntityDef = {
  key: 'document',
  name: 'BuildingDocument',
  label: 'Document',
  plural: 'Documents',
  idKey: 'doc_id',
  capability: 'buildings',
  orgKey: 'org_id',
  scopeVia: 'building',
  publicReadable: true,
  // Occupiers and brokers only see documents the owner chose to share (sharing_scope).
  publicRowFilter: (r) => r.sharing_scope !== 'Private (owner + AA)',
  feature: 'documents',
  title: (r) => r.type,
  subtitle: (r, ctx) => buildingName(ctx, r.building_id),
  fields: [
    buildingField,
    { key: 'type', label: 'Document type', type: 'enum', options: DOC_TYPES, required: true, column: true },
    { key: 'file_ref', label: 'File', type: 'file', column: true },
    { key: 'validity', label: 'Valid until', type: 'date', column: true, help: 'Blank for documents that do not expire (e.g. title, OC).' },
    { key: 'sharing_scope', label: 'Sharing', type: 'enum', options: SHARING_SCOPES, required: true, column: true },
    { key: 'reminder_lead', label: 'Remind me before expiry', type: 'enum', options: REMINDER_LEADS, required: true },
  ],
  filters: ['type', 'sharing_scope'],
  searchKeys: ['type', 'file_ref'],
  newId: () => shortId('DOC'),
  defaults: () => ({ sharing_scope: 'Private (owner + AA)', reminder_lead: '30 days' }),
  derive: inheritFromBuilding,
  deleteHint: 'Documents are never deleted in the vault — upload a renewed version instead.',
}

const certification: EntityDef = {
  key: 'certification',
  name: 'Certification',
  label: 'Certification',
  plural: 'Certifications',
  idKey: 'cert_id',
  capability: 'buildings',
  orgKey: 'org_id',
  scopeVia: 'building',
  publicReadable: true,
  title: (r) => `${r.scheme}${r.level ? ` ${r.level}` : ''}`,
  subtitle: (r, ctx) => buildingName(ctx, r.building_id),
  fields: [
    buildingField,
    { key: 'scheme', label: 'Scheme', type: 'enum', options: ['LEED', 'IGBC', 'GRIHA', 'WELL', 'ECBC', 'GRESB'], required: true, column: true },
    { key: 'level', label: 'Level', type: 'text', column: true, placeholder: 'Platinum, Gold, 4-star, Compliant…' },
    { key: 'validity', label: 'Valid until', type: 'date', column: true },
  ],
  filters: ['scheme'],
  searchKeys: ['scheme', 'level'],
  newId: () => shortId('CRT'),
  derive: inheritFromBuilding,
}

const ownershipHistory: EntityDef = {
  key: 'ownershipHistory',
  name: 'OwnershipHistory',
  label: 'Title event',
  plural: 'Title chain',
  idKey: 'history_id',
  capability: 'buildings',
  orgKey: 'org_id',
  scopeVia: 'building',
  title: (r) => `${r.event_type} — ${r.owner_name}`,
  subtitle: (r, ctx) => buildingName(ctx, r.building_id),
  fields: [
    buildingField,
    { key: 'event_type', label: 'Event', type: 'enum', options: ['Grant', 'Mutation', 'Sale', 'Transfer', 'Mortgage', 'Release'], required: true, column: true },
    { key: 'owner_name', label: 'Owner / party', type: 'text', required: true, column: true },
    { key: 'ownership_pct', label: 'Share', type: 'percent', column: true },
    { key: 'floor_id', label: 'Floor (strata)', type: 'ref', options: (d, ctx) => floorOptions(ctx, d.building_id), help: 'Only for strata title on a specific floor.' },
    { key: 'from_date', label: 'From', type: 'date', column: true },
    { key: 'to_date', label: 'To', type: 'date', column: true },
    { key: 'encumbrance', label: 'Encumbrance / charge', type: 'textarea', column: true },
  ],
  filters: ['event_type'],
  searchKeys: ['owner_name', 'encumbrance'],
  newId: () => shortId('TTL'),
  validate: (d) => (d.from_date && d.to_date && d.to_date < d.from_date ? { to_date: 'Must be after the start date.' } : {}),
  derive: inheritFromBuilding,
}

const ownerContact: EntityDef = {
  key: 'ownerContact',
  name: 'OwnerContact',
  label: 'Contact',
  plural: 'Owner contacts',
  idKey: 'contact_id',
  capability: 'buildings',
  orgKey: 'org_id',
  scopeVia: 'building',
  title: (r) => r.name,
  subtitle: (r) => [r.role, r.unit].filter(Boolean).join(' · '),
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, column: true },
    { key: 'role', label: 'Role', type: 'enum', options: ['Primary contact', 'Representative', 'Committee member', 'Strata unit owner'], required: true, column: true },
    { key: 'owner_id', label: 'Owner', type: 'ref', options: (_d, ctx) => ctx.owners.map((o) => ({ value: o.owner_id, label: o.name })), required: true, createOnly: true },
    { key: 'building_id', label: 'Building', type: 'ref', options: (d, ctx) => buildingOptions(ctx).filter((b) => ctx.buildings.find((x) => x.building_id === b.value)?.owner_id === d.owner_id), help: 'Required for strata owners and committees of a specific building.' },
    { key: 'email', label: 'Email', type: 'email', column: true },
    { key: 'phone', label: 'Phone', type: 'phone' },
    { key: 'unit', label: 'Unit(s) owned', type: 'text', showIf: (d) => d.role === 'Strata unit owner', column: true },
    { key: 'area', label: 'Area owned', type: 'decimal', unit: 'sq ft', showIf: (d) => d.role === 'Strata unit owner' },
    { key: 'ownership_pct', label: 'Share of building', type: 'percent', showIf: (d) => d.role === 'Strata unit owner', column: true },
    { key: 'signed_mandate', label: 'Signed the mandate', type: 'bool', showIf: (d) => d.role === 'Strata unit owner', column: true },
    { key: 'is_primary', label: 'Primary', type: 'bool' },
  ],
  filters: ['role'],
  searchKeys: ['name', 'email', 'unit'],
  newId: () => shortId('CON'),
  defaults: (ctx) => ({ owner_id: ctx.owners.find((o) => o.org_id === ctx.orgId)?.owner_id ?? null, role: 'Representative', is_primary: false, signed_mandate: false }),
  validate: (d) => {
    const e: Record<string, string> = {}
    if ((d.role === 'Strata unit owner' || d.role === 'Committee member') && !d.building_id) e.building_id = 'Choose the building this owner / committee belongs to.'
    return e
  },
  derive: (d, db) => {
    const o = db.owners.find((x) => x.owner_id === d.owner_id)
    if (o) d.org_id = o.org_id
    if (d.role !== 'Strata unit owner') Object.assign(d, { unit: null, area: null, ownership_pct: null, signed_mandate: false })
  },
}

const docOptions = (d: Rec, ctx: OptionCtx): Option[] =>
  ctx.documents.filter((x) => !d.building_id || x.building_id === d.building_id).map((x) => ({ value: x.doc_id, label: `${x.type} — ${buildingName(ctx, x.building_id)}` }))

const documentShare: EntityDef = {
  key: 'documentShare',
  name: 'DocumentShare',
  label: 'Share',
  plural: 'Shares',
  idKey: 'share_id',
  capability: 'buildings',
  orgKey: 'org_id',
  scopeVia: 'building',
  feature: 'documents',
  title: (r) => r.email,
  subtitle: (r, ctx) => `${r.access} · ${r.scope === 'Category' ? r.category : r.scope === 'Single document' ? ctx.documents.find((d) => d.doc_id === r.doc_id)?.type ?? 'Document' : r.building_id ? buildingName(ctx, r.building_id) : 'All buildings'}`,
  fields: [
    { key: 'email', label: 'Share with (email)', type: 'email', required: true, column: true },
    { key: 'scope', label: 'Scope', type: 'enum', options: ['Single document', 'Category', 'Building folder'], required: true, column: true },
    { key: 'building_id', label: 'Building', type: 'ref', options: (_d, ctx) => buildingOptions(ctx), column: true, help: 'Blank = across all your buildings (category shares only).' },
    { key: 'doc_id', label: 'Document', type: 'ref', options: docOptions, showIf: (d) => d.scope === 'Single document' },
    { key: 'category', label: 'Category', type: 'enum', options: DOC_TYPES, showIf: (d) => d.scope === 'Category' },
    { key: 'access', label: 'Access', type: 'enum', options: ['View only', 'Comment', 'Upload / Edit'], required: true, column: true },
    { key: 'expires_at', label: 'Expires', type: 'date', column: true, help: 'Blank = never.' },
    { key: 'status', label: 'Status', type: 'enum', options: ['Active', 'Revoked'], required: true, column: true },
  ],
  filters: ['scope', 'access', 'status'],
  searchKeys: ['email'],
  newId: () => shortId('SHR'),
  defaults: () => ({ scope: 'Single document', access: 'View only', status: 'Active' }),
  validate: (d) => {
    const e: Record<string, string> = {}
    if (d.scope === 'Single document' && !d.doc_id) e.doc_id = 'Choose the document to share.'
    if (d.scope === 'Category' && !d.category) e.category = 'Choose a category.'
    if (d.scope === 'Building folder' && !d.building_id) e.building_id = 'Choose the building folder to share.'
    return e
  },
  derive: (d, db) => {
    if (d.scope !== 'Single document') d.doc_id = null
    if (d.scope !== 'Category') d.category = null
    const doc = db.documents.find((x) => x.doc_id === d.doc_id)
    if (doc) d.building_id = doc.building_id
    if (d.building_id) inheritFromBuilding(d, db)
  },
}

export const ASSET_ENTITIES: Partial<Record<EntityKey, EntityDef>> = {
  campus, owner, building, floor, unit, buildingAmenity, campusAmenity, image, document, certification, ownershipHistory, ownerContact, documentShare,
}
