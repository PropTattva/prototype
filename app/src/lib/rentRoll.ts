// Rent-roll maths: what a lease needs to be "captured", and the money it produces.
import type { Lease } from '../domain/leasing'
import { nextEscalation } from './actions'
import { daysBetween } from './dates'

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
