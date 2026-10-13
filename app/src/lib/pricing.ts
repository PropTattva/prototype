// E5-S06: the 12-input pricing bridge. Turns a market benchmark into a recommended headline rent range and the
// effective rent after incentives, and checks it against the owner's threshold NOI.
import type { PricingInputs, PricingVersion } from '../domain/mandates'

export const PRICING_FIELDS: { key: keyof PricingInputs; label: string; unit: string; help: string }[] = [
  { key: 'market_rent', label: 'Market median rent', unit: '₹/sq ft/mo', help: 'From anonymised comparables in the micro-market' },
  { key: 'grade_adj_pct', label: 'Grade premium / discount', unit: '%', help: 'Relative to the market median grade' },
  { key: 'floor_plate_adj_pct', label: 'Floor-plate premium', unit: '%', help: 'Large contiguous plates command a premium' },
  { key: 'vacancy_adj_pct', label: 'Vacancy / absorption adjustment', unit: '%', help: 'Negative when the asset or market is soft' },
  { key: 'fitout_adj_pct', label: 'Fit-out condition', unit: '%', help: 'Furnished space prices above warm shell' },
  { key: 'rent_free_months', label: 'Rent-free period offered', unit: 'months', help: 'Reduces effective rent' },
  { key: 'ti_per_sqft', label: 'TI contribution', unit: '₹/sq ft', help: 'Amortised over the term' },
  { key: 'escalation_pct', label: 'Escalation', unit: '% / yr', help: 'Lifts average rent over the term' },
  { key: 'cam', label: 'CAM', unit: '₹/sq ft/mo', help: 'Total occupancy cost check' },
  { key: 'parking_per_slot', label: 'Parking rate', unit: '₹/slot/mo', help: 'Ancillary income' },
  { key: 'term_years', label: 'Lease term', unit: 'years', help: 'Spreads incentives' },
  { key: 'threshold_noi', label: 'Owner threshold NOI', unit: '₹/sq ft/mo', help: 'Floor below which no success fee is due' },
]

export function priceModel(i: PricingInputs): PricingVersion['output'] {
  const adj = 1 + (i.grade_adj_pct + i.floor_plate_adj_pct + i.vacancy_adj_pct + i.fitout_adj_pct) / 100
  const mid = i.market_rent * adj
  const months = Math.max(1, i.term_years * 12)
  // Net effective (starting) rent: headline less rent-free and TI spread over the term.
  const effective = mid * (1 - i.rent_free_months / months) - i.ti_per_sqft / months
  // Average over the term once annual escalations are applied.
  const termAverage = effective * (1 + ((i.escalation_pct / 100) * Math.max(0, i.term_years - 1)) / 2)
  const round = (n: number) => Math.round(n * 2) / 2
  return { low: round(mid * 0.95), high: round(mid * 1.05), effective: round(effective), term_average: round(termAverage), above_threshold: effective >= i.threshold_noi }
}
