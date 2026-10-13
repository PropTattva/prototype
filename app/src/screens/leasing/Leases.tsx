import { useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { Lease } from '../../domain/leasing'
import { addMonths, todayIso } from '../../lib/dates'
import { linkFor } from '../../lib/links'
import { href, navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import EntityPage from '../../components/crud/EntityPage'

const VIEWS = [
  { key: 'all', label: 'All leases' },
  { key: 'expiring', label: 'Expiring ≤ 12 months' },
  { key: 'break', label: 'Break ≤ 6 months' },
  { key: 'ended', label: 'Expired / terminated' },
]

/** E3-S01: the lease register per asset, with the expiry and break views that drive renewals. */
export default function Leases({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const [view, setView] = useState('all')
  const { data: all } = useApi(() => api.list('lease', session), [session.user.user_id])
  const in12 = addMonths(todayIso(), 12)
  const in6 = addMonths(todayIso(), 6)
  const filters: Record<string, (l: Lease) => boolean> = {
    all: () => true,
    expiring: (l) => l.status === 'Active' && l.expiry <= in12,
    break: (l) => l.status === 'Active' && !!l.break_date && l.break_date <= in6,
    ended: (l) => l.status === 'Expired' || l.status === 'Terminated',
  }
  const count = (k: string) => (all as Lease[] | undefined)?.filter(filters[k]).length ?? 0
  const rentRoll = (all as Lease[] | undefined)?.filter((l) => l.status === 'Active' && l.rent != null).reduce((s, l) => s + l.rent! * l.area * 12, 0)

  return (
    <EntityPage
      entity="lease"
      basePath="leases"
      rest={rest}
      title="Leases"
      subtitle={rentRoll ? `Annual rent roll ₹${(rentRoll / 1e7).toFixed(1)} Cr across ${count('all') - count('ended')} active leases` : 'The lease register across your assets'}
      linkTo={linkFor(session)}
      ownOrgOnly={session.role === 'Owner/Developer'}
      rowHref={(r) => href(`leases/${r.lease_id}`)}
      onNew={() => navigate('leases/new')}
      filter={(r) => filters[view](r as Lease)}
      banner={
        <div className="mb-3 flex flex-wrap gap-1.5">
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => setView(v.key)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${view === v.key ? 'border-royal bg-royal text-white' : 'border-line bg-white text-ink-soft hover:border-royal hover:text-royal'}`}>
              {v.label} <span className={view === v.key ? 'text-gold' : 'text-ink-muted'}>{count(v.key)}</span>
            </button>
          ))}
        </div>
      }
    />
  )
}
