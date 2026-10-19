import type { Lease } from '../../domain/leasing'
import { addMonths, todayIso } from '../../lib/dates'

export const LEASE_VIEWS = [
  { key: 'all', label: 'All leases' },
  { key: 'expiring', label: 'Expiring ≤ 12 months' },
  { key: 'break', label: 'Break ≤ 6 months' },
  { key: 'ended', label: 'Expired / terminated' },
] as const
export type LeaseView = (typeof LEASE_VIEWS)[number]['key']

export function leaseFilter(view: LeaseView): (l: Lease) => boolean {
  const in12 = addMonths(todayIso(), 12)
  const in6 = addMonths(todayIso(), 6)
  return {
    all: () => true,
    expiring: (l: Lease) => l.status === 'Active' && l.expiry <= in12,
    break: (l: Lease) => l.status === 'Active' && !!l.break_date && l.break_date <= in6,
    ended: (l: Lease) => l.status === 'Expired' || l.status === 'Terminated',
  }[view]
}

/** The expiry / break views that drive renewals, as large pills with live counts. */
export function LeaseViewPills({ leases, view, onChange }: { leases: Lease[]; view: LeaseView; onChange: (v: LeaseView) => void }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2.5">
      {LEASE_VIEWS.map((v) => {
        const on = view === v.key
        return (
          <button
            key={v.key}
            onClick={() => onChange(v.key)}
            className={`flex items-center gap-2.5 rounded-full border-2 px-5 py-2.5 text-sm font-bold transition ${on ? 'border-royal bg-royal text-white shadow-sm' : 'border-line bg-white text-ink-soft hover:border-royal hover:text-royal'}`}
          >
            {v.label}
            <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${on ? 'bg-gold text-royal-dark' : 'bg-hover text-ink'}`}>{leases.filter(leaseFilter(v.key)).length}</span>
          </button>
        )
      })}
    </div>
  )
}
