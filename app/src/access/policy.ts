// The access control plane from PRD §7, encoded as data.
// Enforced inside data/api.ts (simulating server-side enforcement); screens only read it to hide controls.
import type { OrgType, Role } from '../domain/platform'

export const ROLES: Role[] = ['Super Admin', 'AA', 'Owner/Developer', 'Occupier', 'Enabler']

/** Roles a user may hold, by the type of org they belong to (one role per user — EP-A-S04). */
export const ROLES_FOR_ORG_TYPE: Record<OrgType, Role[]> = {
  PropTattva: ['Super Admin', 'AA'],
  Owner: ['Owner/Developer'],
  Occupier: ['Occupier'],
  Enabler: ['Enabler'],
}

export type Action = 'C' | 'R' | 'U' | 'D'
/**
 * all        — every record
 * own-org    — records whose org field is the viewer's org
 * own-scope  — audit only: actions by PropTattva staff
 * mandated   — AA: records on buildings under an active mandate (§7.2 "*")
 * published  — occupiers / brokers: records on published buildings, public entities only
 * own-broker — broker log rows registered by the viewer's firm
 */
export type RowScope = 'all' | 'own-org' | 'own-scope' | 'mandated' | 'published' | 'own-broker'
export interface Grant {
  actions: Action[]
  scope: RowScope
}

/** §7.2 capability rows used by Phase 1 entities. Absent role = no access ("–"). */
export type Capability = 'organisations' | 'org_users' | 'plans' | 'subscriptions' | 'audit' | 'buildings' | 'leases' | 'invoices' | 'broker_log' | 'occupiers'

const CRUD: Action[] = ['C', 'R', 'U', 'D']
const CRU: Action[] = ['C', 'R', 'U']
const R: Action[] = ['R']
const CR: Action[] = ['C', 'R']

export const CAPABILITIES: Record<Capability, Partial<Record<Role, Grant>>> = {
  // Not a §7.2 row: every org can read its own record; only Super Admin manages orgs.
  organisations: {
    'Super Admin': { actions: CRUD, scope: 'all' },
    AA: { actions: R, scope: 'own-org' },
    'Owner/Developer': { actions: R, scope: 'own-org' },
    Occupier: { actions: R, scope: 'own-org' },
    Enabler: { actions: R, scope: 'own-org' },
  },
  // §7.2 "Org users & seats"
  org_users: {
    'Super Admin': { actions: CRUD, scope: 'all' },
    'Owner/Developer': { actions: CRU, scope: 'own-org' },
    Occupier: { actions: CRU, scope: 'own-org' },
    Enabler: { actions: CRU, scope: 'own-org' },
  },
  // Plan catalogue: managed by Super Admin; customers read it to see upgrade options.
  plans: {
    'Super Admin': { actions: CRUD, scope: 'all' },
    'Owner/Developer': { actions: R, scope: 'all' },
    Occupier: { actions: R, scope: 'all' },
    Enabler: { actions: R, scope: 'all' },
  },
  // §7.2 "Subscriptions & plans"
  subscriptions: {
    'Super Admin': { actions: CRUD, scope: 'all' },
    'Owner/Developer': { actions: R, scope: 'own-org' },
    Occupier: { actions: R, scope: 'own-org' },
    Enabler: { actions: R, scope: 'own-org' },
  },
  // §7.2 "Audit log": Super Admin all; AA own scope (actions taken by PropTattva staff for now).
  audit: {
    'Super Admin': { actions: R, scope: 'all' },
    AA: { actions: R, scope: 'own-scope' },
  },
  // §7.2 "Buildings, floors, bays" + "Stacking & availability" (asset registry entities)
  buildings: {
    'Super Admin': { actions: CRUD, scope: 'all' },
    AA: { actions: CRUD, scope: 'mandated' },
    'Owner/Developer': { actions: CRUD, scope: 'own-org' },
    Occupier: { actions: R, scope: 'published' },
    Enabler: { actions: R, scope: 'published' },
  },
  // §7.2 "Leases & renewals" (+ pricing & financial fields on leases)
  leases: {
    'Super Admin': { actions: CRUD, scope: 'all' },
    AA: { actions: CRUD, scope: 'mandated' },
    'Owner/Developer': { actions: CRUD, scope: 'own-org' },
  },
  // §7.2 "Invoices & ledger"
  invoices: {
    'Super Admin': { actions: CRUD, scope: 'all' },
    AA: { actions: R, scope: 'mandated' },
    'Owner/Developer': { actions: CRUD, scope: 'own-org' },
  },
  // §7.2 "Broker introduction log" — immutable, so no U/D for anyone.
  broker_log: {
    'Super Admin': { actions: R, scope: 'all' },
    AA: { actions: CR, scope: 'all' },
    'Owner/Developer': { actions: R, scope: 'own-org' },
    Enabler: { actions: CR, scope: 'own-broker' },
  },
  // Occupier reference catalogue (sector, GCC, parent — E3-S07..09), shared across tenants.
  occupiers: {
    'Super Admin': { actions: CRUD, scope: 'all' },
    AA: { actions: CRU, scope: 'all' },
    'Owner/Developer': { actions: CRU, scope: 'all' },
    // Brokers register introductions for their clients, so they can look up and add occupiers.
    Enabler: { actions: CR, scope: 'all' },
  },
}

export function grantFor(cap: Capability, role: Role): Grant | null {
  return CAPABILITIES[cap][role] ?? null
}

export function can(cap: Capability, role: Role, action: Action): boolean {
  return grantFor(cap, role)?.actions.includes(action) ?? false
}

/** §7.1 per-field visibility rules. */
export type Visibility = 'public' | 'owner' | 'aa' | 'anon'

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: 'Public',
  owner: 'Owner + own team',
  aa: 'AA team only',
  anon: 'Public (anonymised)',
}

/** Can this viewer see a field with the given rule on a record owned by recordOrgId? (§7.1) */
export function canSeeField(rule: Visibility, viewer: { role: Role; org_id: string }, recordOrgId: string | null, mandated = false) {
  if (viewer.role === 'Super Admin') return true
  switch (rule) {
    case 'public':
    case 'anon':
      return true
    case 'owner':
      // "The owning Owner org + Super Admin; AA if under mandate"
      return (recordOrgId != null && viewer.org_id === recordOrgId) || (viewer.role === 'AA' && mandated)
    case 'aa':
      return viewer.role === 'AA'
  }
}

/** §7.3 feature keys that plans can unlock. */
export const FEATURES: { key: string; label: string; for: OrgType }[] = [
  { key: 'registry', label: 'Building registry', for: 'Owner' },
  { key: 'floors', label: 'Floors', for: 'Owner' },
  { key: 'images', label: 'Images', for: 'Owner' },
  { key: 'documents', label: 'Documents', for: 'Owner' },
  { key: 'stacking', label: 'Stacking plan', for: 'Owner' },
  { key: 'basic_leasing', label: 'Basic leasing', for: 'Owner' },
  { key: 'lease_crm', label: 'Full lease CRM', for: 'Owner' },
  { key: 'pricing', label: 'Pricing', for: 'Owner' },
  { key: 'parking', label: 'Parking', for: 'Owner' },
  { key: 'portfolio_dashboard', label: 'Portfolio dashboard', for: 'Owner' },
  { key: 'invoicing', label: 'Invoicing / ledger', for: 'Owner' },
  { key: 'campus', label: 'Campus', for: 'Owner' },
  { key: 'revenue_at_risk', label: 'Revenue-at-risk', for: 'Owner' },
  { key: 'browse_profiles', label: 'Browse building profiles', for: 'Occupier' },
  { key: 'limited_comparables', label: 'Limited comparables', for: 'Occupier' },
  { key: 'saved_searches', label: 'Saved searches', for: 'Occupier' },
  { key: 'requirement_posting', label: 'Requirement posting', for: 'Occupier' },
  { key: 'toc_comparison', label: 'Total-occupancy-cost comparison', for: 'Occupier' },
  { key: 'full_comparables', label: 'Full comparables depth', for: 'Occupier' },
  { key: 'browse_listings', label: 'Browse public listings', for: 'Enabler' },
  { key: 'intro_registration', label: 'Register introductions', for: 'Enabler' },
  { key: 'full_listings', label: 'Full listing access', for: 'Enabler' },
  { key: 'broker_pipeline', label: 'Broker pipeline', for: 'Enabler' },
]

export const QUOTA_KEYS: { key: string; label: string }[] = [
  { key: 'buildings', label: 'Buildings' },
  { key: 'intro_registrations', label: 'Introductions / month' },
  { key: 'comparables', label: 'Comparables / month' },
]

export const featureLabel = (key: string) => FEATURES.find((f) => f.key === key)?.label ?? key
