import type { ReactNode } from 'react'
import type { Session } from '../../access/session'
import type { CrmBook } from '../../data/api'
import type { CrmAccount, CrmActivity, CrmContact, PicklistKey, PicklistValue } from '../../domain/crm'
import { daysBetween, fmtDate, todayIso } from '../../lib/dates'
import { fullName } from '../../lib/crm'

export type Opener =
  | { kind: 'meeting'; accountId?: string; contactId?: string; activityId?: string }
  | { kind: 'account'; id?: string }
  | { kind: 'contact'; id?: string; accountId?: string }

/** What every CRM page gets: the book, lookups, and a way to open the shared drawers. */
export interface CrmCtx {
  session: Session
  book: CrmBook
  canWrite: boolean
  open: (o: Opener) => void
  /** Platform owner: can work in any org's CRM */
  isAdmin: boolean
  /** The book spans several orgs (Super Admin's "All organisations" view) — show org labels */
  multiOrg: boolean
  /** Org that new records go into unless the form picks another */
  defaultOrg: string
  account: (id: string) => CrmAccount | undefined
  contact: (id: string) => CrmContact | undefined
  userName: (id: string) => string
  orgName: (id: string) => string
  /** Active users of an org: owners and attendees */
  teamOf: (orgId: string) => CrmBook['team']
  /** An org's dropdown values */
  listsOf: (orgId: string) => Record<PicklistKey, PicklistValue[]>
}

export function makeCtx(session: Session, book: CrmBook, open: (o: Opener) => void): CrmCtx {
  const accounts = new Map(book.accounts.map((a) => [a.account_id, a]))
  const contacts = new Map(book.contacts.map((c) => [c.contact_id, c]))
  const users = new Map(book.team.map((u) => [u.user_id, u.name]))
  const orgs = new Map(book.orgs.map((o) => [o.org_id, o.name]))
  const multiOrg = book.orgs.length > 1
  return {
    session,
    book,
    canWrite: !session.readOnly,
    open,
    isAdmin: session.role === 'Super Admin',
    multiOrg,
    defaultOrg: multiOrg ? session.org.org_id : book.orgs[0]?.org_id ?? session.org.org_id,
    account: (id) => accounts.get(id),
    contact: (id) => contacts.get(id),
    // Additional attendees can be colleagues (user ids) or names typed in.
    userName: (id) => users.get(id) ?? (id.startsWith('U-') ? 'Former colleague' : id),
    orgName: (id) => orgs.get(id) ?? id,
    teamOf: (orgId) => book.team.filter((u) => u.org_id === orgId),
    listsOf: (orgId) => book.picklists[orgId] ?? Object.values(book.picklists)[0],
  }
}

/** Organisation picker shown to the platform owner when creating a record from the "All organisations" view. */
export function OrgPicker({ c, value, onChange, id }: { c: CrmCtx; value: string; onChange: (org: string) => void; id: string }) {
  return (
    <div className="mb-4 rounded-lg border border-royal/30 bg-royal-soft/50 p-3">
      <label className="label" htmlFor={id}>Organisation (platform admin)</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {c.book.orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
      </select>
      <p className="mt-1 text-[11px] text-ink-muted">The record goes into this organisation’s CRM and uses its team and dropdowns.</p>
    </div>
  )
}

export const byDateDesc = (a: CrmActivity, b: CrmActivity) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)

/** Latest meeting and the open next action, per account. */
export function accountStats(c: CrmCtx) {
  const out = new Map<string, { last: CrmActivity | null; open: CrmActivity | null; meetings: number; contacts: number }>()
  for (const a of c.book.accounts) out.set(a.account_id, { last: null, open: null, meetings: 0, contacts: 0 })
  for (const x of c.book.contacts) {
    const s = out.get(x.account_id)
    if (s) s.contacts++
  }
  for (const m of [...c.book.activities].sort(byDateDesc)) {
    const s = out.get(m.account_id)
    if (!s) continue
    s.meetings++
    s.last ??= m
    if (!s.open && m.next_action && !m.next_action_done) s.open = m
  }
  return out
}

export function Chip({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'royal' | 'gold' | 'ok' | 'crit' }) {
  const t = { muted: 'bg-hover text-ink-soft', royal: 'bg-royal-soft text-royal', gold: 'bg-gold-light text-gold-dark', ok: 'bg-ok-bg text-ok', crit: 'bg-crit-bg text-crit' }[tone]
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ${t}`}>{children}</span>
}

/** "Proposal · 12 Nov" with overdue / due-today emphasis. */
export function NextActionTag({ a }: { a: Pick<CrmActivity, 'next_action' | 'next_action_date' | 'next_action_done'> }) {
  if (!a.next_action) return <span className="text-ink-muted">—</span>
  const n = a.next_action_date ? daysBetween(todayIso(), a.next_action_date) : null
  const tone = a.next_action_done ? 'text-ink-muted line-through' : n != null && n < 0 ? 'text-crit' : n === 0 ? 'text-warn' : 'text-ink'
  return (
    <span className={`text-[12px] font-semibold ${tone}`}>
      {a.next_action}
      {a.next_action_date && <span className="font-normal"> · {fmtDate(a.next_action_date)}</span>}
      {!a.next_action_done && n != null && n < 0 && <span className="ml-1 whitespace-nowrap rounded bg-crit-bg px-1 text-[10px] font-bold">{-n}d overdue</span>}
      {!a.next_action_done && n === 0 && <span className="ml-1 whitespace-nowrap rounded bg-warn-bg px-1 text-[10px] font-bold">today</span>}
    </span>
  )
}

export const contactLabel = (c: CrmContact | undefined) => (c ? fullName(c) : 'Unknown contact')

export const initials = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

/** Filter chip-select used across the CRM list pages. */
export function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select aria-label={label} className={`input w-auto py-1 text-xs ${value ? 'border-royal text-royal' : ''}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label}: all</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

export const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort()
