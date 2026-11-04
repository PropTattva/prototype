// CRM entity definitions: accounts, contacts, activities. Dropdown fields are org-extendable picklists,
// so they are stored as text and checked against the org's current list here rather than a fixed enum.
import { BD_STAGES, type CrmPicklist, type PicklistKey } from '../domain/crm'
import type { PlatformDb } from '../domain/platform'
import { DEAL_TYPES, DEFAULT_PICKLISTS, emailProblem, firmKey, fullName, phoneProblem } from '../lib/crm'
import { shortId } from './helpers'
import type { EntityDef, Rec } from './types'

/** The org's values for one dropdown (active and retired), falling back to the platform defaults. */
export function orgPicklist(lists: CrmPicklist[], orgId: string, key: PicklistKey) {
  return lists.find((l) => l.org_id === orgId && l.list === key)?.values ?? DEFAULT_PICKLISTS[key].map((value) => ({ value, active: true }))
}

/** A picklist value must be active in the org's list — or unchanged from what the record already had. */
function checkPicklist(db: PlatformDb, d: Rec, original: Rec | null, field: string, key: PicklistKey, label: string, errors: Record<string, string>) {
  const v = d[field]
  if (v == null || v === '' || original?.[field] === v) return
  if (!orgPicklist(db.crm_picklists, d.org_id, key).some((x) => x.active && x.value === v)) errors[field] = `Choose a valid ${label.toLowerCase()}.`
}

const crmAccount: EntityDef = {
  key: 'crmAccount',
  name: 'CrmAccount',
  label: 'Account',
  plural: 'Accounts',
  idKey: 'account_id',
  capability: 'crm',
  orgKey: 'org_id',
  title: (r) => r.name,
  subtitle: (r) => [r.relationship_type, r.record_type, r.city].filter(Boolean).join(' · '),
  fields: [
    { key: 'name', label: 'Firm name', type: 'text', required: true, column: true },
    { key: 'domain', label: 'Website domain', type: 'text', placeholder: 'e.g. kestrel.example' },
    { key: 'relationship_type', label: 'Relationship type', type: 'text', required: true, column: true },
    { key: 'record_type', label: 'Record type', type: 'text', required: true, column: true },
    { key: 'city', label: 'City', type: 'text', column: true },
    { key: 'industry', label: 'Industry', type: 'text' },
    { key: 'owner_user_id', label: 'Account owner', type: 'text', required: true },
    { key: 'stage', label: 'BD stage', type: 'enum', options: BD_STAGES },
    { key: 'deal_type', label: 'Deal type', type: 'enum', options: DEAL_TYPES },
    { key: 'potential_lakh', label: 'Deal potential', type: 'decimal', unit: '₹ L' },
    { key: 'probability', label: 'Probability', type: 'percent' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
    { key: 'created_by', label: 'Created by', type: 'text' },
    { key: 'created_at', label: 'Created', type: 'datetime', system: true },
  ],
  searchKeys: ['name', 'domain', 'industry', 'city'],
  newId: () => shortId('ACC'),
  validate: (d, db, _mode, original) => {
    const errors: Record<string, string> = {}
    const key = firmKey(d.name ?? '')
    const dup = db.crm_accounts.find((a) => a.org_id === d.org_id && a.account_id !== d.account_id && (a.name.trim().toLowerCase() === String(d.name).trim().toLowerCase() || (key && firmKey(a.name) === key)))
    if (dup) errors.name = `${dup.name} is already an account — log against it instead.`
    if (d.domain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(d.domain)) errors.domain = 'Enter a domain like company.com (no https://).'
    if (!db.users.some((u) => u.user_id === d.owner_user_id && u.org_id === d.org_id)) errors.owner_user_id = 'Owner must be someone in your organisation.'
    checkPicklist(db, d, original, 'record_type', 'record_type', 'Record type', errors)
    checkPicklist(db, d, original, 'relationship_type', 'relationship_type', 'Relationship type', errors)
    return errors
  },
  derive: (d, _db, mode) => {
    d.name = String(d.name ?? '').trim()
    d.domain = d.domain ? String(d.domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') : null
    if (mode === 'create') d.created_at = new Date().toISOString()
    if (!d.stage) Object.assign(d, { stage: null })
  },
  blockers: (r, db) => {
    const c = db.crm_contacts.filter((x) => x.account_id === r.account_id).length
    const a = db.crm_activities.filter((x) => x.account_id === r.account_id).length
    return [c && `${c} contact${c === 1 ? '' : 's'}`, a && `${a} meeting${a === 1 ? '' : 's'}`].filter(Boolean) as string[]
  },
  deleteHint: 'Accounts with history are kept for the record.',
}

const crmContact: EntityDef = {
  key: 'crmContact',
  name: 'CrmContact',
  label: 'Contact',
  plural: 'Contacts',
  idKey: 'contact_id',
  capability: 'crm',
  orgKey: 'org_id',
  title: (r) => fullName(r as { first_name: string; last_name: string }),
  subtitle: (r) => r.title ?? '',
  fields: [
    { key: 'account_id', label: 'Account', type: 'text', required: true },
    { key: 'first_name', label: 'First name', type: 'text', required: true, column: true },
    { key: 'last_name', label: 'Last name', type: 'text', required: true, column: true },
    { key: 'title', label: 'Title', type: 'text', column: true },
    { key: 'email', label: 'Email', type: 'text', column: true },
    { key: 'phone_cc', label: 'Country code', type: 'text' },
    { key: 'phone', label: 'Mobile', type: 'text', column: true },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'created_by', label: 'Created by', type: 'text' },
    { key: 'created_at', label: 'Created', type: 'datetime', system: true },
  ],
  searchKeys: ['first_name', 'last_name', 'title', 'email'],
  newId: () => shortId('CON'),
  validate: (d, db) => {
    const errors: Record<string, string> = {}
    if (!db.crm_accounts.some((a) => a.account_id === d.account_id && a.org_id === d.org_id)) errors.account_id = 'Choose an account.'
    if (d.email) {
      const p = emailProblem(d.email)
      if (p) errors.email = p
      else if (db.crm_contacts.some((c) => c.org_id === d.org_id && c.contact_id !== d.contact_id && c.email?.toLowerCase() === String(d.email).toLowerCase()))
        errors.email = 'Another contact already has this email.'
    }
    if (d.phone) {
      const p = phoneProblem(d.phone_cc ?? '+91', d.phone)
      if (p) errors.phone = p
    }
    return errors
  },
  derive: (d, _db, mode) => {
    d.first_name = String(d.first_name ?? '').trim()
    d.last_name = String(d.last_name ?? '').trim()
    d.email = d.email ? String(d.email).trim().toLowerCase() : null
    d.phone = d.phone ? String(d.phone).replace(/[\s-]/g, '') : null
    d.phone_cc = d.phone_cc || '+91'
    if (mode === 'create') d.created_at = new Date().toISOString()
  },
  blockers: (r, db) => {
    const n = db.crm_activities.filter((a) => a.contact_ids.includes(r.contact_id)).length
    return n ? [`${n} meeting${n === 1 ? '' : 's'}`] : []
  },
}

const crmActivity: EntityDef = {
  key: 'crmActivity',
  name: 'CrmActivity',
  label: 'Meeting',
  plural: 'Meetings',
  idKey: 'activity_id',
  capability: 'crm',
  orgKey: 'org_id',
  title: (r) => `${r.purpose} · ${r.date}`,
  fields: [
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'account_id', label: 'Firm', type: 'text', required: true },
    { key: 'contact_ids', label: 'Person met', type: 'json', required: true },
    { key: 'record_type', label: 'Record type', type: 'text', required: true },
    { key: 'city', label: 'City', type: 'text', required: true },
    { key: 'medium', label: 'Meeting medium', type: 'text', required: true },
    { key: 'purpose', label: 'Meeting purpose', type: 'text', required: true },
    { key: 'primary_attendee_id', label: 'Primary attendee', type: 'text', required: true },
    { key: 'additional_attendees', label: 'Additional attendees', type: 'json' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
    { key: 'next_action', label: 'Next action', type: 'text' },
    { key: 'next_action_date', label: 'Next action date', type: 'date' },
    { key: 'next_action_done', label: 'Next action done', type: 'bool' },
    { key: 'created_by', label: 'Logged by', type: 'text' },
    { key: 'created_at', label: 'Logged', type: 'datetime', system: true },
  ],
  searchKeys: ['notes', 'purpose', 'medium'],
  newId: () => shortId('MTG'),
  validate: (d, db, _mode, original) => {
    const errors: Record<string, string> = {}
    if (d.date && d.date > new Date().toISOString().slice(0, 10)) errors.date = 'Log meetings that have happened — use Next action for future ones.'
    if (!db.crm_accounts.some((a) => a.account_id === d.account_id && a.org_id === d.org_id)) errors.account_id = 'Choose the firm you met.'
    const contacts = (d.contact_ids ?? []) as string[]
    if (contacts.some((id) => !db.crm_contacts.some((c) => c.contact_id === id && c.account_id === d.account_id))) errors.contact_ids = 'People met must be contacts of this firm.'
    if (!db.users.some((u) => u.user_id === d.primary_attendee_id && u.org_id === d.org_id)) errors.primary_attendee_id = 'Primary attendee must be someone in your organisation.'
    checkPicklist(db, d, original, 'record_type', 'record_type', 'Record type', errors)
    checkPicklist(db, d, original, 'medium', 'meeting_medium', 'Meeting medium', errors)
    checkPicklist(db, d, original, 'purpose', 'meeting_purpose', 'Meeting purpose', errors)
    checkPicklist(db, d, original, 'next_action', 'next_action', 'Next action', errors)
    if (d.next_action && !d.next_action_date) errors.next_action_date = 'Pick a date for the next action.'
    if (d.next_action_date && !d.next_action) errors.next_action = 'Choose the next action for this date.'
    if (d.next_action_date && d.date && d.next_action_date < d.date) errors.next_action_date = 'Next action can’t be before the meeting.'
    return errors
  },
  derive: (d, _db, mode) => {
    d.additional_attendees = ((d.additional_attendees ?? []) as string[]).map((x) => x.trim()).filter(Boolean)
    d.next_action = d.next_action || null
    d.next_action_date = d.next_action ? d.next_action_date || null : null
    d.next_action_done = !!d.next_action_done
    if (mode === 'create') d.created_at = new Date().toISOString()
  },
}

export const CRM_ENTITIES = { crmAccount, crmContact, crmActivity }
