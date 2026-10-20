// Rent-roll maths: what a lease needs to be "captured", and the money it produces.
import type { Lease } from '../domain/leasing'
import { nextEscalation } from './actions'
import { addMonths, daysBetween } from './dates'

/** Commercial fields a lease needs before it counts in the rent roll. */
export const CAPTURE_FIELDS: { key: keyof Lease; label: string }[] = [
  { key: 'rent', label: 'Rent' },
  { key: 'CAM', label: 'CAM' },
  { key: 'escalation_pct', label: 'Escalation %' },
  { key: 'escalation_freq', label: 'Escalation frequency' },
  { key: 'start', label: 'Start' },
  { key: 'expiry', label: 'Expiry' },
  { key: 'deposit_months', label: 'Deposit months' },
]

export const missingFields = (l: Lease) => CAPTURE_FIELDS.filter((f) => l[f.key] == null || l[f.key] === '').map((f) => f.label)

export interface RollRow {
  lease: Lease
  missing: string[]
  /** INR per month, rent + CAM */
  monthly: number
  /** INR per year, base rent only */
  annualRent: number
  yearsLeft: number
  nextEscalation: string | null
  /** rent after the next escalation, INR / sq ft / month */
  escalatedRent: number | null
}

export function rollRow(l: Lease, today: string): RollRow {
  const rent = l.rent ?? 0
  const esc = l.escalation_pct != null ? nextEscalation(l, today) : null
  return {
    lease: l,
    missing: missingFields(l),
    monthly: (rent + (l.CAM ?? 0)) * l.area,
    annualRent: rent * l.area * 12,
    yearsLeft: Math.max(0, daysBetween(today, l.expiry) / 365),
    nextEscalation: esc,
    escalatedRent: esc && l.rent != null ? Math.round(l.rent * (1 + (l.escalation_pct ?? 0) / 100) * 100) / 100 : null,
  }
}

export function rollTotals(rows: RollRow[]) {
  const captured = rows.filter((r) => !r.missing.length)
  const area = captured.reduce((s, r) => s + r.lease.area, 0)
  const annual = captured.reduce((s, r) => s + r.annualRent, 0)
  return {
    leases: rows.length,
    captured: captured.length,
    area: rows.reduce((s, r) => s + r.lease.area, 0),
    monthly: captured.reduce((s, r) => s + r.monthly, 0),
    annual,
    /** area-weighted ₹ / sq ft / month across captured leases */
    avgRent: area ? annual / 12 / area : 0,
    /** area-weighted years to expiry */
    wale: area ? captured.reduce((s, r) => s + r.lease.area * r.yearsLeft, 0) / area : 0,
  }
}

export const cr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(1)} L`)

export interface RentStep {
  from: string
  to: string
  /** INR / sq ft / month */
  rent: number
  monthly: number
  annual: number
  status: 'Past' | 'Current' | 'Upcoming'
}

const YEARS_PER_STEP: Record<string, number> = { Annual: 1, Biennial: 2, 'Every 3 years': 3 }

/** Rent across the term. The lease's rent is today's rent; earlier and later steps are derived from the escalation. */
export function rentSchedule(l: Lease, today: string): RentStep[] {
  if (l.rent == null) return []
  const step = (l.escalation_freq && YEARS_PER_STEP[l.escalation_freq]) || null
  const pct = (l.escalation_pct ?? 0) / 100
  const bounds: string[] = [l.start]
  if (step && pct) for (let d = addMonths(l.start, step * 12); d < l.expiry; d = addMonths(d, step * 12)) bounds.push(d)
  const current = Math.max(0, bounds.filter((b) => b <= today).length - 1)
  return bounds.map((from, i) => {
    const rent = Math.round(l.rent! * Math.pow(1 + pct, i - current) * 100) / 100
    const to = bounds[i + 1] ?? l.expiry
    return { from, to, rent, monthly: (rent + (l.CAM ?? 0)) * l.area, annual: rent * l.area * 12, status: to <= today ? 'Past' : from > today ? 'Upcoming' : 'Current' }
  })
}

/** Base rent still to be billed between today and expiry. */
export function rentToExpiry(steps: RentStep[], area: number, today: string) {
  return steps.reduce((s, st) => {
    const from = st.from > today ? st.from : today
    const months = Math.max(0, daysBetween(from, st.to) / 30.44)
    return s + st.rent * area * months
  }, 0)
}
