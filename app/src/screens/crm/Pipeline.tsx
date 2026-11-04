import { useState } from 'react'
import { BD_STAGES } from '../../domain/crm'
import { relativeTime } from '../../components/crud/fields'
import { navigate } from '../../state/router'
import KpiCard from '../../components/ui/KpiCard'
import PageHeader from '../../components/ui/PageHeader'
import { CrmHeaderActions } from './Activities'
import { accountStats, initials, NextActionTag, type CrmCtx } from './shared'

const lakh = (n: number) => (n >= 100 ? `₹${(n / 100).toFixed(2)} Cr` : `₹${Math.round(n)} L`)

/** BD pipeline: accounts with a stage, by stage. Owners move their own deals from the account page. */
export default function Pipeline({ c }: { c: CrmCtx }) {
  const me = c.session.user.user_id
  const [mine, setMine] = useState(false)
  const stats = accountStats(c)
  const deals = c.book.accounts.filter((a) => a.stage && (!mine || a.owner_user_id === me))
  const open = deals.filter((a) => a.stage !== 'Won' && a.stage !== 'Lost')
  const value = open.reduce((s, a) => s + (a.potential_lakh ?? 0), 0)
  const weighted = open.reduce((s, a) => s + ((a.potential_lakh ?? 0) * (a.probability ?? 0)) / 100, 0)
  const won = deals.filter((a) => a.stage === 'Won').reduce((s, a) => s + (a.potential_lakh ?? 0), 0)

  return (
    <>
      <PageHeader
        title="BD pipeline"
        subtitle="Accounts being worked as deals. Everyone in your organisation sees the board; only an account’s owner moves its stage."
        right={<CrmHeaderActions c={c} extra={<button className="btn" onClick={() => c.open({ kind: 'account' })}>+ New account</button>} />}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Open deals" value={String(open.length)} />
        <KpiCard label="Open pipeline" value={lakh(value)} />
        <KpiCard label="Weighted pipeline" value={lakh(weighted)} hint="Potential × probability" />
        <KpiCard label="Won" value={lakh(won)} />
      </div>
      <div className="mb-3 flex gap-1.5">
        {[false, true].map((m) => (
          <button key={String(m)} onClick={() => setMine(m)} className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold ${mine === m ? 'border-royal bg-royal text-white' : 'border-line bg-white text-ink-soft hover:border-royal hover:text-royal'}`}>
            {m ? 'My deals' : 'All deals'}
          </button>
        ))}
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {BD_STAGES.map((st) => {
          const cards = deals.filter((a) => a.stage === st)
          const tone = st === 'Won' ? 'bg-ok-bg' : st === 'Lost' ? 'bg-crit-bg/50' : 'bg-white'
          return (
            <section key={st} className={`min-h-[220px] w-[200px] shrink-0 rounded-[7px] border border-line p-2.5 lg:w-auto lg:min-w-[160px] lg:flex-1 ${tone}`}>
              <header className="mb-2.5 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-[0.08em] text-royal">
                {st}
                <span className="rounded-full bg-royal-soft px-2 py-0.5 text-[10px]">{cards.length}</span>
              </header>
              {cards.map((a) => {
                const s = stats.get(a.account_id)!
                return (
                  <button key={a.account_id} onClick={() => navigate(`crm/accounts/${a.account_id}`)} className={`relative mb-2 block w-full rounded border-l-[3px] bg-canvas p-2.5 text-left text-[11px] hover:bg-royal-soft ${(a.probability ?? 0) >= 50 && st !== 'Won' ? 'border-gold' : 'border-royal'}`}>
                    <span className="absolute right-2 top-2 rounded-[3px] bg-royal px-1.5 text-[9px] font-bold text-gold-bright" title={c.userName(a.owner_user_id)}>{initials(c.userName(a.owner_user_id))}</span>
                    <span className="block pr-7 text-xs font-bold text-ink">{a.name}</span>
                    <span className="block text-[10px] text-ink-muted">{c.multiOrg ? `${c.orgName(a.org_id)} · ` : ''}{a.relationship_type} · {a.deal_type ?? '—'}</span>
                    <span className="block font-bold text-royal">{a.potential_lakh != null ? lakh(a.potential_lakh) : '—'}{a.probability != null && st !== 'Won' && st !== 'Lost' ? ` · ${a.probability}%` : ''}</span>
                    <span className="mt-1 block text-[10px] text-ink-muted">{s.last ? `Met ${relativeTime(s.last.date)}` : 'No meetings yet'}</span>
                    {s.open && <span className="block"><NextActionTag a={s.open} /></span>}
                  </button>
                )
              })}
            </section>
          )
        })}
      </div>
    </>
  )
}
