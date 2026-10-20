import type { Lease } from '../../domain/leasing'
import { fmtDate, todayIso } from '../../lib/dates'
import { cr, rentSchedule, rentToExpiry } from '../../lib/rentRoll'
import Card from '../ui/Card'

/** One lease's rent roll: today's rent, what's left to bill, and every escalation step across the term. */
export default function LeaseRentRoll({ lease, onCapture }: { lease: Lease; onCapture?: () => void }) {
  if (!('rent' in lease)) return null
  const today = todayIso()
  if (lease.rent == null) {
    return (
      <Card title="Rent roll" className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-soft">
          <span>Commercials haven't been captured yet, so this lease isn't in the rent roll.</span>
          {onCapture && <button className="btn btn-gold" onClick={onCapture}>Capture commercials →</button>}
        </div>
      </Card>
    )
  }
  const steps = rentSchedule(lease, today)
  const now = steps.find((s) => s.status === 'Current') ?? steps[steps.length - 1]
  const next = steps.find((s) => s.status === 'Upcoming')
  const remaining = lease.status === 'Active' ? rentToExpiry(steps, lease.area, today) : 0

  const stat = (label: string, value: string, hint?: string) => (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="mt-0.5 truncate text-lg font-extrabold text-royal">{value}</div>
      {hint && <div className="text-[11px] text-ink-muted">{hint}</div>}
    </div>
  )

  return (
    <Card
      title="Rent roll"
      sub={`${lease.escalation_pct ?? 0}% ${lease.escalation_freq?.toLowerCase() ?? ''} escalation · current rent treated as today's step`}
      action={onCapture && <button className="btn" onClick={onCapture}>Edit commercials</button>}
      className="mb-4"
    >
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat('Current rent', `₹${now.rent}/sq ft`, `+ CAM ₹${lease.CAM ?? 0}`)}
        {stat('Monthly billing', cr(now.monthly), 'rent + CAM, pre-GST')}
        {stat('Annual rent', cr(now.annual))}
        {stat('Rent to expiry', cr(remaining), next ? `Next step ${fmtDate(next.from)} → ₹${next.rent}` : 'No further escalations')}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              <th className="py-1.5 pr-3">Period</th>
              <th className="py-1.5 pr-3 text-right">Rent ₹/sq ft/mo</th>
              <th className="py-1.5 pr-3 text-right">Monthly</th>
              <th className="py-1.5 pr-3 text-right">Annual</th>
              <th className="py-1.5 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s) => (
              <tr key={s.from} className={`border-b border-line-light last:border-0 ${s.status === 'Current' ? 'bg-royal-soft/60 font-semibold' : s.status === 'Past' ? 'text-ink-muted' : ''}`}>
                <td className="py-1.5 pr-3">{fmtDate(s.from)} → {fmtDate(s.to)}</td>
                <td className="py-1.5 pr-3 text-right">₹{s.rent}</td>
                <td className="py-1.5 pr-3 text-right">{cr(s.monthly)}</td>
                <td className="py-1.5 pr-3 text-right">{cr(s.annual)}</td>
                <td className="py-1.5 text-right">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${s.status === 'Current' ? 'bg-royal text-white' : s.status === 'Upcoming' ? 'bg-gold-light text-gold-dark' : 'bg-hover text-ink-muted'}`}>{s.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
