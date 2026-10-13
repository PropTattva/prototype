// The mock "server". Every screen reads and writes through these async functions, which enforce
// role × row scope × field visibility × plan limits and write the audit log — as a real backend would.
// Swapping in a real API later means re-implementing this file only.
import { can, canSeeField, featureLabel, FEATURES, grantFor, type Action } from '../access/policy'
import type { Session } from '../access/session'
import type { Building } from '../domain/assets'
import type { Lease } from '../domain/leasing'
import type { AuditEntry, Invite, PlatformDb, User } from '../domain/platform'
import { REGISTRY, seatUsage } from '../entities/registry'
import type { EntityDef, EntityKey, OptionCtx, Rec } from '../entities/types'
import { addMonths, daysFromToday, quarterOf, todayIso } from '../lib/dates'
import { readDb, resetDb, writeDb } from './store'

export type ApiErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'QUOTA' | 'PLAN' | 'CONFLICT' | 'READ_ONLY' | 'AUTH'

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message)
  }
}

const COLLECTION: Record<EntityKey, keyof PlatformDb> = {
  organisation: 'organisations',
  user: 'users',
  invite: 'invites',
  plan: 'plans',
  subscription: 'subscriptions',
  campus: 'campuses',
  owner: 'owners',
  building: 'buildings',
  floor: 'floors',
  unit: 'units',
  buildingAmenity: 'building_amenities',
  campusAmenity: 'campus_amenities',
  image: 'images',
  document: 'documents',
  certification: 'certifications',
  ownershipHistory: 'ownership_history',
  ownerContact: 'owner_contacts',
  documentShare: 'document_shares',
  occupier: 'occupiers',
  lease: 'leases',
  leaseSpace: 'lease_spaces',
  renewal: 'renewals',
  leaseDoc: 'lease_docs',
  rent: 'rent_invoices',
  brokerLog: 'broker_log',
  relationshipLog: 'relationship_log',
}

const rows = (db: PlatformDb, key: EntityKey) => db[COLLECTION[key]] as unknown as Rec[]
const now = () => new Date().toISOString()
const isLive = (s: { status: string }) => s.status === 'Active' || s.status === 'Trial'

// ---------------------------------------------------------------- sessions

export function resolveSession(userId: string, actorId: string = userId): Session | null {
  const db = readDb()
  const user = db.users.find((u) => u.user_id === userId)
  const actor = db.users.find((u) => u.user_id === actorId)
  const org = user && db.organisations.find((o) => o.org_id === user.org_id)
  if (!user || !actor || !org) return null
  const subscription = db.subscriptions.find((s) => s.org_id === org.org_id && isLive(s)) ?? null
  const plan = subscription ? db.plans.find((p) => p.plan_code === subscription.plan_code) ?? null : null
  return { user, org, role: user.role, subscription, plan, actor, readOnly: actorId !== userId }
}

/** Why a user may not sign in, or null if they can. */
export function signInBlocker(user: User): string | null {
  const org = readDb().organisations.find((o) => o.org_id === user.org_id)
  if (user.status === 'Disabled') return 'User is disabled'
  if (user.status === 'Invited') return 'Invite not yet accepted'
  if (org?.status === 'Suspended') return 'Organisation suspended'
  if (org?.status === 'Pending') return 'Organisation pending activation'
  return null
}

/** Directory used by the login screen and persona switcher (pre-auth, so unscoped by design). */
export async function listSignInDirectory() {
  const db = readDb()
  return db.users.map((u) => {
    const org = db.organisations.find((o) => o.org_id === u.org_id)!
    const sub = db.subscriptions.find((s) => s.org_id === u.org_id && isLive(s))
    const plan = sub && db.plans.find((p) => p.plan_code === sub.plan_code)
    return { user: u, org, planName: plan?.name ?? null, blocker: signInBlocker(u) }
  })
}

export async function signIn(userId: string): Promise<void> {
  const user = readDb().users.find((u) => u.user_id === userId)
  if (!user) throw new ApiError('AUTH', 'Unknown user')
  const blocker = signInBlocker(user)
  if (blocker) throw new ApiError('AUTH', blocker)
  writeDb((db) => {
    const u = db.users.find((x) => x.user_id === userId)!
    u.last_login = now()
    db.audit_log.push(audit(user, user.org_id, 'Session', user.user_id, user.name, 'Login', null, null))
  })
}

/** View as (EP-C-S03): Super Admin only, read-only, and the impersonation itself is audited as a sensitive read. */
export async function startViewAs(session: Session, targetUserId: string): Promise<void> {
  if (session.actor.role !== 'Super Admin') throw new ApiError('FORBIDDEN', 'Only Super Admin can use View as.')
  const target = readDb().users.find((u) => u.user_id === targetUserId)
  if (!target) throw new ApiError('NOT_FOUND', 'User not found')
  writeDb((db) => {
    db.audit_log.push(audit(session.actor, target.org_id, 'User', target.user_id, `View as ${target.name}`, 'Read', null, null))
  })
}

export function resetDemoData() {
  resetDb()
}

// ---------------------------------------------------------------- access helpers

function audit(actor: User, orgId: string | null, entity: string, entityId: string, label: string, action: AuditEntry['action'], before: Rec | null, after: Rec | null): AuditEntry {
  return {
    audit_id: `AUD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    org_id: orgId,
    user_id: actor.user_id,
    on_behalf_of: null,
    entity,
    entity_id: entityId,
    entity_label: label,
    action,
    before,
    after,
    source_tag: actor.user_id === 'SYSTEM' ? 'System' : 'Manual',
    timestamp: now(),
  }
}

const SYSTEM: User = { user_id: 'SYSTEM', org_id: 'ORG-PT', name: 'System', email: '', phone: null, role: 'Super Admin', status: 'Active', last_login: null }

/** Facts needed to decide mandated / published scope, computed once per request. */
interface ScopeFacts {
  mandated: Set<string>
  published: Set<string>
  leaseBuilding: Map<string, string>
  floorBuilding: Map<string, string>
  campusBuildings: Map<string, string[]>
}

function scopeFacts(db: PlatformDb): ScopeFacts {
  const campusBuildings = new Map<string, string[]>()
  for (const b of db.buildings) if (b.campus_id) campusBuildings.set(b.campus_id, [...(campusBuildings.get(b.campus_id) ?? []), b.building_id])
  return {
    mandated: new Set(db.mandates.filter((m) => m.status === 'Active').map((m) => m.building_id)),
    published: new Set(db.buildings.filter((b) => b.published && b.status !== 'Inactive').map((b) => b.building_id)),
    leaseBuilding: new Map(db.leases.map((l) => [l.lease_id, l.building_id])),
    floorBuilding: new Map(db.floors.map((f) => [f.floor_id, f.building_id])),
    campusBuildings,
  }
}

function buildingsOf(def: EntityDef, rec: Rec, f: ScopeFacts): string[] {
  switch (def.scopeVia) {
    case 'self-building':
    case 'building':
      return rec.building_id ? [rec.building_id] : []
    case 'lease': {
      const b = f.leaseBuilding.get(rec.lease_id)
      return b ? [b] : []
    }
    case 'floor': {
      const b = f.floorBuilding.get(rec.floor_id)
      return b ? [b] : []
    }
    case 'self-campus':
    case 'campus':
      return f.campusBuildings.get(rec.campus_id) ?? []
    default:
      return []
  }
}

function isMandated(def: EntityDef, rec: Rec, f: ScopeFacts) {
  return buildingsOf(def, rec, f).some((b) => f.mandated.has(b))
}

function inRowScope(def: EntityDef, s: Session, rec: Rec, f: ScopeFacts) {
  const scope = grantFor(def.capability, s.role)?.scope
  switch (scope) {
    case 'all':
      return true
    case 'own-org':
      return !def.orgKey || rec[def.orgKey] === s.org.org_id
    case 'mandated':
      return isMandated(def, rec, f)
    case 'published':
      return !!def.publicReadable && buildingsOf(def, rec, f).some((b) => f.published.has(b)) && (def.publicRowFilter?.(rec) ?? true)
    case 'own-broker':
      return rec.broker_org_id === s.org.org_id
    default:
      return false
  }
}

/** Strip fields the viewer may not see — removed from the payload, not just hidden (EP-B-S01). */
function project(def: EntityDef, s: Session, rec: Rec, f: ScopeFacts): Rec {
  const recordOrg = def.orgKey ? rec[def.orgKey] : null
  const mandated = s.role === 'AA' && isMandated(def, rec, f)
  const out: Rec = { ...rec }
  for (const fd of def.fields) {
    if (fd.visibility && !canSeeField(fd.visibility, { role: s.role, org_id: s.org.org_id }, recordOrg, mandated)) delete out[fd.key]
  }
  return out
}

function requireGrant(def: EntityDef, s: Session, action: Action) {
  if (!can(def.capability, s.role, action)) {
    const verb = { C: 'create', R: 'view', U: 'edit', D: 'delete' }[action]
    throw new ApiError('FORBIDDEN', `${s.role} cannot ${verb} ${def.plural.toLowerCase()}.`)
  }
  if (action === 'R' && grantFor(def.capability, s.role)?.scope === 'published' && !def.publicReadable)
    throw new ApiError('FORBIDDEN', `${def.plural} are not shared with ${s.role.toLowerCase()}s.`)
}

/** Plan gating (EP-B-S03). Internal roles are not subscription-gated (§7.3); features only gate their own org type. */
export function hasFeature(s: Session, feature: string) {
  if (s.role === 'Super Admin' || s.role === 'AA') return true
  const f = FEATURES.find((x) => x.key === feature)
  if (!f || f.for !== s.org.type) return true
  return !!s.plan?.feature_flags.includes(feature)
}

function requireFeature(def: EntityDef, s: Session) {
  if (def.feature && !hasFeature(s, def.feature))
    throw new ApiError('PLAN', `${featureLabel(def.feature)} is not included in ${s.plan?.name ?? 'your plan'}. Upgrade to use ${def.plural.toLowerCase()}.`)
}

function requireWritable(s: Session) {
  if (s.readOnly) throw new ApiError('READ_ONLY', 'View as is read-only. Exit View as to make changes.')
}

function requireSeat(db: PlatformDb, orgId: string) {
  const u = seatUsage(db, orgId)
  if (u.limit != null && u.used >= u.limit) {
    const plan = db.plans.find((p) => p.plan_code === u.subscription?.plan_code)
    throw new ApiError(
      'QUOTA',
      `Seat limit reached: ${u.used} of ${u.limit} seats used on ${plan?.name ?? 'this plan'} (${u.users} user${u.users === 1 ? '' : 's'} + ${u.pending} pending invite${u.pending === 1 ? '' : 's'}). Upgrade the plan or free a seat.`,
    )
  }
}

/** Plan quota on buildings per owner org (§7.3). */
export function buildingQuota(db: PlatformDb, orgId: string) {
  const sub = db.subscriptions.find((s) => s.org_id === orgId && isLive(s))
  const plan = sub && db.plans.find((p) => p.plan_code === sub.plan_code)
  const used = db.buildings.filter((b) => b.org_id === orgId).length
  const limit = plan ? plan.quotas.buildings ?? null : null
  return { used, limit, planName: plan?.name ?? null }
}

/** Customers can only create records in their own org / firm. Done before derive, which may override from the parent. */
function lockOwnership(def: EntityDef, s: Session, draft: Rec) {
  const scope = grantFor(def.capability, s.role)?.scope
  if (scope === 'own-org' && def.orgKey) draft[def.orgKey] = s.org.org_id
  if (scope === 'own-broker') draft.broker_org_id = s.org.org_id
}

/** Every visible collection, scoped and projected for the viewer — ignores plan gating (lookups only). */
function visible(key: EntityKey, s: Session, db: PlatformDb, f: ScopeFacts): Rec[] {
  const def = REGISTRY[key]
  const g = grantFor(def.capability, s.role)
  if (!g?.actions.includes('R')) return []
  if (g.scope === 'published' && !def.publicReadable) return []
  return rows(db, key).filter((r) => inRowScope(def, s, r, f)).map((r) => project(def, s, r, f))
}

function scopedCtx(s: Session, db: PlatformDb): OptionCtx {
  const f = scopeFacts(db)
  const internal = s.role === 'Super Admin' || s.role === 'AA'
  return {
    // Org names label records (building owner, broker firm): customers see their own org, broker firms,
    // and the orgs owning buildings they can see.
    organisations: internal
      ? db.organisations
      : db.organisations.filter((o) => o.org_id === s.org.org_id || o.type === 'Enabler' || db.buildings.some((b) => b.org_id === o.org_id && f.published.has(b.building_id))),
    plans: db.plans,
    campuses: visible('campus', s, db, f) as OptionCtx['campuses'],
    owners: visible('owner', s, db, f) as OptionCtx['owners'],
    buildings: visible('building', s, db, f) as OptionCtx['buildings'],
    floors: visible('floor', s, db, f) as OptionCtx['floors'],
    units: visible('unit', s, db, f) as OptionCtx['units'],
    occupiers: visible('occupier', s, db, f) as OptionCtx['occupiers'],
    leases: visible('lease', s, db, f) as OptionCtx['leases'],
    documents: visible('document', s, db, f) as OptionCtx['documents'],
    users: s.role === 'Super Admin' ? db.users : db.users.filter((u) => u.org_id === s.org.org_id || (s.role === 'AA' && u.org_id === 'ORG-PT')),
  }
}

/** Lookup lists for dropdowns and labels, already scoped and projected for this viewer. */
export async function getOptionCtx(s: Session): Promise<OptionCtx> {
  return scopedCtx(s, readDb())
}

function validate(def: EntityDef, db: PlatformDb, draft: Rec, mode: 'create' | 'edit', original: Rec | null, s: Session) {
  const errors: Record<string, string> = {}
  // Dropdown choices are computed from what the viewer can see, so a ref outside their scope is rejected.
  const ctx = scopedCtx(s, db)
  for (const f of def.fields) {
    if (f.system || (f.showIf && !f.showIf(draft))) continue
    const v = draft[f.key]
    const empty = v == null || v === '' || (Array.isArray(v) && !v.length)
    if (f.required && empty) {
      errors[f.key] = `${f.label} is required.`
      continue
    }
    if (empty) continue
    if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors[f.key] = 'Enter a valid email address.'
    if (f.type === 'phone' && !/^\+?[\d\s-]{8,16}$/.test(v)) errors[f.key] = 'Enter a valid phone number.'
    if (['int', 'money', 'decimal', 'percent'].includes(f.type) && (!Number.isFinite(v) || v < 0)) errors[f.key] = 'Must be zero or more.'
    if (f.type === 'int' && !Number.isInteger(v)) errors[f.key] = 'Must be a whole number.'
    if (f.type === 'percent' && v > 100) errors[f.key] = 'Must be 100% or less.'
    const unchanged = mode === 'edit' && original && original[f.key] === v
    if ((f.type === 'enum' || f.type === 'ref') && f.options && !unchanged) {
      const opts = typeof f.options === 'function' ? f.options(draft, ctx).map((o) => o.value) : f.options
      if (!opts.includes(v)) errors[f.key] = `Choose a valid ${f.label.toLowerCase()}.`
    }
  }
  for (const key of def.unique ?? []) {
    const v = String(draft[key] ?? '').toLowerCase()
    if (v && rows(db, def.key).some((r) => String(r[key]).toLowerCase() === v && r[def.idKey] !== original?.[def.idKey]))
      errors[key] ??= `${def.fields.find((f) => f.key === key)?.label ?? key} is already in use.`
  }
  for (const [k, msg] of Object.entries(def.validate?.(draft, db, mode, original) ?? {})) if (msg) errors[k] ??= msg
  if (Object.keys(errors).length) throw new ApiError('VALIDATION', 'Please fix the highlighted fields.', errors)
}

function diff(before: Rec, after: Rec) {
  const b: Rec = {}
  const a: Rec = {}
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (k === 'data_url') continue
    if (JSON.stringify(after[k]) !== JSON.stringify(before[k])) {
      b[k] = before[k]
      a[k] = after[k]
    }
  }
  return { before: b, after: a }
}

/** Audit payloads never carry image data (keeps the log small). */
const auditable = (rec: Rec) => {
  const { data_url: _omit, ...rest } = rec
  return rest
}

// ---------------------------------------------------------------- generic CRUD

export type ListWhere = Record<string, string | null | undefined>

export async function list(key: EntityKey, s: Session, where: ListWhere = {}): Promise<Rec[]> {
  const def = REGISTRY[key]
  requireGrant(def, s, 'R')
  requireFeature(def, s)
  if (key === 'invite') sweepExpiredInvites()
  const db = readDb()
  const f = scopeFacts(db)
  const filters = Object.entries(where).filter(([, v]) => v !== undefined)
  return rows(db, key)
    .filter((r) => filters.every(([k, v]) => r[k] === v) && inRowScope(def, s, r, f))
    .map((r) => project(def, s, r, f))
}

export async function get(key: EntityKey, id: string, s: Session): Promise<Rec> {
  const def = REGISTRY[key]
  requireGrant(def, s, 'R')
  requireFeature(def, s)
  const db = readDb()
  const f = scopeFacts(db)
  const rec = rows(db, key).find((r) => r[def.idKey] === id)
  if (!rec || !inRowScope(def, s, rec, f)) throw new ApiError('NOT_FOUND', `${def.label} not found.`)
  return project(def, s, rec, f)
}

export async function create(key: EntityKey, input: Rec, s: Session): Promise<Rec> {
  const def = REGISTRY[key]
  requireWritable(s)
  requireGrant(def, s, 'C')
  requireFeature(def, s)
  const db = readDb()
  const draft: Rec = { ...input }
  // Every field exists on a stored record (null when empty): a missing key means "hidden", never "unset".
  for (const f of def.fields) {
    if (f.system && f.key !== def.idKey) delete draft[f.key]
    if (draft[f.key] === undefined) draft[f.key] = f.type === 'bool' ? false : null
  }
  if (def.idKey !== 'plan_code') draft[def.idKey] = def.newId()
  lockOwnership(def, s, draft)

  if (key === 'organisation') draft.created_at = now()
  if (key === 'invite') {
    draft.status = 'Pending'
    draft.token = `tk_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
    draft.expires_at = new Date(Date.now() + 7 * 86_400_000).toISOString()
  }
  if (key === 'user') draft.last_login = null
  if (key === 'subscription' && (draft.seat_limit == null || draft.seat_limit === ''))
    draft.seat_limit = db.plans.find((p) => p.plan_code === draft.plan_code)?.default_seat_limit ?? null

  def.derive?.(draft, db, 'create', null)
  // The new record must land inside the creator's own scope (own org, mandated building, own firm).
  if (grantFor(def.capability, s.role)?.scope !== 'all' && !inRowScope(def, s, draft, scopeFacts(db)))
    throw new ApiError('FORBIDDEN', `You can only add ${def.plural.toLowerCase()} within your own scope.`)
  validate(def, db, draft, 'create', null, s)

  if ((key === 'user' && draft.status !== 'Disabled') || key === 'invite') requireSeat(db, draft.org_id)
  if (key === 'building') {
    const q = buildingQuota(db, draft.org_id)
    if (q.limit != null && q.used >= q.limit)
      throw new ApiError('QUOTA', `Building limit reached: ${q.used} of ${q.limit} buildings on ${q.planName}. Upgrade the plan to register more buildings.`)
  }
  if (key === 'brokerLog') {
    const sub = db.subscriptions.find((x) => x.org_id === draft.broker_org_id && isLive(x))
    const quota = db.plans.find((p) => p.plan_code === sub?.plan_code)?.quotas.intro_registrations
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const used = db.broker_log.filter((l) => l.broker_org_id === draft.broker_org_id && l.timestamp >= since).length
    if (quota != null && used >= quota) throw new ApiError('QUOTA', `Introduction limit reached: ${used} of ${quota} this month. Upgrade to Broker Pro for more registrations.`)
  }

  writeDb((d) => {
    rows(d, key).push(draft)
    def.afterWrite?.(draft, d, 'create', null)
    d.audit_log.push(audit(s.actor, def.orgKey ? draft[def.orgKey] : null, def.name, draft[def.idKey], def.title(draft, scopedCtx(s, d)), 'Create', null, auditable(draft)))
  })
  return project(def, s, draft, scopeFacts(readDb()))
}

export async function update(key: EntityKey, id: string, patch: Rec, s: Session): Promise<Rec> {
  const def = REGISTRY[key]
  requireWritable(s)
  requireGrant(def, s, 'U')
  requireFeature(def, s)
  if (def.immutable) throw new ApiError('CONFLICT', `${def.plural} cannot be changed once recorded.`)
  const db = readDb()
  const f = scopeFacts(db)
  const original = rows(db, key).find((r) => r[def.idKey] === id)
  if (!original || !inRowScope(def, s, original, f)) throw new ApiError('NOT_FOUND', `${def.label} not found.`)
  const seen = project(def, s, original, f)
  const mandated = s.role === 'AA' && isMandated(def, original, f)

  const draft: Rec = { ...original }
  for (const fd of def.fields) {
    if (!(fd.key in patch) || fd.system || fd.createOnly) continue
    if (fd.adminOnly && s.role !== 'Super Admin') continue
    // A field the viewer cannot see cannot be changed by them either.
    if (fd.visibility && !canSeeField(fd.visibility, { role: s.role, org_id: s.org.org_id }, def.orgKey ? original[def.orgKey] : null, mandated)) continue
    draft[fd.key] = patch[fd.key]
  }
  if (key === 'organisation' && draft.type !== 'Enabler') draft.enabler_type = null
  if (key === 'user' && id === s.actor.user_id && draft.status !== 'Active')
    throw new ApiError('VALIDATION', 'You cannot disable your own account.', { status: 'You cannot disable yourself.' })

  def.derive?.(draft, db, 'edit', original)
  validate(def, db, draft, 'edit', original, s)
  if (key === 'user' && original.status === 'Disabled' && draft.status !== 'Disabled') requireSeat(db, draft.org_id)

  const change = diff(original, draft)
  if (!Object.keys(change.after).length) return seen

  writeDb((d) => {
    const list = rows(d, key)
    list[list.findIndex((r) => r[def.idKey] === id)] = draft
    def.afterWrite?.(draft, d, 'edit', original)
    d.audit_log.push(audit(s.actor, def.orgKey ? draft[def.orgKey] : null, def.name, id, def.title(draft, scopedCtx(s, d)), 'Update', change.before, change.after))
  })
  return project(def, s, draft, scopeFacts(readDb()))
}

export async function remove(key: EntityKey, id: string, s: Session): Promise<void> {
  const def = REGISTRY[key]
  requireWritable(s)
  requireGrant(def, s, 'D')
  requireFeature(def, s)
  if (def.immutable) throw new ApiError('CONFLICT', `${def.plural} cannot be deleted.`)
  const db = readDb()
  const rec = rows(db, key).find((r) => r[def.idKey] === id)
  if (!rec || !inRowScope(def, s, rec, scopeFacts(db))) throw new ApiError('NOT_FOUND', `${def.label} not found.`)
  if (key === 'user' && id === s.actor.user_id) throw new ApiError('CONFLICT', 'You cannot delete your own account.')
  const blockers = def.blockers?.(rec, db) ?? []
  if (blockers.length) throw new ApiError('CONFLICT', `Cannot delete: referenced by ${blockers.join(', ')}. ${def.deleteHint ?? ''}`.trim())

  writeDb((d) => {
    const list = rows(d, key)
    list.splice(list.findIndex((r) => r[def.idKey] === id), 1)
    def.afterWrite?.(rec, d, 'delete', rec)
    d.audit_log.push(audit(s.actor, def.orgKey ? rec[def.orgKey] : null, def.name, id, def.title(rec, scopedCtx(s, d)), 'Delete', auditable(rec), null))
  })
}

/** Pre-flight for the delete dialog: what would block this delete. */
export async function deleteBlockers(key: EntityKey, id: string, _s: Session): Promise<string[]> {
  const db = readDb()
  const def = REGISTRY[key]
  const rec = rows(db, key).find((r) => r[def.idKey] === id)
  return rec ? def.blockers?.(rec, db) ?? [] : []
}

/** What the current viewer may do with an entity — for showing or hiding controls. */
export function permissions(key: EntityKey, s: Session) {
  const def = REGISTRY[key]
  const featureOk = !def.feature || hasFeature(s, def.feature)
  const ok = (a: Action) => can(def.capability, s.role, a) && featureOk && !s.readOnly
  const publicOnly = grantFor(def.capability, s.role)?.scope === 'published'
  return {
    create: ok('C'),
    update: ok('U') && !def.immutable,
    remove: ok('D') && !def.immutable,
    read: can(def.capability, s.role, 'R') && featureOk && (!publicOnly || !!def.publicReadable),
  }
}

// ---------------------------------------------------------------- invite workflow (EP-A-S03)

function sweepExpiredInvites() {
  const t = now()
  const stale = readDb().invites.filter((i) => i.status === 'Pending' && i.expires_at < t)
  if (!stale.length) return
  writeDb((db) => {
    for (const i of db.invites) {
      if (i.status === 'Pending' && i.expires_at < t) {
        i.status = 'Expired'
        db.audit_log.push(audit(SYSTEM, i.org_id, 'Invite', i.invite_id, i.email, 'Update', { status: 'Pending' }, { status: 'Expired' }))
      }
    }
  })
}

async function inviteFor(id: string, s: Session): Promise<Invite> {
  return (await get('invite', id, s)) as Invite
}

async function setInviteStatus(id: string, status: Invite['status'], s: Session) {
  writeDb((d) => {
    const i = d.invites.find((x) => x.invite_id === id)!
    const before = { status: i.status }
    i.status = status
    d.audit_log.push(audit(s.actor, i.org_id, 'Invite', id, i.email, 'Update', before, { status }))
  })
}

export async function revokeInvite(id: string, s: Session) {
  requireWritable(s)
  requireGrant(REGISTRY.invite, s, 'U')
  const inv = await inviteFor(id, s)
  if (inv.status !== 'Pending') throw new ApiError('CONFLICT', `Only pending invites can be revoked (this one is ${inv.status}).`)
  await setInviteStatus(id, 'Revoked', s)
}

export async function resendInvite(id: string, s: Session) {
  requireWritable(s)
  requireGrant(REGISTRY.invite, s, 'U')
  const inv = await inviteFor(id, s)
  if (inv.status === 'Accepted') throw new ApiError('CONFLICT', 'This invite was already accepted.')
  if (inv.status !== 'Pending') requireSeat(readDb(), inv.org_id)
  writeDb((d) => {
    const i = d.invites.find((x) => x.invite_id === id)!
    const before = { status: i.status, expires_at: i.expires_at }
    i.status = 'Pending'
    i.token = `tk_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
    i.expires_at = new Date(Date.now() + 7 * 86_400_000).toISOString()
    d.audit_log.push(audit(s.actor, i.org_id, 'Invite', id, i.email, 'Update', before, { status: i.status, expires_at: i.expires_at }))
  })
}

/** Demo shortcut for the invitee clicking the emailed link: creates the user and consumes the reserved seat. */
export async function acceptInvite(id: string, s: Session, name: string) {
  requireWritable(s)
  requireGrant(REGISTRY.invite, s, 'U')
  const inv = await inviteFor(id, s)
  if (inv.status !== 'Pending') throw new ApiError('CONFLICT', `This invite is ${inv.status}.`)
  if (!name.trim()) throw new ApiError('VALIDATION', 'Name is required.', { name: 'Name is required.' })
  const newUser: User = { user_id: REGISTRY.user.newId(), org_id: inv.org_id, name: name.trim(), email: inv.email, phone: null, role: inv.role, status: 'Active', last_login: null }
  writeDb((d) => {
    const i = d.invites.find((x) => x.invite_id === id)!
    i.status = 'Accepted'
    d.users.push(newUser)
    d.audit_log.push(audit(s.actor, i.org_id, 'Invite', id, i.email, 'Update', { status: 'Pending' }, { status: 'Accepted' }))
    d.audit_log.push(audit(s.actor, i.org_id, 'User', newUser.user_id, newUser.name, 'Create', null, newUser as unknown as Rec))
  })
  return newUser
}

// ---------------------------------------------------------------- leasing workflows

export interface LeaseSpaceInput {
  floor_id: string
  unit_id: string | null
  area: number
}

/** Lease wizard: creates the lease and its spaces together; floors become Leased / Partially leased. */
export async function createLease(input: Rec, spaces: LeaseSpaceInput[], s: Session): Promise<Rec> {
  if (!spaces.length) throw new ApiError('VALIDATION', 'Choose at least one floor.', { spaces: 'Choose at least one floor.' })
  const db = readDb()
  const floorIds = new Set(db.floors.filter((f) => f.building_id === input.building_id).map((f) => f.floor_id))
  if (spaces.some((x) => !floorIds.has(x.floor_id))) throw new ApiError('VALIDATION', 'All floors must be in the chosen building.', { spaces: 'All floors must be in the chosen building.' })
  if (spaces.some((x) => !(x.area > 0))) throw new ApiError('VALIDATION', 'Every floor needs a leased area.', { spaces: 'Every floor needs a leased area.' })
  const area = spaces.reduce((sum, x) => sum + x.area, 0)
  const lease = await create('lease', { ...input, floor_id: spaces[0].floor_id, unit_id: spaces[0].unit_id, area }, s)
  for (const sp of spaces) await create('leaseSpace', { lease_id: lease.lease_id, ...sp }, s)
  return lease
}

/** E2-S11: GST invoice for one month of rent + CAM on a lease. */
export async function generateInvoice(leaseId: string, period: string, s: Session) {
  const l = (await get('lease', leaseId, s)) as Lease
  if (l.rent == null) throw new ApiError('FORBIDDEN', 'Rent is not visible to you for this lease.')
  if (readDb().rent_invoices.some((i) => i.lease_id === leaseId && i.period === period))
    throw new ApiError('CONFLICT', `An invoice for ${period} already exists on this lease.`)
  return create(
    'rent',
    {
      lease_id: leaseId,
      invoice_no: `${l.org_id.replace('-', '')}/${period.replace('-', '')}/${leaseId.replace(/^LSE-/, '')}`,
      period,
      amount: Math.round(((l.rent ?? 0) + (l.CAM ?? 0)) * l.area),
      gst: 18,
      paid_amount: 0,
      paid_date: null,
      due_date: `${period}-10`,
      source_tag: 'Manual',
    },
    s,
  )
}

export async function recordPayment(rentId: string, amount: number, date: string, s: Session) {
  const inv = await get('rent', rentId, s)
  return update('rent', rentId, { paid_amount: (inv.paid_amount ?? 0) + amount, paid_date: date }, s)
}

// ---------------------------------------------------------------- read models (stacking, availability, comparables)

export type StackStatus = 'Occupied' | 'Expiring' | 'Partial' | 'Vacant' | 'Self-use' | 'Parking'

export interface StackCell {
  floor_id: string
  floor_no: string
  wing: string | null
  area: number | null
  status: StackStatus
  /** Occupier name, "Leased" when masked, or the self-occupying entity */
  label: string
  masked: boolean
  lease_id: string | null
  rent: number | null
  expiry: string | null
  vacancy_days: number | null
}

/** E4-S03: floor-by-floor stacking plan, tenant masked for anyone who cannot read leases. */
export async function stackingPlan(buildingIds: string[], s: Session) {
  const db = readDb()
  const ctx = scopedCtx(s, db)
  const canLeases = can('leases', s.role, 'R')
  const occ = new Map(db.occupiers.map((o) => [o.occupier_id, o.name]))
  const visibleLeases = new Map(ctx.leases.filter((l) => l.status === 'Active').map((l) => [l.lease_id, l]))
  const spaces = db.lease_spaces.filter((sp) => visibleLeases.has(sp.lease_id))
  const soon = addMonths(todayIso(), 12)
  return buildingIds
    .map((id) => ctx.buildings.find((b) => b.building_id === id))
    .filter((b): b is Building => !!b)
    .map((b) => {
      const cells: StackCell[] = ctx.floors
        .filter((f) => f.building_id === b.building_id)
        .map((f) => {
          const sp = spaces.find((x) => x.floor_id === f.floor_id)
          const lease = sp ? visibleLeases.get(sp.lease_id) : undefined
          const vacant = f.occupancy_type === 'Vacant'
          let status: StackStatus = 'Occupied'
          if (f.floor_use === 'Parking') status = 'Parking'
          else if (f.occupancy_type === 'Self-occupied') status = 'Self-use'
          else if (vacant) status = 'Vacant'
          else if (f.occupancy_type === 'Partially leased') status = 'Partial'
          else if (lease && lease.expiry <= soon) status = 'Expiring'
          const masked = !canLeases && (status === 'Occupied' || status === 'Expiring' || status === 'Partial')
          const label =
            status === 'Parking' ? 'MLCP' : status === 'Self-use' ? f.self_occupied_entity ?? 'Self-use' : vacant ? 'Vacant' : masked || !lease ? 'Leased' : occ.get(lease.occupier_id) ?? 'Leased'
          return {
            floor_id: f.floor_id,
            floor_no: f.floor_no,
            wing: f.wing,
            area: f.chargeable_area,
            status,
            label,
            masked,
            lease_id: lease?.lease_id ?? null,
            rent: lease?.rent ?? null,
            expiry: lease?.expiry ?? null,
            vacancy_days: f.vacant_since ? -daysFromToday(f.vacant_since) : null,
          }
        })
      return { building: b, cells }
    })
}

export interface AvailabilityRow {
  key: string
  building_id: string
  building: string
  campus: string | null
  city: string
  micro_market: string
  grade: string | null
  space: string
  area: number
  handover: string
  available_from: string | null
  asking_rent: number | null
  vacancy_days: number | null
  kind: 'Floor' | 'Part floor' | 'Whole building'
}

/** E4-S01: vacant floors (with vacancy age), part-leased floors and pre-OC buildings on the market. */
export async function availability(s: Session): Promise<AvailabilityRow[]> {
  const db = readDb()
  const ctx = scopedCtx(s, db)
  const campus = (id: string | null) => db.campuses.find((c) => c.campus_id === id)?.name ?? null
  const active = new Set(db.leases.filter((l) => l.status === 'Active').map((l) => l.lease_id))
  const leasedOn = (floorId: string) => db.lease_spaces.filter((sp) => sp.floor_id === floorId && active.has(sp.lease_id)).reduce((a, sp) => a + sp.area, 0)
  const out: AvailabilityRow[] = []
  for (const b of ctx.buildings) {
    const base = { building_id: b.building_id, building: b.name, campus: campus(b.campus_id), city: b.city, micro_market: b.micro_market, grade: b.grade }
    if (b.status === 'Pre-OC' && b.total_area) {
      out.push({ ...base, key: b.building_id, space: 'Full building', area: b.total_area, handover: b.handover_condition ?? 'Not specified', available_from: b.expected_completion, asking_rent: null, vacancy_days: null, kind: 'Whole building' })
    }
    for (const f of ctx.floors.filter((x) => x.building_id === b.building_id)) {
      if (f.occupancy_type !== 'Vacant' && f.occupancy_type !== 'Partially leased') continue
      const area = (f.chargeable_area ?? 0) - (f.occupancy_type === 'Partially leased' ? leasedOn(f.floor_id) : 0)
      if (area <= 0) continue
      out.push({
        ...base,
        key: f.floor_id,
        space: `Floor ${f.floor_no}${f.wing ? ` · ${f.wing}` : ''}`,
        area,
        handover: f.handover_condition ?? 'Not specified',
        available_from: f.available_from,
        asking_rent: f.asking_rent ?? null,
        vacancy_days: f.vacant_since ? -daysFromToday(f.vacant_since) : null,
        kind: f.occupancy_type === 'Partially leased' ? 'Part floor' : 'Floor',
      })
    }
  }
  return out
}

export interface Comparable {
  key: string
  quarter: string
  city: string
  micro_market: string
  grade: string | null
  area_band: string
  rent: number
  CAM: number | null
  escalation: string
  source_tag: string
}

const band = (a: number) => (a < 25000 ? '< 25k sq ft' : a < 50000 ? '25–50k sq ft' : a < 100000 ? '50–100k sq ft' : '100k+ sq ft')

/** E2-S03 / §7.1 "Public (anonymised)": executed rents across the market with every identifier stripped. */
export async function comparables(s: Session): Promise<{ rows: Comparable[]; total: number; limit: number | null }> {
  const db = readDb()
  const all = db.leases
    .filter((l) => l.status === 'Active' && l.rent != null)
    .map((l, i): Comparable => {
      const b = db.buildings.find((x) => x.building_id === l.building_id)!
      return {
        key: `c${i}`,
        quarter: quarterOf(l.start),
        city: b.city,
        micro_market: b.micro_market,
        grade: b.grade,
        area_band: band(l.area),
        rent: l.rent!,
        CAM: l.CAM,
        escalation: l.escalation_pct ? `${l.escalation_pct}% ${l.escalation_freq?.toLowerCase() ?? ''}`.trim() : '—',
        source_tag: l.source_tag,
      }
    })
    .sort((a, b) => b.quarter.slice(3).localeCompare(a.quarter.slice(3)) || b.quarter.localeCompare(a.quarter))
  // Occupier Free sees a limited sample (quota); Pro and everyone else see full depth (§7.3).
  const limit = s.role === 'Occupier' ? s.plan?.quotas.comparables ?? null : null
  return { rows: limit != null ? all.slice(0, limit) : all, total: all.length, limit }
}

// ---------------------------------------------------------------- plans, seats, audit

export async function getSeatUsage(orgId: string, s: Session) {
  if (s.role !== 'Super Admin' && s.org.org_id !== orgId) throw new ApiError('FORBIDDEN', 'Not your organisation.')
  return seatUsage(readDb(), orgId)
}

export async function getBuildingQuota(orgId: string, s: Session) {
  if (s.role !== 'Super Admin' && s.org.org_id !== orgId) throw new ApiError('FORBIDDEN', 'Not your organisation.')
  return buildingQuota(readDb(), orgId)
}

export async function listAudit(s: Session): Promise<AuditEntry[]> {
  const grant = grantFor('audit', s.role)
  if (!grant) throw new ApiError('FORBIDDEN', `${s.role} cannot view the audit log.`)
  const db = readDb()
  const internal = new Set(db.users.filter((u) => u.org_id === 'ORG-PT').map((u) => u.user_id))
  const entries = grant.scope === 'all' ? db.audit_log : db.audit_log.filter((e) => internal.has(e.user_id))
  return [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

/** Actor names for audit display — internal lookup, not a user listing. */
export async function auditActors(s: Session): Promise<Record<string, string>> {
  await listAudit(s)
  return Object.fromEntries([...readDb().users.map((u) => [u.user_id, u.name]), ['SYSTEM', 'System']])
}

export async function exportCsv(key: EntityKey, data: Rec[], s: Session): Promise<string> {
  const def = REGISTRY[key]
  requireGrant(def, s, 'R')
  const cols = def.fields.filter((f) => f.type !== 'image').map((f) => f.key).filter((k) => data.some((r) => k in r))
  const esc = (v: unknown) => {
    const t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  if (!s.readOnly) {
    writeDb((d) => {
      d.audit_log.push(audit(s.actor, s.role === 'Super Admin' ? null : s.org.org_id, def.name, '*', `${data.length} ${def.plural.toLowerCase()}`, 'Export', null, null))
    })
  }
  return [cols.join(','), ...data.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}
