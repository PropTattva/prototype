import { useState } from 'react'
import { fmtDate } from '../../lib/dates'
import { relativeTime } from '../../components/crud/fields'
import { navigate } from '../../state/router'
import PageHeader from '../../components/ui/PageHeader'
import { CrmHeaderActions } from './Activities'
import { accountStats, Chip, FilterSelect, NextActionTag, uniq, type CrmCtx } from './shared'

/** All firms in the org's book with their last meeting and open next action. */
export default function Accounts({ c }: { c: CrmCtx }) {
  const { book } = c
  const [q, setQ] = useState('')
  const [rel, setRel] = useState('')
  const [rec, setRec] = useState('')
  const [city, setCity] = useState('')
  const [owner, setOwner] = useState('')
  const stats = accountStats(c)
  const term = q.trim().toLowerCase()
  const rows = book.accounts
    .filter((a) => (!rel || a.relationship_type === rel) && (!rec || a.record_type === rec) && (!city || a.city === city) && (!owner || a.owner_user_id === owner))
    .filter((a) => !term || [a.name, a.domain, a.industry].join(' ').toLowerCase().includes(term))
    .sort((a, b) => (stats.get(b.account_id)?.last?.date ?? '').localeCompare(stats.get(a.account_id)?.last?.date ?? '') || a.name.localeCompare(b.name))

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle="Firms you deal with — occupiers, owners, partners — classified for future business development."
        right={<CrmHeaderActions c={c} extra={<button className="btn" onClick={() => c.open({ kind: 'account' })}>+ New account</button>} />}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input w-full sm:w-64" placeholder="Search firm, domain, industry" value={q} onChange={(e) => setQ(e.target.value)} />
        <FilterSelect label="Relationship" value={rel} options={uniq(book.accounts.map((a) => a.relationship_type))} onChange={setRel} />
        <FilterSelect label="Record type" value={rec} options={uniq(book.accounts.map((a) => a.record_type))} onChange={setRec} />
        <FilterSelect label="City" value={city} options={uniq(book.accounts.map((a) => a.city))} onChange={setCity} />
        <select aria-label="Owner" className={`input w-auto py-1 text-xs ${owner ? 'border-royal text-royal' : ''}`} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Owner: all</option>
          {book.team.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}{c.multiOrg ? ` · ${c.orgName(u.org_id)}` : ''}</option>)}
        </select>
        <span className="ml-auto text-[12px] text-ink-muted">{rows.length} of {book.accounts.length}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              <th className="px-4 py-2.5">Account</th>
              <th className="px-3 py-2.5">Classification</th>
              <th className="px-3 py-2.5">City</th>
              <th className="px-3 py-2.5 text-right">Contacts</th>
              <th className="px-3 py-2.5">Last meeting</th>
              <th className="px-3 py-2.5">Next action</th>
              <th className="px-4 py-2.5">Owner</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const s = stats.get(a.account_id)!
              return (
                <tr key={a.account_id} className="cursor-pointer border-b border-line-light hover:bg-royal-soft/40" onClick={() => navigate(`crm/accounts/${a.account_id}`)}>
                  <td className="px-4 py-2.5">
                    <div className="font-bold text-royal">{a.name}</div>
                    <div className="text-[11px] text-ink-muted">{[c.multiOrg && c.orgName(a.org_id), a.industry, a.domain].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <Chip tone="royal">{a.relationship_type}</Chip>
                      <Chip tone="gold">{a.record_type}</Chip>
                      {a.stage && <Chip tone={a.stage === 'Won' ? 'ok' : a.stage === 'Lost' ? 'crit' : 'muted'}>{a.stage}</Chip>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-ink-soft">{a.city ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right text-ink-soft">{s.contacts}</td>
                  <td className="px-3 py-2.5 text-ink-soft">
                    {s.last ? <>{fmtDate(s.last.date)} <span className="text-[11px] text-ink-muted">({relativeTime(s.last.date)})</span></> : <span className="text-ink-muted">Never</span>}
                  </td>
                  <td className="px-3 py-2.5">{s.open ? <NextActionTag a={s.open} /> : <span className="text-ink-muted">—</span>}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{c.userName(a.owner_user_id)}</td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-muted">{book.accounts.length ? 'No accounts match these filters.' : 'No accounts yet — log a meeting or add one.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
