// Platform health for the platform owner: account, billing and data-quality issues across every org,
// each pointing at the record (or org support page) where PT Admin can fix it.
import { INTERNAL_ORG_TYPES, type PlatformDb } from '../domain/platform'
import type { ActionSeverity } from './actions'
import { firmKey } from './crm'
import { addDays, daysBetween, fmtDate } from './dates'

export type HealthArea = 'Account' | 'Billing' | 'Data'

export interface HealthIssue {
  id: string
  /** null = platform master data (e.g. the shared occupier catalogue) */
  org_id: string | null
  area: HealthArea
  severity: ActionSeverity
  /** The check that failed, e.g. "Building has no floors" — issues group by it */
  check: string
  /** The record it is about */
  label: string
  detail: string
  link: string
  cta: string
}

const RANK: Record<ActionSeverity, number> = { Critical: 0, Warning: 1, Info: 2 }

/** Seat use counts active users and pending invites, as the seat check on invite does. */
export function seatsOf(db: PlatformDb, orgId: string) {
  const users = db.users.filter((u) => u.org_id === orgId && u.status !== 'Disabled').length
  const pending = db.invites.filter((i) => i.org_id === orgId && i.status === 'Pending').length
  const sub = db.subscriptions.find((s) => s.org_id === orgId && (s.status === 'Active' || s.status === 'Trial')) ?? null
  return { used: users + pending, limit: sub?.seat_limit ?? null, sub }
}

export function platformHealth(db: PlatformDb, today: string): HealthIssue[] {
  const out: HealthIssue[] = []
  const org = (id: string) => db.organisations.find((o) => o.org_id === id)
  const orgPage = (id: string) => `admin/organisations/${id}`
  const now = `${today}T23:59:59.999Z`

  // ---------------------------------------------------------------- accounts & billing
  for (const o of db.organisations) {
    if (o.type === 'PropTattva') continue
    const internal = INTERNAL_ORG_TYPES.includes(o.type)
    if (o.status === 'Pending')
      out.push({ id: `pending-${o.org_id}`, org_id: o.org_id, area: 'Account', severity: 'Warning', check: 'Organisation awaiting activation', label: o.name, detail: 'Users cannot sign in until the organisation is activated.', link: orgPage(o.org_id), cta: 'Review & activate' })
    const { used, limit, sub } = seatsOf(db, o.org_id)
    if (o.status === 'Active' && !sub)
      out.push({ id: `nosub-${o.org_id}`, org_id: o.org_id, area: 'Billing', severity: internal ? 'Warning' : 'Critical', check: 'No live subscription', label: o.name, detail: 'Active organisation without an active or trial plan — plan features are locked.', link: orgPage(o.org_id), cta: 'Assign plan' })
    if (sub?.end && sub.end < today)
      out.push({ id: `ended-${o.org_id}`, org_id: o.org_id, area: 'Billing', severity: 'Critical', check: 'Subscription past its end date', label: o.name, detail: `${sub.status} plan ended ${fmtDate(sub.end)} but is still marked ${sub.status.toLowerCase()}.`, link: orgPage(o.org_id), cta: 'Renew or expire' })
    else if (sub?.end && sub.end <= addDays(today, 30))
      out.push({ id: `ending-${o.org_id}`, org_id: o.org_id, area: 'Billing', severity: sub.status === 'Trial' ? 'Warning' : 'Info', check: sub.status === 'Trial' ? 'Trial ending soon' : 'Subscription renewing soon', label: o.name, detail: `${sub.status === 'Trial' ? 'Trial' : 'Plan'} ends ${fmtDate(sub.end)} (in ${daysBetween(today, sub.end)} days).`, link: orgPage(o.org_id), cta: 'Open organisation' })
    if (limit != null && used >= limit)
      out.push({ id: `seats-${o.org_id}`, org_id: o.org_id, area: 'Billing', severity: used > limit ? 'Critical' : 'Warning', check: used > limit ? 'Over seat limit' : 'Seat limit reached', label: o.name, detail: `${used} of ${limit} seats used — new invites are blocked.`, link: orgPage(o.org_id), cta: 'Review seats' })
  }
  for (const i of db.invites) {
    if (i.status === 'Pending' && i.expires_at < now)
      out.push({ id: `invite-${i.invite_id}`, org_id: i.org_id, area: 'Account', severity: 'Info', check: 'Invite expired, still holding a seat', label: i.email, detail: `Expired ${fmtDate(i.expires_at)} — resend or revoke to free the seat.`, link: orgPage(i.org_id), cta: 'Resend or revoke' })
  }
  for (const u of db.users) {
    const o = org(u.org_id)
    if (u.status === 'Active' && !u.last_login && o?.type !== 'PropTattva')
      out.push({ id: `nologin-${u.user_id}`, org_id: u.org_id, area: 'Account', severity: 'Info', check: 'User has never signed in', label: `${u.name} · ${o?.name ?? ''}`, detail: `${u.email} — check they received access.`, link: orgPage(u.org_id), cta: 'Open organisation' })
    if (u.status === 'Active' && o?.status === 'Suspended')
      out.push({ id: `suspended-${u.user_id}`, org_id: u.org_id, area: 'Account', severity: 'Info', check: 'Active user in a suspended organisation', label: `${u.name} · ${o.name}`, detail: 'Blocked from signing in while the organisation is suspended.', link: orgPage(u.org_id), cta: 'Open organisation' })
  }

  // ---------------------------------------------------------------- data quality
  const floorsByBuilding = new Map<string, number>()
  for (const f of db.floors) floorsByBuilding.set(f.building_id, (floorsByBuilding.get(f.building_id) ?? 0) + 1)
  for (const b of db.buildings) {
    if (b.status === 'Inactive') continue
    const where = `${b.name} · ${org(b.org_id)?.name ?? ''}`
    if (!floorsByBuilding.get(b.building_id))
      out.push({ id: `floors-${b.building_id}`, org_id: b.org_id, area: 'Data', severity: 'Warning', check: 'Building has no floors', label: where, detail: 'No stacking plan or availability can be shown.', link: `buildings/${b.building_id}`, cta: 'Open building' })
    if (!b.grade)
      out.push({ id: `grade-${b.building_id}`, org_id: b.org_id, area: 'Data', severity: 'Info', check: 'Building has no grade', label: where, detail: 'Grade drives comparables and search filters.', link: `buildings/${b.building_id}`, cta: 'Open building' })
    if (b.lat == null || b.long == null)
      out.push({ id: `geo-${b.building_id}`, org_id: b.org_id, area: 'Data', severity: 'Info', check: 'Building not on the map', label: where, detail: 'Missing coordinates — it won’t appear in map search.', link: `buildings/${b.building_id}`, cta: 'Open building' })
  }
  for (const l of db.leases) {
    if (l.status !== 'Active') continue
    const b = db.buildings.find((x) => x.building_id === l.building_id)
    const occ = db.occupiers.find((x) => x.occupier_id === l.occupier_id)?.name ?? 'Occupier'
    const where = `${occ} · ${b?.name ?? ''} · ${org(l.org_id)?.name ?? ''}`
    if (l.expiry < today)
      out.push({ id: `lapsed-${l.lease_id}`, org_id: l.org_id, area: 'Data', severity: 'Critical', check: 'Lease expired but still Active', label: where, detail: `Expired ${fmtDate(l.expiry)} — occupancy and rent roll are overstated.`, link: `leases/${l.lease_id}`, cta: 'Open lease' })
    if (l.rent == null)
      out.push({ id: `rent-${l.lease_id}`, org_id: l.org_id, area: 'Data', severity: 'Warning', check: 'Active lease missing rent', label: where, detail: 'Excluded from the rent roll and comparables.', link: `leases/${l.lease_id}`, cta: 'Open lease' })
  }
  for (const d of db.documents) {
    if (d.validity && d.validity < today)
      out.push({ id: `doc-${d.doc_id}`, org_id: d.org_id, area: 'Data', severity: 'Warning', check: 'Compliance document expired', label: `${d.type} · ${db.buildings.find((b) => b.building_id === d.building_id)?.name ?? ''} · ${org(d.org_id)?.name ?? ''}`, detail: `Valid until ${fmtDate(d.validity)}.`, link: `buildings/${d.building_id}/documents`, cta: 'Open documents' })
  }
  // Shared occupier catalogue (platform master data)
  const seen = new Map<string, string>()
  for (const o of db.occupiers) {
    const key = firmKey(o.name)
    const twin = key ? seen.get(key) : undefined
    if (twin) out.push({ id: `dup-${o.occupier_id}`, org_id: null, area: 'Data', severity: 'Warning', check: 'Possible duplicate occupier', label: `${o.name} ↔ ${twin}`, detail: 'Two catalogue entries look like the same firm — merge to keep comparables clean.', link: `occupiers/${o.occupier_id}`, cta: 'Open occupier' })
    else if (key) seen.set(key, o.name)
    if (!o.sector_tag) out.push({ id: `sector-${o.occupier_id}`, org_id: null, area: 'Data', severity: 'Info', check: 'Occupier missing sector', label: o.name, detail: 'Sector drives market analytics.', link: `occupiers/${o.occupier_id}`, cta: 'Open occupier' })
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.check.localeCompare(b.check))
}
