// Initial platform data. Owner org ids (OWN-1..3) match the parks in mockData.json.
// People, emails, prices and dates are SAMPLE values (labelled as such in the UI).
import type { AuditEntry, Invite, Organisation, PlatformDb, Subscription, SubscriptionPlan, User } from '../domain/platform'
import { createAssetSeed } from './seedAssets'
import { createMandateSeed } from './seedMandates'

const DAY = 86_400_000
const iso = (offsetDays: number, base = Date.now()) => new Date(base + offsetDays * DAY).toISOString()
const date = (offsetDays: number) => iso(offsetDays).slice(0, 10)

const OWNER_STARTER = ['registry', 'floors', 'images', 'documents', 'stacking', 'basic_leasing']
const OWNER_GROWTH = [...OWNER_STARTER, 'lease_crm', 'pricing', 'parking', 'portfolio_dashboard', 'invoicing']
const OWNER_ENTERPRISE = [...OWNER_GROWTH, 'campus', 'revenue_at_risk']
const OCCUPIER_FREE = ['browse_profiles', 'limited_comparables']
const BROKER_BASIC = ['browse_listings', 'intro_registration']

const plans: SubscriptionPlan[] = [
  { plan_code: 'OWNER_STARTER', name: 'Owner Starter', applies_to: 'Owner', default_seat_limit: 3, feature_flags: OWNER_STARTER, quotas: { buildings: 1 }, price: 25000, status: 'Active' },
  { plan_code: 'OWNER_GROWTH', name: 'Owner Growth', applies_to: 'Owner', default_seat_limit: 10, feature_flags: OWNER_GROWTH, quotas: { buildings: 10 }, price: 75000, status: 'Active' },
  { plan_code: 'OWNER_ENTERPRISE', name: 'Owner Enterprise', applies_to: 'Owner', default_seat_limit: 50, feature_flags: OWNER_ENTERPRISE, quotas: { buildings: null }, price: null, status: 'Active' },
  { plan_code: 'OCCUPIER_FREE', name: 'Occupier Free', applies_to: 'Occupier', default_seat_limit: 2, feature_flags: OCCUPIER_FREE, quotas: { comparables: 10 }, price: 0, status: 'Active' },
  { plan_code: 'OCCUPIER_PRO', name: 'Occupier Pro', applies_to: 'Occupier', default_seat_limit: 10, feature_flags: [...OCCUPIER_FREE, 'saved_searches', 'requirement_posting', 'toc_comparison', 'full_comparables'], quotas: { comparables: null }, price: 30000, status: 'Active' },
  { plan_code: 'BROKER_BASIC', name: 'Broker Basic', applies_to: 'Enabler', default_seat_limit: 3, feature_flags: BROKER_BASIC, quotas: { intro_registrations: 25 }, price: 10000, status: 'Active' },
  { plan_code: 'BROKER_PRO', name: 'Broker Pro', applies_to: 'Enabler', default_seat_limit: 15, feature_flags: [...BROKER_BASIC, 'full_listings', 'broker_pipeline'], quotas: { intro_registrations: 200 }, price: 40000, status: 'Active' },
]

const organisations: Organisation[] = [
  { org_id: 'ORG-PT', name: 'PropTattva', type: 'PropTattva', enabler_type: null, status: 'Active', created_at: iso(-200) },
  { org_id: 'OWN-1', name: 'Northstar Estates', type: 'Owner', enabler_type: null, status: 'Active', created_at: iso(-120) },
  { org_id: 'OWN-2', name: 'Meridian Developers', type: 'Owner', enabler_type: null, status: 'Active', created_at: iso(-110) },
  { org_id: 'OWN-3', name: 'Trinity Realty', type: 'Owner', enabler_type: null, status: 'Active', created_at: iso(-90) },
  { org_id: 'OWN-4', name: 'Harbour Holdings', type: 'Owner', enabler_type: null, status: 'Pending', created_at: iso(-6) },
  { org_id: 'OCC-1', name: 'Acme GCC India', type: 'Occupier', enabler_type: null, status: 'Active', created_at: iso(-60) },
  { org_id: 'ENB-1', name: 'Crestline Advisors', type: 'Enabler', enabler_type: 'Broker firm', status: 'Active', created_at: iso(-45) },
  { org_id: 'ENB-2', name: 'Atlas Brokerage', type: 'Enabler', enabler_type: 'Broker firm', status: 'Suspended', created_at: iso(-80) },
]

const subscriptions: Subscription[] = [
  { subscription_id: 'SUB-OWN-1', org_id: 'OWN-1', plan_code: 'OWNER_ENTERPRISE', seat_limit: 50, start: date(-120), end: null, status: 'Active' },
  { subscription_id: 'SUB-OWN-2', org_id: 'OWN-2', plan_code: 'OWNER_GROWTH', seat_limit: 10, start: date(-110), end: date(255), status: 'Active' },
  { subscription_id: 'SUB-OWN-3', org_id: 'OWN-3', plan_code: 'OWNER_STARTER', seat_limit: 3, start: date(-90), end: date(275), status: 'Active' },
  { subscription_id: 'SUB-OWN-4', org_id: 'OWN-4', plan_code: 'OWNER_GROWTH', seat_limit: 10, start: date(-6), end: date(24), status: 'Trial' },
  { subscription_id: 'SUB-OCC-1', org_id: 'OCC-1', plan_code: 'OCCUPIER_FREE', seat_limit: 2, start: date(-60), end: null, status: 'Active' },
  { subscription_id: 'SUB-ENB-1', org_id: 'ENB-1', plan_code: 'BROKER_BASIC', seat_limit: 3, start: date(-45), end: date(320), status: 'Active' },
  { subscription_id: 'SUB-ENB-2', org_id: 'ENB-2', plan_code: 'BROKER_BASIC', seat_limit: 3, start: date(-80), end: date(-5), status: 'Expired' },
]

const u = (user_id: string, org_id: string, name: string, email: string, role: User['role'], phone: string | null, lastLoginDaysAgo: number | null, status: User['status'] = 'Active'): User => ({
  user_id, org_id, name, email, phone, role, status, last_login: lastLoginDaysAgo == null ? null : iso(-lastLoginDaysAgo),
})

const users: User[] = [
  u('U-ADMIN', 'ORG-PT', 'PT Admin', 'admin@proptattva.com', 'Super Admin', '+91 98450 10001', 0),
  u('U-AA-1', 'ORG-PT', 'Ananya Rao', 'ananya.rao@proptattva.com', 'AA', '+91 98450 10002', 1),
  u('U-AA-2', 'ORG-PT', 'Vikram Iyer', 'vikram.iyer@proptattva.com', 'AA', '+91 98450 10003', 3),
  u('U-OWN-1', 'OWN-1', 'Meera Kapoor', 'northstar@owner.com', 'Owner/Developer', '+91 98860 20001', 0),
  u('U-OWN-1B', 'OWN-1', 'Arjun Menon', 'arjun.menon@northstar.example', 'Owner/Developer', '+91 98860 20002', 9),
  u('U-OWN-2', 'OWN-2', 'Rahul Desai', 'meridian@owner.com', 'Owner/Developer', '+91 99000 30001', 2),
  u('U-OWN-2B', 'OWN-2', 'Sana Qureshi', 'sana.q@meridian.example', 'Owner/Developer', null, 30, 'Disabled'),
  u('U-OWN-3', 'OWN-3', 'Kavya Reddy', 'trinity@owner.com', 'Owner/Developer', '+91 97400 40001', 4),
  u('U-OWN-3B', 'OWN-3', 'Nikhil Shetty', 'nikhil@trinity.example', 'Owner/Developer', '+91 97400 40002', 12),
  u('U-OWN-4', 'OWN-4', 'Farah Khan', 'farah@harbour.example', 'Owner/Developer', null, null, 'Invited'),
  u('U-OCC-1', 'OCC-1', 'Priya Nair', 'priya.nair@acmegcc.example', 'Occupier', '+91 99860 50001', 5),
  u('U-ENB-1', 'ENB-1', 'Rohan Shah', 'rohan@crestline.example', 'Enabler', '+91 98200 60001', 1),
  u('U-ENB-2', 'ENB-2', 'Dev Malhotra', 'dev@atlas.example', 'Enabler', null, 40),
]

const invites: Invite[] = [
  // Trinity is on Owner Starter (3 seats): 2 users + this pending invite = full, so the next invite is blocked.
  { invite_id: 'INV-001', org_id: 'OWN-3', email: 'leasing@trinity.example', role: 'Owner/Developer', token: 'tk_8f2a91c4', expires_at: iso(5), status: 'Pending' },
  { invite_id: 'INV-002', org_id: 'OWN-1', email: 'cfo@northstar.example', role: 'Owner/Developer', token: 'tk_3be07d51', expires_at: iso(6), status: 'Pending' },
  { invite_id: 'INV-003', org_id: 'OWN-2', email: 'ops@meridian.example', role: 'Owner/Developer', token: 'tk_c91e44aa', expires_at: iso(-3), status: 'Pending' },
  { invite_id: 'INV-004', org_id: 'OCC-1', email: 'facilities@acmegcc.example', role: 'Occupier', token: 'tk_77d0b2e9', expires_at: iso(-20), status: 'Accepted' },
  { invite_id: 'INV-005', org_id: 'ORG-PT', email: 'new.analyst@proptattva.com', role: 'AA', token: 'tk_5a6f13c0', expires_at: iso(4), status: 'Pending' },
]

function seedAudit(): AuditEntry[] {
  let n = 0
  const e = (daysAgo: number, user_id: string, org_id: string | null, entity: string, entity_id: string, entity_label: string, action: AuditEntry['action'], before: AuditEntry['before'], after: AuditEntry['after']): AuditEntry => ({
    audit_id: `AUD-SEED-${String(++n).padStart(3, '0')}`,
    org_id, user_id, on_behalf_of: null, entity, entity_id, entity_label, action, before, after,
    source_tag: 'Manual', timestamp: iso(-daysAgo),
  })
  return [
    e(120, 'U-ADMIN', 'OWN-1', 'Organisation', 'OWN-1', 'Northstar Estates', 'Create', null, { name: 'Northstar Estates', type: 'Owner', status: 'Active' }),
    e(120, 'U-ADMIN', 'OWN-1', 'Subscription', 'SUB-OWN-1', 'Northstar Estates · Owner Enterprise', 'Create', null, { plan_code: 'OWNER_ENTERPRISE', seat_limit: 50, status: 'Active' }),
    e(90, 'U-ADMIN', 'OWN-3', 'Organisation', 'OWN-3', 'Trinity Realty', 'Create', null, { name: 'Trinity Realty', type: 'Owner', status: 'Active' }),
    e(40, 'U-ADMIN', 'OWN-2', 'Subscription', 'SUB-OWN-2', 'Meridian Developers · Owner Growth', 'Update', { plan_code: 'OWNER_STARTER', seat_limit: 3 }, { plan_code: 'OWNER_GROWTH', seat_limit: 10 }),
    e(30, 'U-OWN-2', 'OWN-2', 'User', 'U-OWN-2B', 'Sana Qureshi', 'Update', { status: 'Active' }, { status: 'Disabled' }),
    e(12, 'U-ADMIN', 'ENB-2', 'Organisation', 'ENB-2', 'Atlas Brokerage', 'Update', { status: 'Active' }, { status: 'Suspended' }),
    e(6, 'U-ADMIN', 'OWN-4', 'Organisation', 'OWN-4', 'Harbour Holdings', 'Create', null, { name: 'Harbour Holdings', type: 'Owner', status: 'Pending' }),
    e(5, 'U-OWN-3', 'OWN-3', 'Invite', 'INV-001', 'leasing@trinity.example', 'Create', null, { email: 'leasing@trinity.example', role: 'Owner/Developer', status: 'Pending' }),
    e(1, 'U-AA-1', 'ORG-PT', 'Session', 'U-AA-1', 'Ananya Rao', 'Login', null, null),
  ]
}

export function createSeed(): PlatformDb {
  const assets = createAssetSeed()
  // Mandate/parking seed adjusts assets in place (grades from AA scorecards, lease parking slots).
  const phase4 = createMandateSeed(assets)
  return {
    organisations: structuredClone(organisations),
    users: structuredClone(users),
    invites: structuredClone(invites),
    plans: structuredClone(plans),
    subscriptions: structuredClone(subscriptions),
    audit_log: seedAudit(),
    ...assets,
    ...phase4,
  }
}
