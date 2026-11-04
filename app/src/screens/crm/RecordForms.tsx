import { useState, type ReactNode } from 'react'
import * as api from '../../data/api'
import { ApiError } from '../../data/api'
import { BD_STAGES } from '../../domain/crm'
import { CITIES, COUNTRY_CODES, DEAL_TYPES, emailDomain, emailProblem, firmKey, fullName, phoneProblem } from '../../lib/crm'
import { navigate } from '../../state/router'
import PicklistSelect from '../../components/crm/PicklistSelect'
import Drawer from '../../components/ui/Drawer'
import { useToast } from '../../components/ui/Toast'
import { OrgPicker, type CrmCtx } from './shared'

function Field({ label, htmlFor, error, hint, children, className = '' }: { label: string; htmlFor?: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="mt-1 text-[11px] font-semibold text-crit">{error}</p> : hint && <p className="mt-1 text-[11px] text-ink-muted">{hint}</p>}
    </div>
  )
}

const num = (v: string) => (v.trim() === '' ? null : Number(v))

/** Create or edit an account, including its BD pipeline fields. */
export function AccountForm({ c, id, onClose }: { c: CrmCtx; id?: string; onClose: () => void }) {
  const toast = useToast()
  const { book, session } = c
  const me = session.user.user_id
  const orig = id ? c.account(id) : undefined
  const [f, setF] = useState({
    org: orig?.org_id ?? c.defaultOrg,
    name: orig?.name ?? '',
    domain: orig?.domain ?? '',
    relationship_type: orig?.relationship_type ?? '',
    record_type: orig?.record_type ?? '',
    city: orig?.city ?? book.homeCity,
    industry: orig?.industry ?? '',
    owner_user_id: orig?.owner_user_id ?? (c.teamOf(orig?.org_id ?? c.defaultOrg).some((u) => u.user_id === me) ? me : c.teamOf(c.defaultOrg)[0]?.user_id ?? me),
    notes: orig?.notes ?? '',
    inPipeline: !!orig?.stage,
    stage: orig?.stage ?? 'Prospect',
    deal_type: orig?.deal_type ?? 'New office',
    potential_lakh: orig?.potential_lakh?.toString() ?? '',
    probability: orig?.probability?.toString() ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  // Pipeline stage and ownership belong to the account owner.
  const ownerOnly = !!orig && orig.owner_user_id !== me && session.role !== 'Super Admin'
  const team = c.teamOf(f.org)
  const lists = c.listsOf(f.org)
  const dup = f.name.trim() && book.accounts.find((a) => a.org_id === f.org && a.account_id !== id && (a.name.toLowerCase() === f.name.trim().toLowerCase() || (firmKey(f.name) && firmKey(a.name) === firmKey(f.name))))

  const save = async () => {
    const e: Record<string, string> = {}
    if (!f.name.trim()) e.name = 'Firm name is required.'
    if (!f.relationship_type) e.relationship_type = 'Choose a relationship type.'
    if (!f.record_type) e.record_type = 'Choose a record type.'
    setErrors(e)
    if (Object.keys(e).length) return
    const payload = {
      name: f.name, domain: f.domain || null, relationship_type: f.relationship_type, record_type: f.record_type, city: f.city || null,
      industry: f.industry || null, owner_user_id: f.owner_user_id, notes: f.notes || null,
      ...(f.inPipeline
        ? { stage: f.stage, deal_type: f.deal_type, potential_lakh: num(f.potential_lakh), probability: num(f.probability) }
        : { stage: null, deal_type: null, potential_lakh: null, probability: null }),
    }
    setBusy(true)
    try {
      if (orig) {
        await api.updateCrmAccount(orig.account_id, payload, session)
        toast('ok', `${f.name} updated.`)
        onClose()
      } else {
        const rec = await api.create('crmAccount', { ...payload, org_id: f.org, created_by: me }, session)
        toast('ok', `${rec.name} added. Add the people you deal with there.`)
        onClose()
        navigate(`crm/accounts/${rec.account_id}`)
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION') setErrors(err.fieldErrors)
      toast('error', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!orig) return
    try {
      await api.remove('crmAccount', orig.account_id, session)
      toast('ok', `${orig.name} deleted.`)
      onClose()
      navigate('crm/accounts')
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={orig ? `Edit ${orig.name}` : 'New account'}
      sub="A firm you deal with — for leasing, property development, partnerships or hiring."
      footer={
        <>
          {orig && <button className="btn mr-auto text-crit" disabled={busy} onClick={remove}>Delete</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" disabled={busy} onClick={save}>{busy ? 'Saving…' : orig ? 'Save changes' : 'Create account'}</button>
        </>
      }
    >
      {c.isAdmin && c.multiOrg && !orig && (
        <OrgPicker c={c} id="a-org" value={f.org} onChange={(org) => setF((x) => ({ ...x, org, owner_user_id: c.teamOf(org)[0]?.user_id ?? '', relationship_type: '', record_type: '' }))} />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Firm name *" htmlFor="a-name" error={errors.name} className="sm:col-span-2" hint={dup ? <span className="text-warn">{dup.name} already exists — open it instead of creating a duplicate.</span> : undefined}>
          <input id="a-name" className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Kestrel Retail Tech" />
        </Field>
        <Field label="Relationship type *" htmlFor="a-rel" error={errors.relationship_type}>
          <PicklistSelect id="a-rel" list="relationship_type" values={lists.relationship_type} value={f.relationship_type} onChange={(v) => set('relationship_type', v)} session={session} orgId={f.org} invalid={!!errors.relationship_type} />
        </Field>
        <Field label="Record type *" htmlFor="a-rec" error={errors.record_type}>
          <PicklistSelect id="a-rec" list="record_type" values={lists.record_type} value={f.record_type} onChange={(v) => set('record_type', v)} session={session} orgId={f.org} invalid={!!errors.record_type} />
        </Field>
        <Field label="Website domain" htmlFor="a-dom" error={errors.domain} hint="Used to check contact emails">
          <input id="a-dom" className="input" value={f.domain} onChange={(e) => set('domain', e.target.value)} placeholder="company.com" />
        </Field>
        <Field label="City" htmlFor="a-city">
          <input id="a-city" className="input" list="crm-cities-a" value={f.city} onChange={(e) => set('city', e.target.value)} />
          <datalist id="crm-cities-a">{CITIES.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        <Field label="Industry" htmlFor="a-ind">
          <input id="a-ind" className="input" value={f.industry} onChange={(e) => set('industry', e.target.value)} placeholder="e.g. BFSI" />
        </Field>
        <Field label="Account owner" htmlFor="a-own" error={errors.owner_user_id} hint={ownerOnly ? 'Only the owner can reassign' : undefined}>
          <select id="a-own" className="input" value={f.owner_user_id} disabled={ownerOnly} onChange={(e) => set('owner_user_id', e.target.value)}>
            {team.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Notes" htmlFor="a-notes" className="sm:col-span-2">
          <textarea id="a-notes" rows={3} className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>

      <section className="mt-5 rounded-lg border border-line bg-canvas p-3">
        <label className="flex items-center gap-2 text-[13px] font-bold text-royal">
          <input type="checkbox" checked={f.inPipeline} disabled={ownerOnly} onChange={(e) => set('inPipeline', e.target.checked)} />
          Track in the BD pipeline
        </label>
        {ownerOnly && <p className="mt-1 text-[11px] text-ink-muted">Only {c.userName(orig!.owner_user_id)} (account owner) can change the pipeline.</p>}
        {f.inPipeline && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Stage" htmlFor="a-stage">
              <select id="a-stage" className="input" value={f.stage} disabled={ownerOnly} onChange={(e) => set('stage', e.target.value as typeof f.stage)}>
                {BD_STAGES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Deal type" htmlFor="a-deal">
              <select id="a-deal" className="input" value={f.deal_type} disabled={ownerOnly} onChange={(e) => set('deal_type', e.target.value)}>
                {DEAL_TYPES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Deal potential (₹ lakh)" htmlFor="a-pot" error={errors.potential_lakh}>
              <input id="a-pot" type="number" min={0} className="input" value={f.potential_lakh} disabled={ownerOnly} onChange={(e) => set('potential_lakh', e.target.value)} />
            </Field>
            <Field label="Probability (%)" htmlFor="a-prob" error={errors.probability}>
              <input id="a-prob" type="number" min={0} max={100} className="input" value={f.probability} disabled={ownerOnly} onChange={(e) => set('probability', e.target.value)} />
            </Field>
          </div>
        )}
      </section>
    </Drawer>
  )
}

/** Create or edit a contact (a person at an account). */
export function ContactForm({ c, id, accountId, onClose }: { c: CrmCtx; id?: string; accountId?: string; onClose: () => void }) {
  const toast = useToast()
  const { book, session } = c
  const orig = id ? c.contact(id) : undefined
  const [f, setF] = useState({
    account_id: orig?.account_id ?? accountId ?? '',
    first_name: orig?.first_name ?? '',
    last_name: orig?.last_name ?? '',
    title: orig?.title ?? '',
    email: orig?.email ?? '',
    phone_cc: orig?.phone_cc ?? '+91',
    phone: orig?.phone ?? '',
    city: orig?.city ?? (accountId ? c.account(accountId)?.city ?? '' : ''),
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const acc = f.account_id ? c.account(f.account_id) : undefined
  const accounts = [...book.accounts].sort((a, b) => a.name.localeCompare(b.name))

  const save = async () => {
    const e: Record<string, string> = {}
    if (!f.account_id) e.account_id = 'Choose the account.'
    if (!f.first_name.trim()) e.first_name = 'First name is required.'
    if (!f.last_name.trim()) e.last_name = 'Last name is required.'
    if (f.email.trim()) {
      const m = emailProblem(f.email)
      if (m) e.email = m
    }
    if (f.phone.trim()) {
      const m = phoneProblem(f.phone_cc, f.phone)
      if (m) e.phone = m
    }
    setErrors(e)
    if (Object.keys(e).length) return
    const payload = { ...f, title: f.title || null, email: f.email || null, phone: f.phone || null, city: f.city || null }
    setBusy(true)
    try {
      if (orig) {
        await api.update('crmContact', orig.contact_id, payload, session)
        toast('ok', `${fullName(f)} updated.`)
      } else {
        await api.create('crmContact', { ...payload, org_id: acc?.org_id, created_by: session.user.user_id }, session)
        toast('ok', `${fullName(f)} added to ${acc?.name}.`)
      }
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION') setErrors(err.fieldErrors)
      toast('error', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!orig) return
    try {
      await api.remove('crmContact', orig.contact_id, session)
      toast('ok', `${fullName(orig)} deleted.`)
      onClose()
      navigate(`crm/accounts/${orig.account_id}`)
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={orig ? `Edit ${fullName(orig)}` : 'New contact'}
      sub={acc ? acc.name : 'A person at one of your accounts'}
      footer={
        <>
          {orig && <button className="btn mr-auto text-crit" disabled={busy} onClick={remove}>Delete</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" disabled={busy} onClick={save}>{busy ? 'Saving…' : orig ? 'Save changes' : 'Add contact'}</button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Account *" htmlFor="c-acc" error={errors.account_id} className="sm:col-span-2" hint={!accounts.length ? 'Create an account first.' : undefined}>
          <select id="c-acc" className="input" value={f.account_id} disabled={!!accountId && !orig} onChange={(e) => set('account_id', e.target.value)}>
            <option value="">Choose the firm…</option>
            {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name}{c.multiOrg ? ` — ${c.orgName(a.org_id)}` : ''}</option>)}
          </select>
        </Field>
        <Field label="First name *" htmlFor="c-fn" error={errors.first_name}>
          <input id="c-fn" className="input" value={f.first_name} onChange={(e) => set('first_name', e.target.value)} />
        </Field>
        <Field label="Last name *" htmlFor="c-ln" error={errors.last_name}>
          <input id="c-ln" className="input" value={f.last_name} onChange={(e) => set('last_name', e.target.value)} />
        </Field>
        <Field label="Title" htmlFor="c-t" className="sm:col-span-2">
          <input id="c-t" className="input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Head of Real Estate" />
        </Field>
        <Field
          label="Official email"
          htmlFor="c-e"
          error={errors.email}
          className="sm:col-span-2"
          hint={acc?.domain && f.email.includes('@') && emailDomain(f.email) !== acc.domain ? <span className="text-warn">Domain differs from {acc.name} ({acc.domain}) — double-check.</span> : 'Company email only — no Gmail, Outlook.com etc.'}
        >
          <input id="c-e" type="email" className="input" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="name@company.com" />
        </Field>
        <Field label="Mobile" htmlFor="c-ph" error={errors.phone} className="sm:col-span-2">
          <div className="flex gap-1.5">
            <select aria-label="Country code" className="input w-36" value={f.phone_cc} onChange={(e) => set('phone_cc', e.target.value)}>
              {COUNTRY_CODES.map((x) => <option key={x.cc} value={x.cc}>{x.label}</option>)}
            </select>
            <input id="c-ph" type="tel" inputMode="numeric" className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder={f.phone_cc === '+91' ? '98450 12345' : 'Number'} />
          </div>
        </Field>
        <Field label="City" htmlFor="c-city">
          <input id="c-city" className="input" list="crm-cities-c" value={f.city} onChange={(e) => set('city', e.target.value)} />
          <datalist id="crm-cities-c">{CITIES.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
      </div>
    </Drawer>
  )
}
