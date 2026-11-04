import { useMemo, useState, type ReactNode } from 'react'
import * as api from '../../data/api'
import { ApiError } from '../../data/api'
import type { CrmActivity } from '../../domain/crm'
import { CITIES, COUNTRY_CODES, downloadIcs, emailDomain, emailProblem, firmKey, fullName, nextActionIcs, phoneProblem } from '../../lib/crm'
import { fmtDate, todayIso } from '../../lib/dates'
import PicklistSelect from '../../components/crm/PicklistSelect'
import Drawer from '../../components/ui/Drawer'
import { useToast } from '../../components/ui/Toast'
import { Chip, OrgPicker, type CrmCtx } from './shared'

type NewPerson = { first_name: string; last_name: string; title: string; email: string; phone_cc: string; phone: string }
type Person = { mode: 'existing'; contact_id: string } | ({ mode: 'new' } & NewPerson)

const blankPerson = (): Person => ({ mode: 'new', first_name: '', last_name: '', title: '', email: '', phone_cc: '+91', phone: '' })

function Field({ label, htmlFor, error, hint, children, className = '' }: { label: string; htmlFor?: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="mt-1 text-[11px] font-semibold text-crit">{error}</p> : hint && <p className="mt-1 text-[11px] text-ink-muted">{hint}</p>}
    </div>
  )
}

/** Log a meeting (or edit one). Creates the firm and any new people in the same save. */
export default function LogMeeting({ c, accountId, contactId, activityId, onClose }: { c: CrmCtx; accountId?: string; contactId?: string; activityId?: string; onClose: () => void }) {
  const toast = useToast()
  const { book, session } = c
  const me = session.user.user_id
  const editing = activityId ? book.activities.find((a) => a.activity_id === activityId) : undefined
  const startAccount = editing?.account_id ?? accountId ?? ''
  const acc0 = startAccount ? c.account(startAccount) : undefined

  // The org whose CRM this meeting belongs to; only the platform admin can pick one.
  const fresh = (accId: string, org = c.account(accId)?.org_id ?? editing?.org_id ?? c.defaultOrg) => ({
    org,
    date: todayIso(),
    accountId: accId,
    query: '',
    newAccount: { name: '', relationship_type: '', domain: '' },
    recordType: (accId && c.account(accId)?.record_type) || '',
    city: book.homeCity,
    people: (contactId ? [{ mode: 'existing', contact_id: contactId }] : accId ? [{ mode: 'existing', contact_id: '' }] : [blankPerson()]) as Person[],
    medium: '',
    purpose: '',
    primary: c.teamOf(org).some((u) => u.user_id === me) ? me : c.teamOf(org)[0]?.user_id ?? '',
    additional: [] as string[],
    notes: '',
    nextAction: '',
    nextDate: '',
    reminder: true,
    closePrevious: true,
  })
  const [f, setF] = useState(() =>
    editing
      ? {
          ...fresh(editing.account_id),
          date: editing.date,
          recordType: editing.record_type,
          city: editing.city,
          people: editing.contact_ids.map((id) => ({ mode: 'existing', contact_id: id }) as Person),
          medium: editing.medium,
          purpose: editing.purpose,
          primary: editing.primary_attendee_id,
          additional: editing.additional_attendees,
          notes: editing.notes ?? '',
          nextAction: editing.next_action ?? '',
          nextDate: editing.next_action_date ?? '',
          reminder: false,
          closePrevious: false,
        }
      : fresh(startAccount),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [other, setOther] = useState('')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const err = (k: string) => errors[k]

  const team = c.teamOf(f.org)
  const lists = c.listsOf(f.org)
  const account = f.accountId ? c.account(f.accountId) : undefined
  const isNew = !f.accountId
  const accountContacts = book.contacts.filter((x) => x.account_id === f.accountId)
  const openEarlier = account ? book.activities.filter((a) => a.account_id === account.account_id && a.next_action && !a.next_action_done && a.activity_id !== activityId) : []

  // Firm typeahead and duplicate guard
  const matches = useMemo(() => {
    const q = f.query.trim().toLowerCase()
    if (!q) return []
    const key = firmKey(q)
    return book.accounts.filter((a) => a.org_id === f.org && (a.name.toLowerCase().includes(q) || (key && firmKey(a.name).includes(key)))).slice(0, 6)
  }, [f.query, f.org, book.accounts])
  const exact = matches.find((a) => a.name.trim().toLowerCase() === f.query.trim().toLowerCase() || firmKey(a.name) === firmKey(f.query))

  const pickAccount = (id: string) => {
    const a = c.account(id)!
    setF((x) => ({ ...x, accountId: id, query: '', recordType: x.recordType || a.record_type, people: [{ mode: 'existing', contact_id: '' }] }))
    setErrors({})
  }
  const startNewAccount = () => setF((x) => ({ ...x, newAccount: { ...x.newAccount, name: x.query.trim() }, people: x.people.map((p) => (p.mode === 'new' ? p : blankPerson())) }))

  const setPerson = (i: number, p: Person) => set('people', f.people.map((x, k) => (k === i ? p : x)))
  const setNewField = (i: number, k: keyof NewPerson, v: string) => {
    const p = f.people[i]
    if (p.mode !== 'new') return
    setPerson(i, { ...p, [k]: v })
    // A new firm picks up its domain from the first official email entered.
    if (k === 'email' && isNew && !f.newAccount.domain && !emailProblem(v)) set('newAccount', { ...f.newAccount, domain: emailDomain(v) })
  }

  const check = () => {
    const e: Record<string, string> = {}
    if (!f.date) e['activity.date'] = 'Date is required.'
    else if (f.date > todayIso()) e['activity.date'] = 'Log meetings that have happened.'
    if (isNew) {
      if (!f.newAccount.name.trim()) e['account.name'] = 'Enter the firm you met.'
      if (!f.newAccount.relationship_type) e['account.relationship_type'] = 'Choose the relationship type.'
    }
    if (!f.recordType) e['activity.record_type'] = 'Choose a record type.'
    if (!f.city.trim()) e['activity.city'] = 'City is required.'
    f.people.forEach((p, i) => {
      if (p.mode === 'existing') {
        if (!p.contact_id) e[`contact${i}.pick`] = 'Choose who you met, or add a new person.'
        return
      }
      if (!p.first_name.trim()) e[`contact${i}.first_name`] = 'First name is required.'
      if (!p.last_name.trim()) e[`contact${i}.last_name`] = 'Last name is required.'
      if (p.email.trim()) {
        const m = emailProblem(p.email)
        if (m) e[`contact${i}.email`] = m
      }
      if (p.phone.trim()) {
        const m = phoneProblem(p.phone_cc, p.phone)
        if (m) e[`contact${i}.phone`] = m
      }
    })
    if (!f.medium) e['activity.medium'] = 'Choose the meeting medium.'
    if (!f.purpose) e['activity.purpose'] = 'Choose the meeting purpose.'
    if (!f.primary) e['activity.primary_attendee_id'] = 'Choose the primary attendee.'
    if (f.nextAction && !f.nextDate) e['activity.next_action_date'] = 'Pick a date for the next action.'
    if (f.nextDate && !f.nextAction) e['activity.next_action'] = 'Choose the next action.'
    if (f.nextDate && f.date && f.nextDate < f.date) e['activity.next_action_date'] = 'Next action can’t be before the meeting.'
    setErrors(e)
    return !Object.keys(e).length
  }

  const activityFields = () => ({
    date: f.date,
    record_type: f.recordType,
    city: f.city.trim(),
    medium: f.medium,
    purpose: f.purpose,
    primary_attendee_id: f.primary,
    additional_attendees: f.additional,
    notes: f.notes.trim() || null,
    next_action: f.nextAction || null,
    next_action_date: f.nextAction ? f.nextDate : null,
  })

  const submit = async (again: boolean) => {
    if (!check()) {
      toast('error', 'Please fix the highlighted fields.')
      return
    }
    setBusy(true)
    try {
      let saved: CrmActivity
      let firm: string
      if (editing) {
        // New people added while editing are created first, then linked.
        const ids: string[] = []
        for (const p of f.people) {
          if (p.mode === 'existing') ids.push(p.contact_id)
          else {
            const { mode: _m, ...rest } = p
            const con = await api.create('crmContact', { ...rest, org_id: editing.org_id, account_id: editing.account_id, city: f.city, created_by: me }, session)
            ids.push(con.contact_id)
          }
        }
        saved = (await api.update('crmActivity', editing.activity_id, { ...activityFields(), contact_ids: [...new Set(ids)], next_action_done: f.nextAction === editing.next_action && f.nextDate === editing.next_action_date ? editing.next_action_done : false }, session)) as CrmActivity
        firm = account?.name ?? ''
      } else {
        const res = await api.logMeeting(
          {
            account: isNew ? { new: { name: f.newAccount.name, relationship_type: f.newAccount.relationship_type, record_type: f.recordType, domain: f.newAccount.domain || null, city: f.city } } : { account_id: f.accountId },
            contacts: f.people.map((p) => (p.mode === 'existing' ? { contact_id: p.contact_id } : { new: { first_name: p.first_name, last_name: p.last_name, title: p.title || null, email: p.email || null, phone_cc: p.phone_cc, phone: p.phone || null, city: f.city } })),
            activity: activityFields(),
            closePrevious: f.closePrevious && openEarlier.length > 0,
            org_id: f.org,
          },
          session,
        )
        saved = res.activity
        firm = isNew ? f.newAccount.name : account?.name ?? ''
      }
      if (f.reminder && saved.next_action && saved.next_action_date)
        downloadIcs(
          `${firm.replace(/\W+/g, '-')}-${saved.next_action_date}.ics`,
          nextActionIcs({ uid: saved.activity_id, title: `${saved.next_action} — ${firm}`, date: saved.next_action_date, description: saved.notes ?? '', location: saved.city }),
        )
      toast('ok', editing ? 'Meeting updated.' : `Meeting with ${firm} logged${f.reminder && saved.next_action_date ? ' · Outlook reminder downloaded' : ''}.`)
      if (again) {
        setF({ ...fresh('', f.org), date: f.date, city: f.city, primary: f.primary })
        setErrors({})
      } else onClose()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION') {
        // logMeeting prefixes keys; plain update() errors are activity fields.
        const mapped = Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k.includes('.') ? k : `activity.${k}`, v]))
        setErrors(mapped)
        toast('error', Object.values(mapped)[0] ?? e.message)
      } else toast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!editing) return
    try {
      await api.remove('crmActivity', editing.activity_id, session)
      toast('ok', 'Meeting deleted.')
      onClose()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const teamOptions = team.filter((u) => u.user_id !== f.primary && !f.additional.includes(u.user_id))

  return (
    <Drawer
      open
      onClose={onClose}
      title={editing ? 'Edit meeting' : 'Log meeting'}
      sub={editing ? `${acc0?.name ?? ''} · ${fmtDate(editing.date)}` : 'Firm and people are created automatically if they’re new.'}
      footer={
        <>
          {editing && <button className="btn mr-auto text-crit" onClick={remove} disabled={busy}>Delete</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          {!editing && <button className="btn" disabled={busy} onClick={() => submit(true)}>Save & log another</button>}
          <button className="btn btn-gold" disabled={busy} onClick={() => submit(false)}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save meeting'}</button>
        </>
      }
    >
      <div className="space-y-5">
        {c.isAdmin && c.multiOrg && !editing && !accountId && (
          <OrgPicker c={c} id="m-org" value={f.org} onChange={(org) => { setF({ ...fresh('', org), date: f.date }); setErrors({}) }} />
        )}
        {/* When & where */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date *" htmlFor="m-date" error={err('activity.date')}>
            <input id="m-date" type="date" className="input" max={todayIso()} value={f.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="City *" htmlFor="m-city" error={err('activity.city')} hint="Change if the meeting was in another city">
            <input id="m-city" className="input" list="crm-cities" value={f.city} onChange={(e) => set('city', e.target.value)} />
            <datalist id="crm-cities">{CITIES.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
        </div>

        {/* Firm */}
        <section>
          <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-royal">Firm</h3>
          {account ? (
            <div className="flex items-start justify-between gap-2 rounded-lg border border-line bg-canvas px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[14px] font-bold text-ink">{account.name}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Chip tone="royal">{account.relationship_type}</Chip>
                  <Chip tone="gold">{account.record_type}</Chip>
                  {account.city && <Chip>{account.city}</Chip>}
                </div>
              </div>
              {!editing && !accountId && <button className="btn py-1 text-[11px]" onClick={() => setF((x) => ({ ...x, accountId: '', people: [blankPerson()] }))}>Change</button>}
            </div>
          ) : f.newAccount.name ? (
            <div className="space-y-3 rounded-lg border border-gold/60 bg-gold-light/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-ink">New firm: {f.newAccount.name}</span>
                <button className="btn py-1 text-[11px]" onClick={() => setF((x) => ({ ...x, query: x.newAccount.name, newAccount: { name: '', relationship_type: '', domain: '' } }))}>Change</button>
              </div>
              {err('account.name') && <p className="text-[11px] font-semibold text-crit">{err('account.name')}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Relationship type *" htmlFor="m-rel" error={err('account.relationship_type')}>
                  <PicklistSelect id="m-rel" list="relationship_type" values={lists.relationship_type} value={f.newAccount.relationship_type} onChange={(v) => set('newAccount', { ...f.newAccount, relationship_type: v })} session={session} orgId={f.org} invalid={!!err('account.relationship_type')} />
                </Field>
                <Field label="Website domain" htmlFor="m-dom" error={err('account.domain')} hint="Filled from the first official email">
                  <input id="m-dom" className="input" placeholder="company.com" value={f.newAccount.domain} onChange={(e) => set('newAccount', { ...f.newAccount, domain: e.target.value })} />
                </Field>
              </div>
            </div>
          ) : (
            <Field label="Firm name *" htmlFor="m-firm" error={err('account.name')}>
              <div className="relative">
                <input id="m-firm" className="input" autoComplete="off" placeholder="Start typing — e.g. Kestrel" value={f.query} onChange={(e) => set('query', e.target.value)} />
                {f.query.trim() && (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-line bg-white shadow-lg" role="listbox">
                    {matches.map((a) => (
                      <li key={a.account_id}>
                        <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-royal-soft" onClick={() => pickAccount(a.account_id)}>
                          <span className="font-semibold text-ink">{a.name}</span>
                          <span className="text-[11px] text-ink-muted">{a.relationship_type} · {a.city}</span>
                        </button>
                      </li>
                    ))}
                    {!exact && (
                      <li className="border-t border-line">
                        <button type="button" className="w-full px-3 py-2 text-left text-[13px] font-semibold text-gold-dark hover:bg-gold-light" onClick={startNewAccount}>
                          + Add “{f.query.trim()}” as a new firm
                        </button>
                        {matches.length > 0 && <p className="px-3 pb-2 text-[11px] text-warn">Similar firms exist above — pick one to avoid a duplicate.</p>}
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </Field>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Record type *" htmlFor="m-rec" error={err('activity.record_type') ?? err('account.record_type')}>
              <PicklistSelect id="m-rec" list="record_type" values={lists.record_type} value={f.recordType} onChange={(v) => set('recordType', v)} session={session} orgId={f.org} invalid={!!err('activity.record_type')} />
            </Field>
            {account && (
              <Field label="Relationship type">
                <div className="input bg-canvas text-ink-soft">{account.relationship_type}</div>
              </Field>
            )}
          </div>
        </section>

        {/* People met */}
        <section>
          <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-royal">Person met</h3>
          {err('activity.contact_ids') && <p className="mb-2 text-[11px] font-semibold text-crit">{err('activity.contact_ids')}</p>}
          <div className="space-y-3">
            {f.people.map((p, i) => (
              <div key={i} className="rounded-lg border border-line p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-ink-muted">Person {i + 1}</span>
                  {f.people.length > 1 && <button className="text-[11px] font-semibold text-crit hover:underline" onClick={() => set('people', f.people.filter((_, k) => k !== i))}>Remove</button>}
                </div>
                {p.mode === 'existing' ? (
                  <Field label="Contact *" htmlFor={`m-p${i}`} error={err(`contact${i}.pick`)}>
                    <select
                      id={`m-p${i}`}
                      className={`input ${err(`contact${i}.pick`) ? 'border-crit' : ''}`}
                      value={p.contact_id}
                      onChange={(e) => (e.target.value === '__new' ? setPerson(i, blankPerson()) : setPerson(i, { mode: 'existing', contact_id: e.target.value }))}
                    >
                      <option value="">Choose who you met…</option>
                      {accountContacts.map((x) => <option key={x.contact_id} value={x.contact_id}>{fullName(x)}{x.title ? ` — ${x.title}` : ''}</option>)}
                      <option value="__new">+ New person</option>
                    </select>
                    {p.contact_id && (() => {
                      const x = c.contact(p.contact_id)!
                      return <p className="mt-1 text-[11px] text-ink-muted">{[x.email, x.phone && `${x.phone_cc} ${x.phone}`].filter(Boolean).join(' · ') || 'No email or mobile on file'}</p>
                    })()}
                  </Field>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="First name *" htmlFor={`m-fn${i}`} error={err(`contact${i}.first_name`)}>
                      <input id={`m-fn${i}`} className="input" value={p.first_name} onChange={(e) => setNewField(i, 'first_name', e.target.value)} />
                    </Field>
                    <Field label="Last name *" htmlFor={`m-ln${i}`} error={err(`contact${i}.last_name`)}>
                      <input id={`m-ln${i}`} className="input" value={p.last_name} onChange={(e) => setNewField(i, 'last_name', e.target.value)} />
                    </Field>
                    <Field label="Title" htmlFor={`m-t${i}`} className="sm:col-span-2">
                      <input id={`m-t${i}`} className="input" placeholder="e.g. Head of Real Estate" value={p.title} onChange={(e) => setNewField(i, 'title', e.target.value)} />
                    </Field>
                    <Field
                      label="Official email"
                      htmlFor={`m-e${i}`}
                      error={err(`contact${i}.email`)}
                      className="sm:col-span-2"
                      hint={
                        account?.domain && p.email.includes('@') && emailDomain(p.email) !== account.domain
                          ? <span className="text-warn">Domain differs from {account.name} ({account.domain}) — double-check.</span>
                          : 'Company email only — no Gmail, Outlook.com etc.'
                      }
                    >
                      <input id={`m-e${i}`} type="email" className="input" placeholder="name@company.com" value={p.email} onChange={(e) => setNewField(i, 'email', e.target.value)} />
                    </Field>
                    <Field label="Mobile" htmlFor={`m-ph${i}`} error={err(`contact${i}.phone`)} className="sm:col-span-2">
                      <div className="flex gap-1.5">
                        <select aria-label="Country code" className="input w-36" value={p.phone_cc} onChange={(e) => setNewField(i, 'phone_cc', e.target.value)}>
                          {COUNTRY_CODES.map((x) => <option key={x.cc} value={x.cc}>{x.label}</option>)}
                        </select>
                        <input id={`m-ph${i}`} type="tel" inputMode="numeric" className="input" placeholder={p.phone_cc === '+91' ? '98450 12345' : 'Number'} value={p.phone} onChange={(e) => setNewField(i, 'phone', e.target.value)} />
                      </div>
                    </Field>
                    {!isNew && <button className="text-left text-[11px] font-semibold text-royal hover:underline sm:col-span-2" onClick={() => setPerson(i, { mode: 'existing', contact_id: '' })}>← Pick an existing contact instead</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button className="btn mt-2" onClick={() => set('people', [...f.people, isNew ? blankPerson() : { mode: 'existing', contact_id: '' }])}>+ Add another person</button>
        </section>

        {/* Meeting */}
        <section>
          <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-royal">Meeting</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Meeting medium *" htmlFor="m-med" error={err('activity.medium')}>
              <PicklistSelect id="m-med" list="meeting_medium" values={lists.meeting_medium} value={f.medium} onChange={(v) => set('medium', v)} session={session} orgId={f.org} invalid={!!err('activity.medium')} />
            </Field>
            <Field label="Meeting purpose *" htmlFor="m-pur" error={err('activity.purpose')}>
              <PicklistSelect id="m-pur" list="meeting_purpose" values={lists.meeting_purpose} value={f.purpose} onChange={(v) => set('purpose', v)} session={session} orgId={f.org} invalid={!!err('activity.purpose')} />
            </Field>
            <Field label="Primary attendee *" htmlFor="m-pri" error={err('activity.primary_attendee_id')} hint={f.primary !== me ? 'Logging on behalf of a colleague' : undefined}>
              <select id="m-pri" className="input" value={f.primary} onChange={(e) => setF((x) => ({ ...x, primary: e.target.value, additional: x.additional.filter((a) => a !== e.target.value) }))}>
                {team.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}{u.user_id === me ? ' (you)' : ''}</option>)}
              </select>
            </Field>
            <Field label="Additional attendees" htmlFor="m-add">
              <div className="flex flex-wrap gap-1.5">
                {f.additional.map((a) => (
                  <span key={a} className="inline-flex items-center gap-1 rounded-full bg-royal-soft px-2.5 py-1 text-[12px] font-semibold text-royal">
                    {c.userName(a)}
                    <button aria-label={`Remove ${c.userName(a)}`} className="text-royal/60 hover:text-crit" onClick={() => set('additional', f.additional.filter((x) => x !== a))}>×</button>
                  </span>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                {teamOptions.length > 0 && (
                  <select id="m-add" className="input" value="" onChange={(e) => e.target.value && set('additional', [...f.additional, e.target.value])}>
                    <option value="">+ Add colleague…</option>
                    {teamOptions.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
                  </select>
                )}
                <input
                  aria-label="Other attendee name"
                  className="input"
                  placeholder="Or type a name, Enter"
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && other.trim()) {
                      e.preventDefault()
                      if (!f.additional.includes(other.trim())) set('additional', [...f.additional, other.trim()])
                      setOther('')
                    }
                  }}
                />
              </div>
            </Field>
          </div>
          <Field label="Notes" htmlFor="m-notes" className="mt-3" hint="Requirement details or next steps from the discussion">
            <textarea id="m-notes" rows={4} className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </section>

        {/* Next action */}
        <section className="rounded-lg border border-line bg-canvas p-3">
          <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-royal">Next action</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Next action" htmlFor="m-na" error={err('activity.next_action')}>
              <PicklistSelect id="m-na" list="next_action" values={lists.next_action} value={f.nextAction} onChange={(v) => set('nextAction', v)} session={session} orgId={f.org} placeholder="None" />
            </Field>
            <Field label="Next action date" htmlFor="m-nd" error={err('activity.next_action_date')}>
              <input id="m-nd" type="date" className="input" min={f.date} value={f.nextDate} onChange={(e) => set('nextDate', e.target.value)} />
            </Field>
          </div>
          <label className="mt-3 flex items-start gap-2 text-[12px] text-ink-soft">
            <input type="checkbox" className="mt-0.5" checked={f.reminder} onChange={(e) => set('reminder', e.target.checked)} />
            <span>Add reminder to Outlook — downloads a calendar invite (10:00, 15-min alert) when you save.</span>
          </label>
          {!editing && openEarlier.length > 0 && (
            <label className="mt-2 flex items-start gap-2 text-[12px] text-ink-soft">
              <input type="checkbox" className="mt-0.5" checked={f.closePrevious} onChange={(e) => set('closePrevious', e.target.checked)} />
              <span>
                Close the earlier open action{openEarlier.length > 1 ? 's' : ''}: {openEarlier.map((a) => `${a.next_action} (${fmtDate(a.next_action_date)})`).join(', ')}
              </span>
            </label>
          )}
        </section>
      </div>
    </Drawer>
  )
}
