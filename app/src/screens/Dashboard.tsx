import type { Session } from '../access/session'
import * as api from '../data/api'
import { useApi } from '../data/useApi'
import type { DevelopmentStatus } from '../domain/assets'
import type { OptionCtx } from '../entities/types'
import { addMonths, daysBetween, quarterOf, todayIso } from '../lib/dates'
import { fmtSft } from '../lib/format'
import { href } from '../state/router'
import { useAuthed } from '../state/SessionContext'
import BarList, { type BarRow } from '../components/ui/BarList'
import Card from '../components/ui/Card'
import KpiCard from '../components/ui/KpiCard'
import PageHeader from '../components/ui/PageHeader'
import { StatusBadge } from '../components/ui/Badge'
import UpgradeGate from '../components/ui/UpgradeGate'

const STAGES: DevelopmentStatus[] = ['Operational', 'Operational / U.C.', 'U.C. / BTS', 'Upcoming']

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

  const byCity: BarRow[] = cities.map((c) => {
    const v = campuses.filter((x) => x.city === c).reduce((s, x) => s + (x.total_area ?? 0), 0) / 1e6
    return { key: c, label: c, value: v, display: `${v.toFixed(1)} msft` }
  })
  const byGroup: BarRow[] = internal
    ? ctx.organisations
        .filter((o) => o.type === 'Owner')
        .map((o) => {
          const v = campuses.filter((c) => c.org_id === o.org_id).reduce((s, c) => s + (c.total_area ?? 0), 0) / 1e6
          return { key: o.org_id, label: o.name, value: v, display: `${v.toFixed(1)} msft` }
        })
        .filter((r) => r.value > 0)
    : STAGES.map((st) => {
        const cs = campuses.filter((c) => c.development_status === st)
        const v = cs.reduce((s, c) => s + (c.total_area ?? 0), 0) / 1e6
        return { key: st, label: st, value: v, display: `${v.toFixed(1)} msft`, tooltip: `${st}: ${cs.length} campuses` }
      }).filter((r) => r.value > 0)
  const vacancyByCampus: BarRow[] = campuses
    .map((c) => {
      const fl = leasable.filter((f) => buildings.some((b) => b.building_id === f.building_id && b.campus_id === c.campus_id))
      const a = fl.reduce((s, f) => s + (f.chargeable_area ?? 0), 0)
      const v = fl.filter((f) => f.occupancy_type === 'Vacant').reduce((s, f) => s + (f.chargeable_area ?? 0), 0)
      return { key: c.campus_id, label: c.name, value: a ? (v / a) * 100 : -1, display: a ? `${((v / a) * 100).toFixed(1)}%` : '' }
    })
    .filter((r) => r.value >= 0)
    .sort((a, b) => b.value - a.value)
  const quarters = Array.from({ length: 8 }, (_, i) => quarterOf(addMonths(today, i * 3)))
  const expiryProfile: BarRow[] = quarters.map((q) => {
    const ls = active.filter((l) => quarterOf(l.expiry) === q)
    const v = rentVisible ? ls.reduce((s, l) => s + (l.rent ?? 0) * l.area * 12, 0) / 1e7 : ls.reduce((s, l) => s + l.area, 0)
    return { key: q, label: q, value: v, display: rentVisible ? `₹${v.toFixed(1)} Cr` : fmtSft(v), tooltip: `${q}: ${ls.length} leases expiring` }
  })

  return (
    <>
      <PageHeader
        title={internal ? `Portfolio — ${session.role === 'AA' ? 'mandated assets' : 'all owners'}` : `Welcome, ${session.org.name}`}
        subtitle={`${campuses.length} campuses · ${buildings.length} buildings · ${cities.length} ${cities.length === 1 ? 'city' : 'cities'} · ${(potential / 1e6).toFixed(1)} msft potential`}
      />
      <div className="mb-[18px] grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Leasable area" value={fmtSft(area)} unit="sq ft" hint={`${leasable.length} floors in ${new Set(leasable.map((f) => f.building_id)).size} buildings`} />
        <KpiCard label="Occupancy" value={area ? (((area - vacant) / area) * 100).toFixed(1) : '—'} unit="%" hint={`${fmtSft(vacant)} sq ft vacant`} />
        <KpiCard label={rentVisible ? 'Annual rent roll' : 'Active leases'} value={rentVisible ? `₹${(rentRoll / 1e7).toFixed(1)}` : active.length} unit={rentVisible ? 'Cr' : ''} hint={`${active.length} active leases`} />
        <KpiCard label="WALE" value={wale.toFixed(1)} unit="yrs" hint={`${expiring.length} leases expire within 12 months`} />
      </div>

      <div className="mb-3.5 grid gap-3.5 lg:grid-cols-2">
        <Card title={rentVisible ? 'Lease expiry profile — annual rent' : 'Lease expiry profile — area'} sub="Next 8 quarters" action={<a href={href('renewals')} className="text-xs font-semibold text-royal hover:underline">Renewals →</a>}>
          <BarList rows={expiryProfile} color="bg-gold" />
        </Card>
        <Card title="Vacancy by campus"><BarList rows={vacancyByCampus} empty="No leasable floors yet" /></Card>
        <Card title="Built potential by city"><BarList rows={byCity} /></Card>
        <Card title={internal ? 'Potential by owner org' : 'Pipeline by stage'}><BarList rows={byGroup} /></Card>
      </div>

      <CampusTable ctx={ctx} showOwner={internal} />
    </>
  )
}

function CampusTable({ ctx, showOwner }: { ctx: OptionCtx; showOwner: boolean }) {
  const orgName = (id: string) => ctx.organisations.find((o) => o.org_id === id)?.name ?? id
  return (
    <Card title="Campuses" sub="Open a campus to see its buildings, or its stacking plan" flush>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              <th className="px-4 py-2.5">Campus</th>
              {showOwner && <th className="px-3 py-2.5">Owner</th>}
              <th className="px-3 py-2.5">City</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">msft</th>
              <th className="px-3 py-2.5 text-right">Buildings</th>
              <th className="px-4 py-2.5 text-right">Occupancy</th>
            </tr>
          </thead>
          <tbody>
            {ctx.campuses.map((c) => {
              const bs = ctx.buildings.filter((b) => b.campus_id === c.campus_id)
              const fl = ctx.floors.filter((f) => f.floor_use !== 'Parking' && bs.some((b) => b.building_id === f.building_id))
              const a = fl.reduce((s, f) => s + (f.chargeable_area ?? 0), 0)
              const v = fl.filter((f) => f.occupancy_type === 'Vacant').reduce((s, f) => s + (f.chargeable_area ?? 0), 0)
              return (
                <tr key={c.campus_id} className="border-b border-line-light last:border-0 hover:bg-hover">
                  <td className="px-4 py-2.5">
                    <a href={href(`campuses/${c.campus_id}`)} className="font-semibold text-royal hover:underline">{c.name}</a>
                    <div className="text-[11px] text-ink-muted">{c.location}</div>
                  </td>
                  {showOwner && <td className="px-3 py-2.5 text-ink-soft">{orgName(c.org_id)}</td>}
                  <td className="px-3 py-2.5 text-ink-soft">{c.city}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={c.development_status} /></td>
                  <td className="px-3 py-2.5 text-right">{c.total_area ? (c.total_area / 1e6).toFixed(1) : '–'}</td>
                  <td className="px-3 py-2.5 text-right">{bs.length}</td>
                  <td className="px-4 py-2.5 text-right">{a ? `${(((a - v) / a) * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
