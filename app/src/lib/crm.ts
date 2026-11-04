// CRM rules shared by the mock server and the screens: default dropdowns, contact checks, reminders.
import type { CrmActivity, CrmContact, PicklistKey } from '../domain/crm'

export const PICKLISTS: { key: PicklistKey; label: string; help: string }[] = [
  { key: 'record_type', label: 'Record type', help: 'Why this relationship matters to the business' },
  { key: 'relationship_type', label: 'Relationship type', help: 'What kind of firm the account is' },
  { key: 'meeting_medium', label: 'Meeting medium', help: 'How the meeting happened' },
  { key: 'meeting_purpose', label: 'Meeting purpose', help: 'What the meeting was for' },
  { key: 'next_action', label: 'Next action', help: 'What happens after the meeting' },
]

/** Platform defaults; each org can add, rename and retire values on top of these. */
export const DEFAULT_PICKLISTS: Record<PicklistKey, string[]> = {
  record_type: ['BD', 'CRM', 'Pitch', 'Network', 'Hire', 'Partner'],
  relationship_type: ['Occupier', 'Owner'],
  meeting_medium: ['F2F', 'Call', 'Video', 'Email', 'Site visit', 'Event', 'Group Meeting', 'Other'],
  meeting_purpose: ['Intro Meeting', 'Periodic-Catch Up', 'Pitch', 'Follow-Up', 'Review/Update', 'Negotiation', 'Site Visit', 'Hiring discussion'],
  next_action: ['Follow-up', 'Prospect', 'Assessment', 'Proposal', 'Collab', 'Network', 'General', 'Future'],
}

export const picklistLabel = (key: PicklistKey) => PICKLISTS.find((p) => p.key === key)!.label

export const DEAL_TYPES = ['New office', 'Expansion', 'Renewal', 'Relocation', 'Property development', 'Investment'] as const

export const COUNTRY_CODES = [
  { cc: '+91', label: 'India +91' },
  { cc: '+1', label: 'US / Canada +1' },
  { cc: '+44', label: 'UK +44' },
  { cc: '+65', label: 'Singapore +65' },
  { cc: '+971', label: 'UAE +971' },
  { cc: '+61', label: 'Australia +61' },
  { cc: '+49', label: 'Germany +49' },
  { cc: '+81', label: 'Japan +81' },
]

export const CITIES = ['Bengaluru', 'Gurugram', 'Mumbai', 'Hyderabad', 'Pune', 'Chennai', 'Noida', 'Kolkata']

const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'aol.com', 'rediffmail.com', 'proton.me', 'protonmail.com', 'zohomail.com', 'gmx.com', 'mail.com',
])

export const emailDomain = (email: string) => email.trim().toLowerCase().split('@')[1] ?? ''

/** Error message for a contact email, or null when it is an acceptable official address. */
export function emailProblem(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.'
  if (PERSONAL_DOMAINS.has(emailDomain(email))) return 'Use the official company email — personal mailboxes are not allowed.'
  return null
}

/** Error message for a mobile number in the given dialling code, or null when valid. */
export function phoneProblem(cc: string, phone: string): string | null {
  const digits = phone.replace(/[\s-]/g, '')
  if (!/^\d+$/.test(digits)) return 'Digits only.'
  if (cc === '+91') return /^[6-9]\d{9}$/.test(digits) ? null : 'Indian mobile numbers have 10 digits starting 6–9.'
  return digits.length >= 6 && digits.length <= 14 ? null : 'Enter 6–14 digits.'
}

export const fullName = (c: Pick<CrmContact, 'first_name' | 'last_name'>) => `${c.first_name} ${c.last_name}`.trim()

export const fmtPhone = (c: Pick<CrmContact, 'phone_cc' | 'phone'>) => {
  if (!c.phone) return null
  const d = c.phone.replace(/\D/g, '')
  return c.phone_cc === '+91' && d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : `${c.phone_cc} ${c.phone}`
}

/** Loose key for spotting duplicate firms: "Microsoft India Pvt Ltd" ~ "microsoft". */
export function firmKey(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(pvt|private|ltd|limited|llp|inc|corp|corporation|co|company|india|gcc|the|and|group)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Where a new meeting most likely happened: the viewer's last meeting city, else the org's home city. */
export function defaultCity(activities: CrmActivity[], userId: string, orgHome: string) {
  const mine = activities.filter((a) => a.primary_attendee_id === userId).sort((a, b) => b.date.localeCompare(a.date))
  return mine[0]?.city ?? orgHome
}

export const ORG_HOME_CITY: Record<string, string> = { 'OWN-2': 'Gurugram', 'OWN-3': 'Mumbai', 'ENB-1': 'Mumbai', 'ENB-2': 'Gurugram' }

/** Open next action that is due: the follow-up the attendee owes. */
export const isOpenAction = (a: CrmActivity) => !!a.next_action && !!a.next_action_date && !a.next_action_done

// ---------------------------------------------------------------- Outlook reminder (.ics)

const icsDate = (iso: string, time: string) => `${iso.replace(/-/g, '')}T${time.replace(':', '')}00`
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`)

/** A calendar invite with a 15-minute reminder that Outlook (or any calendar) opens directly. */
export function nextActionIcs(opts: { uid: string; title: string; date: string; description: string; location: string }) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PropTattva//CRM//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${opts.uid}@proptattva.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsDate(opts.date, '10:00')}`,
    `DTEND:${icsDate(opts.date, '10:30')}`,
    `SUMMARY:${icsText(opts.title)}`,
    `DESCRIPTION:${icsText(opts.description)}`,
    `LOCATION:${icsText(opts.location)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(opts.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

export function downloadIcs(filename: string, ics: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
