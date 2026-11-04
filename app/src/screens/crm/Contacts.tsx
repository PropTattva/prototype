import { useState } from 'react'
import { fmtPhone, fullName } from '../../lib/crm'
import { fmtDate } from '../../lib/dates'
import { navigate } from '../../state/router'
import PageHeader from '../../components/ui/PageHeader'
import { CrmHeaderActions } from './Activities'
import { FilterSelect, uniq, type CrmCtx } from './shared'

/** Everyone the org has met, with their firm and when they were last met. */
export default function Contacts({ c }: { c: CrmCtx }) {
  const { book } = c
  const [q, setQ] = useState('')
  const [rel, setRel] = useState('')
  const [city, setCity] = useState('')
  const met = new Map<string, { last: string; n: number }>()
  for (const m of book.activities)
    for (const id of m.contact_ids) {
      const s = met.get(id) ?? { last: '', n: 0 }
      met.set(id, { last: m.date > s.last ? m.date : s.last, n: s.n + 1 })
    }
  const term = q.trim().toLowerCase()
  const rows = book.contacts
    .filter((x) => {
      const acc = c.account(x.account_id)
      if (rel && acc?.relationship_type !== rel) return false
      if (city && x.city !== city) return false
      return !term || [fullName(x), x.title, x.email, acc?.name].join(' ').toLowerCase().includes(term)
    })
    .sort((a, b) => (met.get(b.contact_id)?.last ?? '').localeCompare(met.get(a.contact_id)?.last ?? '') || fullName(a).localeCompare(fullName(b)))

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle="People at your accounts. Official emails only; mobiles default to India (+91)."
        right={<CrmHeaderActions c={c} extra={<button className="btn" onClick={() => c.open({ kind: 'contact' })}>+ New contact</button>} />}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input w-full sm:w-64" placeholder="Search name, title, email, firm" value={q} onChange={(e) => setQ(e.target.value)} />
        <FilterSelect label="Relationship" value={rel} options={uniq(book.accounts.map((a) => a.relationship_type))} onChange={setRel} />
        <FilterSelect label="City" value={city} options={uniq(book.contacts.map((x) => x.city))} onChange={setCity} />
        <span className="ml-auto text-[12px] text-ink-muted">{rows.length} of {book.contacts.length}</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              <th className="px-4 py-2.5">Name</th>
              <th className="px-3 py-2.5">Account</th>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Mobile</th>
              <th className="px-3 py-2.5 text-right">Meetings</th>
              <th className="px-4 py-2.5">Last met</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const m = met.get(x.contact_id)
              return (
                <tr key={x.contact_id} className="cursor-pointer border-b border-line-light hover:bg-royal-soft/40" onClick={() => navigate(`crm/contacts/${x.contact_id}`)}>
                  <td className="px-4 py-2.5">
                    <div className="font-bold text-royal">{fullName(x)}</div>
                    {x.title && <div className="text-[11px] text-ink-muted">{x.title}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-ink-soft">
                    {c.account(x.account_id)?.name}
                    {c.multiOrg && <div className="text-[11px] text-ink-muted">{c.orgName(x.org_id)}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-ink-soft">{x.email ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-soft">{fmtPhone(x) ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right text-ink-soft">{m?.n ?? 0}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{m ? fmtDate(m.last) : <span className="text-ink-muted">Not met</span>}</td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-muted">{book.contacts.length ? 'No contacts match.' : 'No contacts yet.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
