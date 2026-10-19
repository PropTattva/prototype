import type { Session } from '../access/session'
import * as api from '../data/api'
import { useApi } from '../data/useApi'
import { addMonths, daysBetween, todayIso } from '../lib/dates'
import { fmtSft } from '../lib/format'
import { useAuthed } from '../state/SessionContext'
import Card from '../components/ui/Card'
import KpiCard from '../components/ui/KpiCard'
import PieChart, { OTHER_COLOR, SERIES_COLORS, type PieSlice } from '../components/ui/PieChart'
import PageHeader from '../components/ui/PageHeader'
import NewsFeed from '../components/NewsFeed'
import UpgradeGate from '../components/ui/UpgradeGate'

export default function Dashboard() {
  const session = useAuthed()
  if (!api.hasFeature(session, 'portfolio_dashboard')) return <UpgradeGate session={session} feature="portfolio_dashboard" />
  return <Portfolio session={session} />
}

/** E7-S01 (first cut): occupancy, rent roll, WALE and expiries across every visible asset. Full version in Phase 4. */
function Portfolio({ session }: { session: Session }) {
  const { data: ctx } = useApi(() => api.getOptionCtx(session), [session.user.user_id])
  if (!ctx) return null
  const internal = session.role === 'Super Admin' || session.role === 'AA'
  const { campuses, buildings, floors, leases } = ctx
  const leasable = floors.filter((f) => f.floor_use !== 'Parking')
  const area = leasable.reduce((s, f) => s + (f.chargeable_area ?? 0), 0)
  const vacant = leasable.filter((f) => f.occupancy_type === 'Vacant').reduce((s, f) => s + (f.chargeable_area ?? 0), 0)
  const active = leases.filter((l) => l.status === 'Active')
  const rentVisible = active.some((l) => l.rent != null)
  const rentRoll = active.reduce((s, l) => s + (l.rent ?? 0) * l.area * 12, 0)
  const today = todayIso()
  const leasedArea = active.reduce((s, l) => s + l.area, 0)
  const wale = leasedArea ? active.reduce((s, l) => s + l.area * Math.max(0, daysBetween(today, l.expiry) / 365), 0) / leasedArea : 0
  const in12 = addMonths(today, 12)
  const expiring = active.filter((l) => l.expiry <= in12)
  const cities = [...new Set(campuses.map((c) => c.city))].sort()
  const potential = campuses.reduce((s, c) => s + (c.total_area ?? 0), 0)

  const areaOf = (cs: typeof campuses) => cs.reduce((s, c) => s + (c.total_area ?? 0), 0)
  const cityColor = (c: string) => SERIES_COLORS[cities.indexOf(c) % SERIES_COLORS.length]
  const cityStats = cities.map((city) => {
    const cs = campuses.filter((c) => c.city === city)
    const bIds = new Set(buildings.filter((b) => cs.some((c) => c.campus_id === b.campus_id)).map((b) => b.building_id))
    const fl = leasable.filter((f) => bIds.has(f.building_id))
    const a = fl.reduce((s, f) => s + (f.chargeable_area ?? 0), 0)
    const v = fl.filter((f) => f.occupancy_type === 'Vacant').reduce((s, f) => s + (f.chargeable_area ?? 0), 0)
    const rent = active.filter((l) => bIds.has(l.building_id)).reduce((s, l) => s + (l.rent ?? 0) * l.area * 12, 0)
    return { city, campuses: cs.length, buildings: bIds.size, potential: areaOf(cs), leasable: a, vacant: v, rent }
  })
  const cityPie: PieSlice[] = cityStats
    .filter((c) => c.potential > 0)
    .map((c) => ({ key: c.city, label: c.city, value: c.potential, display: `${(c.potential / 1e6).toFixed(1)} msft`, color: cityColor(c.city) }))
  // Largest campuses get their own slice; the tail folds into "Other" so no hue is ever generated.
  const ranked = campuses.filter((c) => (c.total_area ?? 0) > 0).sort((a, b) => (b.total_area ?? 0) - (a.total_area ?? 0))
  const top = ranked.length > SERIES_COLORS.length ? ranked.slice(0, SERIES_COLORS.length - 1) : ranked
  const rest = ranked.slice(top.length)
  const campusPie: PieSlice[] = [
    ...top.map((c, i) => ({ key: c.campus_id, label: c.name, value: c.total_area ?? 0, display: `${((c.total_area ?? 0) / 1e6).toFixed(1)} msft`, color: SERIES_COLORS[i] })),
    ...(rest.length ? [{ key: 'other', label: `Other (${rest.length} campuses)`, value: areaOf(rest), display: `${(areaOf(rest) / 1e6).toFixed(1)} msft`, color: OTHER_COLOR }] : []),
  ]
  const firstName = session.user.name.split(' ')[0]

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName}`}
        subtitle={internal ? (session.role === 'AA' ? 'Mandated assets' : 'All owners') : session.org.name}
      />
      <div className="mb-[18px] grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Leasable area" value={fmtSft(area)} unit="sq ft" hint={`${leasable.length} floors in ${new Set(leasable.map((f) => f.building_id)).size} buildings`} />
        <KpiCard label="Occupancy" value={area ? (((area - vacant) / area) * 100).toFixed(1) : '—'} unit="%" hint={`${fmtSft(vacant)} sq ft vacant`} />
        <KpiCard label={rentVisible ? 'Annual rent roll' : 'Active leases'} value={rentVisible ? `₹${(rentRoll / 1e7).toFixed(1)}` : active.length} unit={rentVisible ? 'Cr' : ''} hint={`${active.length} active leases`} />
        <KpiCard label="WALE" value={wale.toFixed(1)} unit="yrs" hint={`${expiring.length} leases expire within 12 months`} />
      </div>

      <Card title="City-wise portfolio" sub="Built potential, leasable area, occupancy and rent roll per city" className="mb-3.5">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {cityStats.map((c) => (
            <div key={c.city} className="rounded-lg border border-line p-3.5">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cityColor(c.city) }} />
                <span className="text-sm font-extrabold text-royal">{c.city}</span>
                <span className="ml-auto text-[11px] text-ink-muted">{c.campuses} {c.campuses === 1 ? 'campus' : 'campuses'} · {c.buildings} bldgs</span>
              </div>
              <dl className={`grid ${rentVisible ? 'grid-cols-2' : 'grid-cols-3'} gap-2 text-[10px] uppercase tracking-wider text-ink-muted`}>
                <div><dt>Potential</dt><dd className="mt-0.5 text-base font-extrabold normal-case tracking-normal text-ink">{(c.potential / 1e6).toFixed(1)}<span className="ml-0.5 text-[10px] font-medium text-ink-muted">msft</span></dd></div>
                <div><dt>Leasable</dt><dd className="mt-0.5 text-base font-extrabold normal-case tracking-normal text-ink">{c.leasable ? <>{fmtSft(c.leasable)}<span className="ml-0.5 text-[10px] font-medium text-ink-muted">sft</span></> : '—'}</dd></div>
                <div><dt>Occupancy</dt><dd className="mt-0.5 text-base font-extrabold normal-case tracking-normal text-ink">{c.leasable ? `${(((c.leasable - c.vacant) / c.leasable) * 100).toFixed(1)}%` : '—'}</dd></div>
                {rentVisible && <div><dt>Annual rent roll</dt><dd className="mt-0.5 text-base font-extrabold normal-case tracking-normal text-ink">{c.rent ? <>₹{(c.rent / 1e7).toFixed(1)}<span className="ml-0.5 text-[10px] font-medium text-ink-muted">Cr</span></> : '—'}</dd></div>}
              </dl>
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-3.5 grid gap-3.5 lg:grid-cols-2">
        <Card title="Area by city" sub="Share of built potential"><PieChart slices={cityPie} total={`${(potential / 1e6).toFixed(1)} msft`} /></Card>
        <Card title="Area by campus" sub="Share of built potential"><PieChart slices={campusPie} total={`${(potential / 1e6).toFixed(1)} msft`} /></Card>
      </div>

      <NewsFeed session={session} />
    </>
  )
}
