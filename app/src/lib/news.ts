// Lease news feed: portfolio events derived from the viewer's scoped leases, plus sample market headlines.
import type { OptionCtx } from '../entities/types'
import type { Lease, Occupier } from '../domain/leasing'
import { addDays, addMonths, daysBetween } from './dates'
import { fmtSft } from './format'

export interface NewsItem {
  id: string
  date: string
  kind: 'Portfolio' | 'Market'
  headline: string
  summary: string
  categories: string[]
  tags: string[]
  /** hash route for portfolio items */
  link?: string
}

function describe(o: Occupier | undefined) {
  if (!o) return 'An occupier'
  const origin = o.parent_country && o.parent_country !== 'India' ? `${o.parent_country}-based ` : ''
  const kind = o.is_gcc ? 'GCC' : o.is_startup ? 'startup' : 'occupier'
  return `${origin}${o.sector_tag === 'Other' ? '' : `${o.sector_tag} `}${kind} ${o.name}`
}

export function portfolioNews(ctx: OptionCtx, today: string): NewsItem[] {
  const where = (l: Lease) => {
    const b = ctx.buildings.find((x) => x.building_id === l.building_id)
    const c = b && ctx.campuses.find((x) => x.campus_id === b.campus_id)
    return { campus: c?.name ?? '', city: c?.city ?? '', building: b?.name ?? '' }
  }
  const occ = (l: Lease) => ctx.occupiers.find((o) => o.occupier_id === l.occupier_id)
  // Skip dataset placeholders ("Basement", "Undisclosed", developer self-use) that aren't real occupiers.
  const active = ctx.leases.filter((l) => l.status === 'Active' && !/basement|undisclosed|self/i.test(occ(l)?.name ?? ''))

  const signed = active
    .filter((l) => l.start <= today && l.start >= addMonths(today, -12))
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 4)
    .map((l): NewsItem => {
      const w = where(l)
      const o = occ(l)
      const years = Math.round(daysBetween(l.start, l.expiry) / 365)
      return {
        id: `sign-${l.lease_id}`,
        date: l.start,
        kind: 'Portfolio',
        headline: `${describe(o)} signs ${fmtSft(l.area)} sq ft at ${w.campus}, ${w.city}`,
        summary: `${years}-year lease in ${w.building}${l.rent != null ? ` at ₹${l.rent}/sq ft/month` : ''}${l.escalation_pct ? `, ${l.escalation_pct}% ${l.escalation_freq?.toLowerCase() ?? ''} escalation` : ''}.`,
        categories: ['Deals', 'Lease', w.city],
        tags: [w.campus, o?.sector_tag ?? 'Occupier', 'New lease'],
        link: `leases/${l.lease_id}`,
      }
    })

  const expiring = active
    .filter((l) => l.expiry > today && l.expiry <= addMonths(today, 6))
    .sort((a, b) => a.expiry.localeCompare(b.expiry))
    .slice(0, 3)
    .map((l): NewsItem => {
      const w = where(l)
      const o = occ(l)
      return {
        id: `exp-${l.lease_id}`,
        date: today,
        kind: 'Portfolio',
        headline: `${fmtSft(l.area)} sq ft at ${w.campus} up for renewal as ${o?.name ?? 'occupier'}'s lease nears expiry`,
        summary: `Lease in ${w.building} expires in ${daysBetween(today, l.expiry)} days. Start renewal talks or line up backfill.`,
        categories: ['Renewals', 'Lease', w.city],
        tags: [w.campus, 'Expiry', o?.sector_tag ?? 'Occupier'],
        link: `leases/${l.lease_id}`,
      }
    })

  return [...signed, ...expiring]
}

/** Sample market headlines — illustrative only, not real reporting. */
export function marketNews(today: string): NewsItem[] {
  const m = (n: number, headline: string, summary: string, categories: string[], tags: string[]): NewsItem => ({
    id: `mkt-${n}`, date: addDays(today, -n * 3 - 1), kind: 'Market', headline, summary, categories, tags,
  })
  return [
    m(1, 'Bengaluru office leasing stays strong as GCCs expand on the Outer Ring Road', 'Global capability centres drove a large share of this quarter\'s absorption, with demand concentrated in Grade-A tech parks.', ['City', 'Market', 'Bengaluru'], ['GCC', 'ORR', 'Office leasing']),
    m(2, 'Global bank pre-leases a large campus on Gurugram\'s Golf Course Extension Road', 'The build-to-suit deal is among the larger pre-commitments in NCR this year, underlining demand for new-age campuses.', ['City', 'Deals', 'Gurugram'], ['BFSI', 'Pre-lease', 'BTS']),
    m(3, 'Mumbai BKC Grade-A rents hold firm amid tight supply', 'Vacancy in the CBD remains low; landlords are trimming rent-free periods on renewals.', ['City', 'Market', 'Mumbai'], ['BKC', 'Rents', 'Renewals']),
    m(4, 'Exclusivity clauses gain ground in premium office leases', 'Occupiers are seeking rights of first refusal on adjacent floors and limits on competing tenants within the same building.', ['Lease', 'Market'], ['Exclusivity clause', 'ROFR', 'Commercial lease']),
    m(5, 'Flex operators take a growing share of absorption across top cities', 'Managed-office players continue to lease whole floors, often on longer lock-ins than traditional occupiers.', ['Deals', 'Market'], ['Flex/Co-working', 'Managed office']),
  ]
}
