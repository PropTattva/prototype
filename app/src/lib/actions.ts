// Needs-action rules over the viewer's leases: renewals to start, expiries, breaks, escalations, deposits, overdue rent.
import type { Lease, LeaseRenewal, RentInvoice } from '../domain/leasing'
import type { OptionCtx } from '../entities/types'
import { addMonths, daysBetween } from './dates'
import { fmtSft } from './format'

export type ActionSeverity = 'Critical' | 'Warning' | 'Info'
export type ActionKind = 'Renewal' | 'Expiry' | 'Break' | 'Escalation' | 'Deposit' | 'Rent'

export interface ActionItem {
  id: string
  kind: ActionKind
  severity: ActionSeverity
  title: string
  /** occupier · building · area */
  context: string
  detail: string
  /** the date that drives urgency; negative days = overdue */
  due: string
  cta: string
  link: string
}

const RANK: Record<ActionSeverity, number> = { Critical: 0, Warning: 1, Info: 2 }
// Within a severity, lease-lifecycle actions come before collections.
const KIND_ORDER: ActionKind[] = ['Expiry', 'Renewal', 'Break', 'Rent', 'Deposit', 'Escalation']
const inr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(1)} Cr` : `₹${(n / 1e5).toFixed(1)} lakh`)
const YEARS: Record<string, number> = { Annual: 1, Biennial: 2, 'Every 3 years': 3 }

export function nextEscalation(l: Lease, today: string): string | null {
  const step = l.escalation_freq ? YEARS[l.escalation_freq] : null
  if (!step) return null
  let d = addMonths(l.start, step * 12)
  while (d <= today) d = addMonths(d, step * 12)
  return d < l.expiry ? d : null
}

export function needsAction(ctx: OptionCtx, renewals: LeaseRenewal[], invoices: RentInvoice[], today: string): ActionItem[] {
  const out: ActionItem[] = []
  const daysTo = (d: string) => daysBetween(today, d)
  const when = (n: number) => (n < 0 ? `${-n} days overdue` : n === 0 ? 'today' : `in ${n} days`)

  for (const l of ctx.leases) {
    if (l.status !== 'Active') continue
    const b = ctx.buildings.find((x) => x.building_id === l.building_id)
    const occ = ctx.occupiers.find((o) => o.occupier_id === l.occupier_id)?.name ?? 'Occupier'
    const context = [occ, b?.name, `${fmtSft(l.area)} sq ft`].filter(Boolean).join(' · ')
    const add = (a: Omit<ActionItem, 'context' | 'id'> & { id: string }) => out.push({ ...a, id: `${a.id}-${l.lease_id}`, context })
    const days = daysTo(l.expiry)
    const renewal = renewals.find((r) => r.lease_id === l.lease_id)
    const open = renewal && (renewal.stage === 'Initiated' || renewal.stage === 'Negotiating')

    // Expiry & renewal
    if (days < 0) {
      add({ id: 'lapsed', kind: 'Expiry', severity: 'Critical', title: 'Lease has lapsed but is still marked active', detail: `Expired ${when(days).replace(' overdue', ' ago')}. Record the renewal or mark the lease expired.`, due: l.expiry, cta: 'Update lease', link: `leases/${l.lease_id}` })
    } else if (days <= 180 && !renewal) {
      add({ id: 'start', kind: 'Renewal', severity: days <= 90 ? 'Critical' : 'Warning', title: 'Start renewal process', detail: `Lease expires ${when(days)} and no renewal has been started.`, due: l.expiry, cta: 'Start renewal', link: `leases/${l.lease_id}/renewal` })
    } else if (days <= 180 && open && renewal.target_date && renewal.target_date < today) {
      add({ id: 'target', kind: 'Renewal', severity: 'Critical', title: 'Renewal target date missed', detail: `Renewal is still ${renewal.stage.toLowerCase()}; target was ${daysTo(renewal.target_date) * -1} days ago and the lease expires ${when(days)}.`, due: renewal.target_date, cta: 'Open renewal', link: `leases/${l.lease_id}/renewal` })
    } else if (days <= 90 && open) {
      add({ id: 'close', kind: 'Renewal', severity: 'Warning', title: 'Close renewal negotiation', detail: `Renewal is ${renewal.stage.toLowerCase()} with the lease expiring ${when(days)}.`, due: l.expiry, cta: 'Open renewal', link: `leases/${l.lease_id}/renewal` })
    } else if (days <= 180 && renewal?.stage === 'Lost') {
      add({ id: 'backfill', kind: 'Expiry', severity: 'Warning', title: 'Plan backfill — occupier is leaving', detail: `Renewal lost; ${fmtSft(l.area)} sq ft comes back ${when(days)}. Start marketing the space.`, due: l.expiry, cta: 'Open lease', link: `leases/${l.lease_id}` })
    } else if (days <= 365 && !renewal) {
      add({ id: 'window', kind: 'Expiry', severity: 'Info', title: 'Lease expiring within 12 months', detail: `Expires ${when(days)}. Engage the occupier on renewal intent.`, due: l.expiry, cta: 'Open lease', link: `leases/${l.lease_id}` })
    }

    // Break option
    if (l.break_date && l.break_date >= today && daysTo(l.break_date) <= 180) {
      const n = daysTo(l.break_date)
      add({ id: 'break', kind: 'Break', severity: n <= 60 ? 'Critical' : 'Warning', title: 'Break option coming up', detail: `Occupier can exit ${when(n)}. Confirm their intent to stay.`, due: l.break_date, cta: 'Open lease', link: `leases/${l.lease_id}` })
    }

    // Rent escalation (only when commercials are visible)
    if (l.escalation_pct != null) {
      const esc = nextEscalation(l, today)
      if (esc && daysTo(esc) <= 60) add({ id: 'esc', kind: 'Escalation', severity: 'Info', title: `Rent escalation of ${l.escalation_pct}% due`, detail: `Due ${when(daysTo(esc))}. Send the escalation notice and update invoicing.`, due: esc, cta: 'Open lease', link: `leases/${l.lease_id}` })
    }

    // Security deposit (owner-only field; undefined when hidden)
    if (l.deposit_received === false) {
      add({ id: 'deposit', kind: 'Deposit', severity: 'Warning', title: 'Security deposit not received', detail: `Lease started ${when(daysTo(l.start)).replace(' overdue', ' ago')}; deposit still pending.`, due: l.start, cta: 'Open lease', link: `leases/${l.lease_id}` })
    }

    // Overdue rent, rolled up per lease
    // Outstanding beyond ₹1 (GST totals are rounded) and more than 30 days past due, so normal payment lag isn't flagged.
    const outstanding = (i: RentInvoice) => Math.round(i.amount * (1 + i.gst / 100)) - i.paid_amount
    const overdue = invoices.filter((i) => i.lease_id === l.lease_id && daysTo(i.due_date) < -30 && outstanding(i) > 1)
    if (overdue.length) {
      const amount = overdue.reduce((s, i) => s + outstanding(i), 0)
      const oldest = overdue.map((i) => i.due_date).sort()[0]
      add({ id: 'rent', kind: 'Rent', severity: daysTo(oldest) < -60 ? 'Critical' : 'Warning', title: `${inr(amount)} rent overdue`, detail: `${overdue.length} unpaid ${overdue.length === 1 ? 'invoice' : 'invoices'}, oldest ${-daysTo(oldest)} days past due.`, due: oldest, cta: 'View invoices', link: `leases/${l.lease_id}/invoices` })
    }
  }
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity] || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.due.localeCompare(b.due))
}
