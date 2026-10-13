// Platform entity definitions (PRD §5 "Platform & access entities").
// Forms, tables, detail views, validation and access checks are all driven from here.
import { FEATURES, QUOTA_KEYS, ROLES_FOR_ORG_TYPE } from '../access/policy'
import type { PlatformDb } from '../domain/platform'
import { ASSET_ENTITIES } from './assets'
import { isLive, orgName, orgOptions, orgTypeOf, plural, shortId } from './helpers'
import { LEASING_ENTITIES } from './leasing'
import type { EntityDef, EntityKey, Option, OptionCtx, Rec } from './types'

const organisation: EntityDef = {
  key: 'organisation',
  name: 'Organisation',
  label: 'Organisation',
  plural: 'Organisations',
  idKey: 'org_id',
  capability: 'organisations',
  orgKey: 'org_id',
  title: (r) => r.name,
  subtitle: (r) => (r.type === 'Enabler' && r.enabler_type ? `Enabler · ${r.enabler_type}` : r.type),
  fields: [
    { key: 'org_id', label: 'Org ID', type: 'text', system: true, column: true },
    { key: 'name', label: 'Name', type: 'text', required: true, column: true },
    { key: 'type', label: 'Type', type: 'enum', options: ['PropTattva', 'Owner', 'Occupier', 'Enabler'], required: true, column: true },
    {
      key: 'enabler_type',
      label: 'Enabler type',
      type: 'enum',
      options: ['Broker firm', 'Campus management company', 'Architecture firm', 'Marketing agency', 'Tech vendor', 'Other'],
      required: true,
      showIf: (d) => d.type === 'Enabler',
    },
    { key: 'status', label: 'Status', type: 'enum', options: ['Active', 'Suspended', 'Pending'], required: true, column: true, help: 'Suspended and Pending orgs cannot sign in.' },
    { key: 'created_at', label: 'Created', type: 'datetime', system: true, column: true },
  ],
  filters: ['type', 'status'],
  searchKeys: ['name', 'org_id'],
  unique: ['name'],
  newId: () => shortId('ORG'),
  defaults: () => ({ type: 'Owner', status: 'Pending', enabler_type: null }),
  related: [
    { entity: 'user', foreignKey: 'org_id', title: 'Users' },
    { entity: 'invite', foreignKey: 'org_id', title: 'Invites' },
    { entity: 'subscription', foreignKey: 'org_id', title: 'Subscriptions' },
  ],
  validate: (d, db, mode, orig) => {
    const e: Record<string, string> = {}
    if (mode === 'edit' && orig && d.type !== orig.type && db.users.some((u) => u.org_id === orig.org_id))
      e.type = 'Type cannot change while the org has users (their roles depend on it).'
    if (orig?.org_id === 'ORG-PT' && d.status !== 'Active') e.status = 'The PropTattva platform org must stay Active.'
    return e
  },
  blockers: (r, db) => {
    if (r.org_id === 'ORG-PT') return ['The PropTattva platform org cannot be deleted']
    const out: string[] = []
    const users = db.users.filter((u) => u.org_id === r.org_id).length
    const subs = db.subscriptions.filter((s) => s.org_id === r.org_id).length
    const invites = db.invites.filter((i) => i.org_id === r.org_id && i.status === 'Pending').length
    const buildings = db.buildings.filter((b) => b.org_id === r.org_id).length
    const campuses = db.campuses.filter((c) => c.org_id === r.org_id).length
    if (users) out.push(plural(users, 'user'))
    if (subs) out.push(plural(subs, 'subscription'))
    if (invites) out.push(plural(invites, 'pending invite'))
    if (campuses) out.push(plural(campuses, 'campus', 'campuses'))
    if (buildings) out.push(plural(buildings, 'building'))
    return out
  },
  deleteHint: 'Set the status to Suspended instead to block access but keep the records.',
}

const roleOptions = (d: Rec, ctx: OptionCtx): Option[] => {
  const t = orgTypeOf(ctx, d.org_id)
  return (t ? ROLES_FOR_ORG_TYPE[t] : []).map((r) => ({ value: r, label: r }))
}

const user: EntityDef = {
  key: 'user',
  name: 'User',
  label: 'User',
  plural: 'Users',
  idKey: 'user_id',
  capability: 'org_users',
  orgKey: 'org_id',
  title: (r) => r.name,
  subtitle: (r, ctx) => `${r.role} · ${orgName(ctx, r.org_id)}`,
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, column: true },
    { key: 'email', label: 'Email', type: 'email', required: true, column: true, help: 'Corporate email at the company domain.' },
    { key: 'org_id', label: 'Organisation', type: 'ref', options: (_d, ctx) => orgOptions(ctx), required: true, column: true, adminOnly: true },
    { key: 'role', label: 'Role', type: 'enum', options: roleOptions, required: true, column: true, help: 'One role per user; options depend on the org type.' },
    { key: 'phone', label: 'Phone', type: 'phone', visibility: 'owner', placeholder: '+91 98xxx xxxxx' },
    { key: 'status', label: 'Status', type: 'enum', options: ['Active', 'Invited', 'Disabled'], required: true, column: true },
    { key: 'last_login', label: 'Last login', type: 'datetime', system: true, column: true, visibility: 'owner' },
    { key: 'user_id', label: 'User ID', type: 'text', system: true },
  ],
  filters: ['org_id', 'role', 'status'],
  searchKeys: ['name', 'email'],
  unique: ['email'],
  newId: () => shortId('U'),
  defaults: (ctx) => {
    const t = orgTypeOf(ctx, ctx.orgId)
    return { org_id: ctx.orgId, role: t ? ROLES_FOR_ORG_TYPE[t][0] : null, status: 'Active', phone: null, last_login: null }
  },
  validate: (d, db, mode, orig) => {
    const e: Record<string, string> = {}
    const org = db.organisations.find((o) => o.org_id === d.org_id)
    if (org && d.role && !ROLES_FOR_ORG_TYPE[org.type].includes(d.role))
      e.role = `${/^[AEIOU]/.test(org.type) ? 'An' : 'A'} ${org.type} org can only hold: ${ROLES_FOR_ORG_TYPE[org.type].join(', ')}.`
    if (mode === 'edit' && orig?.role === 'Super Admin' && (d.role !== 'Super Admin' || d.status !== 'Active')) {
      const others = db.users.filter((u) => u.role === 'Super Admin' && u.status === 'Active' && u.user_id !== orig.user_id)
      if (!others.length) e.role = 'This is the last active Super Admin.'
    }
    return e
  },
  blockers: (r, db) =>
    r.role === 'Super Admin' && db.users.filter((u) => u.role === 'Super Admin').length === 1 ? ['the last Super Admin'] : [],
  deleteHint: 'Disable the user instead to keep their audit history readable.',
}

const invite: EntityDef = {
  key: 'invite',
  name: 'Invite',
  label: 'Invite',
  plural: 'Invites',
  idKey: 'invite_id',
  capability: 'org_users',
  orgKey: 'org_id',
  title: (r) => r.email,
  subtitle: (r, ctx) => `${r.role} · ${orgName(ctx, r.org_id)}`,
  fields: [
    { key: 'email', label: 'Email', type: 'email', required: true, column: true },
    { key: 'org_id', label: 'Organisation', type: 'ref', options: (_d, ctx) => orgOptions(ctx), required: true, column: true, adminOnly: true },
    { key: 'role', label: 'Role', type: 'enum', options: roleOptions, required: true, column: true },
    { key: 'status', label: 'Status', type: 'enum', options: ['Pending', 'Accepted', 'Expired', 'Revoked'], system: true, column: true },
    { key: 'expires_at', label: 'Expires', type: 'datetime', system: true, column: true },
    { key: 'token', label: 'Invite token', type: 'text', system: true, visibility: 'aa', help: 'Only visible to PropTattva staff.' },
    { key: 'invite_id', label: 'Invite ID', type: 'text', system: true },
  ],
  filters: ['org_id', 'status'],
  searchKeys: ['email'],
  newId: () => shortId('INV'),
  defaults: (ctx) => {
    const t = orgTypeOf(ctx, ctx.orgId)
    return { org_id: ctx.orgId, role: t ? ROLES_FOR_ORG_TYPE[t][0] : null }
  },
  validate: (d, db, mode) => {
    const e: Record<string, string> = {}
    const email = String(d.email ?? '').toLowerCase()
    if (mode === 'create') {
      if (db.users.some((u) => u.email.toLowerCase() === email)) e.email = 'A user with this email already exists.'
      else if (db.invites.some((i) => i.email.toLowerCase() === email && i.status === 'Pending'))
        e.email = 'There is already a pending invite for this email.'
    }
    const org = db.organisations.find((o) => o.org_id === d.org_id)
    if (org && d.role && !ROLES_FOR_ORG_TYPE[org.type].includes(d.role)) e.role = `Not a valid role for this ${org.type} org.`
    return e
  },
}

const plan: EntityDef = {
  key: 'plan',
  name: 'SubscriptionPlan',
  label: 'Plan',
  plural: 'Plans',
  idKey: 'plan_code',
  capability: 'plans',
  orgKey: null,
  title: (r) => r.name,
  subtitle: (r) => `${r.plan_code} · for ${r.applies_to}`,
  fields: [
    { key: 'plan_code', label: 'Plan code', type: 'text', required: true, createOnly: true, column: true, placeholder: 'OWNER_PLUS', help: 'Upper-case letters and underscores; cannot change later.' },
    { key: 'name', label: 'Name', type: 'text', required: true, column: true },
    { key: 'applies_to', label: 'Applies to', type: 'enum', options: ['Owner', 'Occupier', 'Enabler'], required: true, column: true },
    { key: 'default_seat_limit', label: 'Default seats', type: 'int', required: true, column: true },
    { key: 'price', label: 'Price (₹ / month)', type: 'money', column: true, help: 'Leave blank for custom pricing. Sample values — no billing in Alpha.' },
    {
      key: 'feature_flags',
      label: 'Features',
      type: 'multienum',
      options: (d) => FEATURES.filter((f) => f.for === d.applies_to).map((f) => ({ value: f.key, label: f.label })),
    },
    { key: 'quotas', label: 'Quotas', type: 'quotas', options: QUOTA_KEYS.map((q) => q.key), help: 'Blank = unlimited.' },
    { key: 'status', label: 'Status', type: 'enum', options: ['Active', 'Retired'], required: true, column: true, help: 'Retired plans cannot be assigned to new subscriptions.' },
  ],
  filters: ['applies_to', 'status'],
  searchKeys: ['name', 'plan_code'],
  unique: ['plan_code', 'name'],
  newId: () => '',
  defaults: () => ({ applies_to: 'Owner', default_seat_limit: 5, feature_flags: [], quotas: {}, price: null, status: 'Active' }),
  related: [{ entity: 'subscription', foreignKey: 'plan_code', title: 'Subscriptions on this plan' }],
  validate: (d, db, mode, orig) => {
    const e: Record<string, string> = {}
    if (mode === 'create' && d.plan_code && !/^[A-Z][A-Z0-9_]*$/.test(d.plan_code)) e.plan_code = 'Use upper-case letters, digits and underscores.'
    const valid = new Set(FEATURES.filter((f) => f.for === d.applies_to).map((f) => f.key))
    if ((d.feature_flags ?? []).some((f: string) => !valid.has(f))) e.feature_flags = `Some features do not apply to ${d.applies_to} plans.`
    if (mode === 'edit' && orig && d.applies_to !== orig.applies_to && db.subscriptions.some((s) => s.plan_code === orig.plan_code))
      e.applies_to = 'Cannot change while subscriptions use this plan.'
    return e
  },
  blockers: (r, db) => {
    const n = db.subscriptions.filter((s) => s.plan_code === r.plan_code).length
    return n ? [plural(n, 'subscription')] : []
  },
  deleteHint: 'Set the status to Retired instead to stop new assignments.',
}

const subscription: EntityDef = {
  key: 'subscription',
  name: 'Subscription',
  label: 'Subscription',
  plural: 'Subscriptions',
  idKey: 'subscription_id',
  capability: 'subscriptions',
  orgKey: 'org_id',
  title: (r, ctx) => `${orgName(ctx, r.org_id)} · ${ctx.plans.find((p) => p.plan_code === r.plan_code)?.name ?? r.plan_code}`,
  subtitle: (r) => `${r.status} · from ${r.start}`,
  fields: [
    { key: 'org_id', label: 'Organisation', type: 'ref', options: (_d, ctx) => orgOptions(ctx).filter((o) => o.group !== 'PropTattva'), required: true, column: true, createOnly: true },
    {
      key: 'plan_code',
      label: 'Plan',
      type: 'ref',
      required: true,
      column: true,
      options: (d, ctx) => {
        const t = orgTypeOf(ctx, d.org_id)
        return ctx.plans
          .filter((p) => (!t || p.applies_to === t) && (p.status === 'Active' || p.plan_code === d.plan_code))
          .map((p) => ({ value: p.plan_code, label: p.name, group: p.applies_to }))
      },
    },
    { key: 'seat_limit', label: 'Seat limit', type: 'int', required: true, column: true, help: 'Defaults to the plan’s seat limit.' },
    { key: 'start', label: 'Start', type: 'date', required: true, column: true },
    { key: 'end', label: 'End', type: 'date', column: true, help: 'Blank = open-ended.' },
    { key: 'status', label: 'Status', type: 'enum', options: ['Active', 'Trial', 'Expired'], required: true, column: true },
    { key: 'subscription_id', label: 'Subscription ID', type: 'text', system: true },
  ],
  filters: ['org_id', 'plan_code', 'status'],
  searchKeys: ['subscription_id'],
  newId: () => shortId('SUB'),
  defaults: (ctx) => ({ org_id: ctx.orgId, start: new Date().toISOString().slice(0, 10), end: null, status: 'Active' }),
  validate: (d, db, _mode, orig) => {
    const e: Record<string, string> = {}
    const org = db.organisations.find((o) => o.org_id === d.org_id)
    const p = db.plans.find((x) => x.plan_code === d.plan_code)
    if (org && p && p.applies_to !== org.type) e.plan_code = `${p.name} is for ${p.applies_to} orgs.`
    if (p && p.status === 'Retired' && p.plan_code !== orig?.plan_code) e.plan_code = 'This plan is retired.'
    if (d.end && d.start && d.end < d.start) e.end = 'End must be after start.'
    if (isLive(d as { status: string }) && db.subscriptions.some((s) => s.org_id === d.org_id && isLive(s) && s.subscription_id !== orig?.subscription_id))
      e.status = 'This org already has an active or trial subscription. Expire it first, or edit it to change plan.'
    return e
  },
}

export const REGISTRY = { organisation, user, invite, plan, subscription, ...ASSET_ENTITIES, ...LEASING_ENTITIES } as Record<EntityKey, EntityDef>

export const entityDef = (key: EntityKey) => REGISTRY[key]

/** Seat usage: users who are not Disabled + invites still Pending (EP-A-S03). */
export function seatUsage(db: PlatformDb, orgId: string) {
  const users = db.users.filter((u) => u.org_id === orgId && u.status !== 'Disabled').length
  const pending = db.invites.filter((i) => i.org_id === orgId && i.status === 'Pending').length
  const sub = db.subscriptions.find((s) => s.org_id === orgId && isLive(s))
  return { used: users + pending, users, pending, limit: sub?.seat_limit ?? null, subscription: sub ?? null }
}
