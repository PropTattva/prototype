// The mock "server". Every screen reads and writes through these async functions, which enforce
// role × row scope × field visibility × plan limits and write the audit log — as a real backend would.
// Swapping in a real API later means re-implementing this file only.
import { can, canSeeField, grantFor, type Action } from '../access/policy'
import type { Session } from '../access/session'
import type { AuditEntry, Invite, PlatformDb, User } from '../domain/platform'
import type { Park } from '../domain/legacy'
import { REGISTRY, seatUsage } from '../entities/registry'
import type { EntityDef, EntityKey, OptionCtx, Rec } from '../entities/types'
import { getAllParks, getAvailabilityForParks, getParksForOrg } from './legacy'
import { readDb, resetDb, writeDb } from './store'

export type ApiErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'QUOTA' | 'CONFLICT' | 'READ_ONLY' | 'AUTH'

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
    db.audit_log.push(audit(user, null, user.org_id, 'Session', user.user_id, user.name, 'Login', null, null))
  })
}

/** View as (EP-C-S03): Super Admin only, read-only, and the impersonation itself is audited as a sensitive read. */
export async function startViewAs(session: Session, targetUserId: string): Promise<void> {
  if (session.actor.role !== 'Super Admin') throw new ApiError('FORBIDDEN', 'Only Super Admin can use View as.')
  const target = readDb().users.find((u) => u.user_id === targetUserId)
  if (!target) throw new ApiError('NOT_FOUND', 'User not found')
  writeDb((db) => {
    db.audit_log.push(audit(session.actor, null, target.org_id, 'User', target.user_id, `View as ${target.name}`, 'Read', null, null))
  })
}

export function resetDemoData() {
  resetDb()
}

// ---------------------------------------------------------------- helpers

function audit(
  actor: User,
  onBehalfOf: User | null,
  orgId: string | null,
  entity: string,
  entityId: string,
  label: string,
  action: AuditEntry['action'],
  before: Rec | null,
  after: Rec | null,
): AuditEntry {
  return {
    audit_id: `AUD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    org_id: orgId,
    user_id: actor.user_id,
    on_behalf_of: onBehalfOf?.user_id ?? null,
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

function optionCtx(db: PlatformDb): OptionCtx {
  return { organisations: db.organisations, plans: db.plans }
}

function requireGrant(def: EntityDef, s: Session, action: Action) {
  if (!can(def.capability, s.role, action)) {
    const verb = { C: 'create', R: 'view', U: 'edit', D: 'delete' }[action]
    throw new ApiError('FORBIDDEN', `${s.role} cannot ${verb} ${def.plural.toLowerCase()}.`)
  }
}

function inRowScope(def: EntityDef, s: Session, rec: Rec) {
  const scope = grantFor(def.capability, s.role)?.scope
  if (scope === 'all' || !def.orgKey) return true
  return rec[def.orgKey] === s.org.org_id
}

/** Strip fields the viewer may not see — removed from the payload, not just hidden (EP-B-S01). */
function project(def: EntityDef, s: Session, rec: Rec): Rec {
  const recordOrg = def.orgKey ? rec[def.orgKey] : null
  const out: Rec = { ...rec }
  for (const f of def.fields) {
    if (f.visibility && !canSeeField(f.visibility, { role: s.role, org_id: s.org.org_id }, recordOrg)) delete out[f.key]
  }
  return out
}

/** Pending invites past their expiry become Expired (a system change, audited). */
function sweepExpiredInvites() {
  const t = now()
  const stale = readDb().invites.filter((i) => i.status === 'Pending' && i.expires_at < t)
  if (!stale.length) return
  writeDb((db) => {
    for (const i of db.invites) {
      if (i.status === 'Pending' && i.expires_at < t) {
        i.status = 'Expired'
        db.audit_log.push(audit(SYSTEM, null, i.org_id, 'Invite', i.invite_id, i.email, 'Update', { status: 'Pending' }, { status: 'Expired' }))
      }
    }
  })
}

function validate(def: EntityDef, db: PlatformDb, draft: Rec, mode: 'create' | 'edit', original: Rec | null) {
  const errors: Record<string, string> = {}
  const ctx = optionCtx(db)
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
    if ((f.type === 'int' || f.type === 'money') && (!Number.isFinite(v) || v < 0)) errors[f.key] = 'Must be zero or more.'
    if (f.type === 'int' && !Number.isInteger(v)) errors[f.key] = 'Must be a whole number.'
    if ((f.type === 'enum' || f.type === 'ref') && f.options) {
      const opts = typeof f.options === 'function' ? f.options(draft, ctx).map((o) => o.value) : f.options
      if (!opts.includes(v)) errors[f.key] = `Choose a valid ${f.label.toLowerCase()}.`
    }
  }
  for (const key of def.unique ?? []) {
    const v = String(draft[key] ?? '').toLowerCase()
    if (v && rows(db, def.key).some((r) => String(r[key]).toLowerCase() === v && r[def.idKey] !== original?.[def.idKey]))
      errors[key] ??= `${def.fields.find((f) => f.key === key)?.label ?? key} is already in use.`
  }
  Object.assign(errors, def.validate?.(draft, db, mode, original), errors)
  if (Object.keys(errors).length) throw new ApiError('VALIDATION', 'Please fix the highlighted fields.', errors)
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

/** Fields only Super Admin may set; for everyone else they are forced to their own org. */
function lockOwnOrg(def: EntityDef, s: Session, draft: Rec) {
  if (s.role === 'Super Admin' || !def.orgKey) return
  draft[def.orgKey] = s.org.org_id
}

// ---------------------------------------------------------------- generic CRUD

export async function getOptionCtx(_s: Session): Promise<OptionCtx> {
  // Lookup lists for form dropdowns. Customers only see their own org + the plan catalogue.
  const db = readDb()
  const ctx = optionCtx(db)
  if (_s.role === 'Super Admin') return ctx
  return { organisations: ctx.organisations.filter((o) => o.org_id === _s.org.org_id), plans: ctx.plans }
}

export async function list(key: EntityKey, s: Session): Promise<Rec[]> {
  const def = REGISTRY[key]
  requireGrant(def, s, 'R')
  if (key === 'invite') sweepExpiredInvites()
  return rows(readDb(), key)
    .filter((r) => inRowScope(def, s, r))
    .map((r) => project(def, s, r))
}

export async function get(key: EntityKey, id: string, s: Session): Promise<Rec> {
  const def = REGISTRY[key]
  requireGrant(def, s, 'R')
  const rec = rows(readDb(), key).find((r) => r[def.idKey] === id)
  if (!rec || !inRowScope(def, s, rec)) throw new ApiError('NOT_FOUND', `${def.label} not found.`)
  return project(def, s, rec)
}

export async function create(key: EntityKey, input: Rec, s: Session): Promise<Rec> {
  const def = REGISTRY[key]
  requireWritable(s)
  requireGrant(def, s, 'C')
  const db = readDb()
  const draft: Rec = { ...input }
  lockOwnOrg(def, s, draft)
  if (def.idKey !== 'plan_code') draft[def.idKey] = def.newId()

  if (key === 'organisation') draft.created_at = now()
  if (key === 'invite') {
    draft.status = 'Pending'
    draft.token = `tk_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
    draft.expires_at = new Date(Date.now() + 7 * 86_400_000).toISOString()
  }
  if (key === 'user') draft.last_login = null
  if (key === 'subscription' && (draft.seat_limit == null || draft.seat_limit === ''))
    draft.seat_limit = db.plans.find((p) => p.plan_code === draft.plan_code)?.default_seat_limit ?? null

  validate(def, db, draft, 'create', null)
  if ((key === 'user' && draft.status !== 'Disabled') || key === 'invite') requireSeat(db, draft.org_id)

  writeDb((d) => {
    rows(d, key).push(draft)
    d.audit_log.push(audit(s.actor, null, def.orgKey ? draft[def.orgKey] : null, def.name, draft[def.idKey], def.title(draft, optionCtx(d)), 'Create', null, draft))
  })
  return project(def, s, draft)
}

export async function update(key: EntityKey, id: string, patch: Rec, s: Session): Promise<Rec> {
  const def = REGISTRY[key]
  requireWritable(s)
  requireGrant(def, s, 'U')
  const db = readDb()
  const original = rows(db, key).find((r) => r[def.idKey] === id)
  if (!original || !inRowScope(def, s, original)) throw new ApiError('NOT_FOUND', `${def.label} not found.`)

  const draft: Rec = { ...original }
  for (const f of def.fields) {
    if (!(f.key in patch) || f.system || f.createOnly) continue
    if (f.adminOnly && s.role !== 'Super Admin') continue
    draft[f.key] = patch[f.key]
  }
  if (key === 'organisation' && draft.type !== 'Enabler') draft.enabler_type = null
  if (key === 'user' && id === s.actor.user_id && draft.status !== 'Active')
    throw new ApiError('VALIDATION', 'You cannot disable your own account.', { status: 'You cannot disable yourself.' })

  validate(def, db, draft, 'edit', original)
  // Re-enabling a user takes a seat again.
  if (key === 'user' && original.status === 'Disabled' && draft.status !== 'Disabled') requireSeat(db, draft.org_id)

  const before: Rec = {}
  const after: Rec = {}
  for (const k of Object.keys(draft)) {
    if (JSON.stringify(draft[k]) !== JSON.stringify(original[k])) {
      before[k] = original[k]
      after[k] = draft[k]
    }
  }
  if (!Object.keys(after).length) return project(def, s, original)

  writeDb((d) => {
    const list = rows(d, key)
    list[list.findIndex((r) => r[def.idKey] === id)] = draft
    d.audit_log.push(audit(s.actor, null, def.orgKey ? draft[def.orgKey] : null, def.name, id, def.title(draft, optionCtx(d)), 'Update', before, after))
  })
  return project(def, s, draft)
}

export async function remove(key: EntityKey, id: string, s: Session): Promise<void> {
  const def = REGISTRY[key]
  requireWritable(s)
  requireGrant(def, s, 'D')
  const db = readDb()
  const rec = rows(db, key).find((r) => r[def.idKey] === id)
  if (!rec || !inRowScope(def, s, rec)) throw new ApiError('NOT_FOUND', `${def.label} not found.`)
  if (key === 'user' && id === s.actor.user_id) throw new ApiError('CONFLICT', 'You cannot delete your own account.')
  const blockers = def.blockers?.(rec, db) ?? []
  if (blockers.length) throw new ApiError('CONFLICT', `Cannot delete: referenced by ${blockers.join(', ')}. ${def.deleteHint ?? ''}`.trim())

  writeDb((d) => {
    const list = rows(d, key)
    list.splice(list.findIndex((r) => r[def.idKey] === id), 1)
    d.audit_log.push(audit(s.actor, null, def.orgKey ? rec[def.orgKey] : null, def.name, id, def.title(rec, optionCtx(d)), 'Delete', rec, null))
  })
}

/** Pre-flight for the delete dialog: what would block this delete. */
export async function deleteBlockers(key: EntityKey, id: string, _s: Session): Promise<string[]> {
  const db = readDb()
  const def = REGISTRY[key]
  const rec = rows(db, key).find((r) => r[def.idKey] === id)
  return rec ? def.blockers?.(rec, db) ?? [] : []
}

// ---------------------------------------------------------------- invite workflow (EP-A-S03)

async function inviteFor(id: string, s: Session): Promise<Invite> {
  return (await get('invite', id, s)) as Invite
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
  const inv = await inviteFor(id, s)
  requireGrant(REGISTRY.invite, s, 'U')
  if (inv.status === 'Accepted') throw new ApiError('CONFLICT', 'This invite was already accepted.')
  const db = readDb()
  if (inv.status !== 'Pending') requireSeat(db, inv.org_id)
  writeDb((d) => {
    const i = d.invites.find((x) => x.invite_id === id)!
    const before = { status: i.status, expires_at: i.expires_at }
    i.status = 'Pending'
    i.token = `tk_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
    i.expires_at = new Date(Date.now() + 7 * 86_400_000).toISOString()
    d.audit_log.push(audit(s.actor, null, i.org_id, 'Invite', id, i.email, 'Update', before, { status: i.status, expires_at: i.expires_at }))
  })
}

/** Demo shortcut for the invitee clicking the emailed link: creates the user and consumes the reserved seat. */
export async function acceptInvite(id: string, s: Session, name: string) {
  requireWritable(s)
  requireGrant(REGISTRY.invite, s, 'U')
  const inv = await inviteFor(id, s)
  if (inv.status !== 'Pending') throw new ApiError('CONFLICT', `This invite is ${inv.status}.`)
  if (!name.trim()) throw new ApiError('VALIDATION', 'Name is required.', { name: 'Name is required.' })
  const newUser: User = {
    user_id: REGISTRY.user.newId(),
    org_id: inv.org_id,
    name: name.trim(),
    email: inv.email,
    phone: null,
    role: inv.role,
    status: 'Active',
    last_login: null,
  }
  writeDb((d) => {
    const i = d.invites.find((x) => x.invite_id === id)!
    i.status = 'Accepted'
    d.users.push(newUser)
    d.audit_log.push(audit(s.actor, null, i.org_id, 'Invite', id, i.email, 'Update', { status: 'Pending' }, { status: 'Accepted' }))
    d.audit_log.push(audit(s.actor, null, i.org_id, 'User', newUser.user_id, newUser.name, 'Create', null, newUser as unknown as Rec))
  })
  return newUser
}

async function setInviteStatus(id: string, status: Invite['status'], s: Session) {
  writeDb((d) => {
    const i = d.invites.find((x) => x.invite_id === id)!
    const before = { status: i.status }
    i.status = status
    d.audit_log.push(audit(s.actor, null, i.org_id, 'Invite', id, i.email, 'Update', before, { status }))
  })
}

// ---------------------------------------------------------------- plans, seats, audit

export async function getSeatUsage(orgId: string, s: Session) {
  if (s.role !== 'Super Admin' && s.org.org_id !== orgId) throw new ApiError('FORBIDDEN', 'Not your organisation.')
  return seatUsage(readDb(), orgId)
}

/** Plan gating (EP-B-S03). Internal roles are not subscription-gated (§7.3). */
export function hasFeature(s: Session, feature: string) {
  if (s.role === 'Super Admin' || s.role === 'AA') return true
  return !!s.plan?.feature_flags.includes(feature)
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
  const cols = def.fields.map((f) => f.key).filter((k) => data.some((r) => k in r))
  const esc = (v: unknown) => {
    const t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  if (!s.readOnly) {
    writeDb((d) => {
      d.audit_log.push(audit(s.actor, null, s.role === 'Super Admin' ? null : s.org.org_id, def.name, '*', `${data.length} ${def.plural.toLowerCase()}`, 'Export', null, null))
    })
  }
  return [cols.join(','), ...data.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}

// ---------------------------------------------------------------- legacy demo dataset (read-only until Phase 2)

export async function listParks(s: Session): Promise<Park[]> {
  if (s.role === 'Super Admin' || s.role === 'AA') return getAllParks()
  if (s.role === 'Owner/Developer') return getParksForOrg(s.org.org_id)
  return []
}

export async function listAvailability(s: Session) {
  const parks = await listParks(s)
  return getAvailabilityForParks(new Set(parks.map((p) => p.parkId)))
}
