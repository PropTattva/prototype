import type { Session } from '../access/session'
import { hasFeature, listParks } from '../data/api'
import { getParkOwners, isOperational } from '../data/legacy'
import { useApi } from '../data/useApi'
import type { Park } from '../domain/legacy'
import { fmtPct, fmtRent, fmtSft } from '../lib/format'
import { useAuthed } from '../state/SessionContext'
import BarList, { type BarRow } from '../components/ui/BarList'
import Card from '../components/ui/Card'
import KpiCard from '../components/ui/KpiCard'
import PageHeader from '../components/ui/PageHeader'
import { StatusBadge } from '../components/ui/Badge'
import UpgradeGate from '../components/ui/UpgradeGate'

const sum = (ps: Park[], f: (p: Park) => number | null) => ps.reduce((a, p) => a + (f(p) ?? 0), 0)

const OWNERS = getParkOwners()
const ownerName = (id: string) => OWNERS.find((o) => o.orgId === id)?.name ?? id

function stageOf(p: Park) {
  if (/^operational$/i.test(p.status)) return 'Operational'
  if (/operational/i.test(p.status)) return 'Operational + U.C.'
  if (/u\.c/i.test(p.status)) return 'Under construction'
  return 'Upcoming'
}

export default function Dashboard() {
  const session = useAuthed()
  if (!hasFeature(session, 'portfolio_dashboard')) return <UpgradeGate session={session} feature="portfolio_dashboard" />
  return <PortfolioDashboard session={session} />
}

function PortfolioDashboard({ session }: { session: Session }) {
  const { data: parks } = useApi(() => listParks(session), [session.user.user_id])
  if (!parks) return null
  const all = session.role === 'Super Admin' || session.role === 'AA'

  const cities = [...new Set(parks.map((p) => p.city))].sort()
  const totalMsft = sum(parks, (p) => p.msft)
  const occupied = sum(parks, (p) => p.occupiedSft)
  const available = sum(parks, (p) => p.availableSft)
  const total = occupied + available
  const occPct = total ? (occupied / total) * 100 : 0
  const cityWord = cities.length === 1 ? 'city' : 'cities'

  const byCity: BarRow[] = cities.map((c) => {
    const v = sum(parks.filter((p) => p.city === c), (p) => p.msft)
    return { key: c, label: c, value: v, display: `${v.toFixed(1)} msft` }
  })
  const byGroup: BarRow[] = all
    ? OWNERS.map(({ orgId: id, name }) => {
        const ps = parks.filter((p) => p.ownerId === id)
        const v = sum(ps, (p) => p.msft)
        return { key: id, label: name, value: v, display: `${v.toFixed(1)} msft`, tooltip: `${name}: ${ps.length} parks` }
      })
    : ['Operational', 'Operational + U.C.', 'Under construction', 'Upcoming']
        .map((s) => {
          const ps = parks.filter((p) => stageOf(p) === s)
          const v = sum(ps, (p) => p.msft)
          return { key: s, label: s, value: v, display: `${v.toFixed(1)} msft`, tooltip: `${s}: ${ps.length} parks` }
        })
        .filter((r) => r.value > 0)
  const availByPark: BarRow[] = parks
    .filter((p) => p.availableSft > 0)
    .sort((a, b) => b.availableSft - a.availableSft)
    .map((p) => ({ key: p.parkId, label: p.name, value: p.availableSft, display: fmtSft(p.availableSft) }))
  const vacancy: BarRow[] = parks
    .filter((p) => p.vacancyPct != null)
    .sort((a, b) => b.vacancyPct! - a.vacancyPct!)
    .map((p) => ({ key: p.parkId, label: p.name, value: p.vacancyPct!, display: fmtPct(p.vacancyPct) }))

  return (
    <>
      <PageHeader
        title={all ? 'Portfolio — all owners' : `Welcome, ${session.org.name}`}
        subtitle={`${parks.length} parks · ${cities.length} ${cityWord} · ${totalMsft.toFixed(1)} msft potential · Phase ALPHA pilot`}
      />

      <div className="mb-[18px] grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Parks" value={parks.length} hint={`${parks.filter(isOperational).length} operational`} />
        <KpiCard label="Built potential" value={totalMsft.toFixed(1)} unit="msft" hint={`Across ${cities.length} ${cityWord}`} />
        <KpiCard label="Occupancy" value={occPct.toFixed(1)} unit="%" hint={`${fmtSft(occupied)} of ${fmtSft(total)} sft tracked`} />
        <KpiCard label="Available" value={fmtSft(available)} unit="sft" hint="Stacking vacancies + owner listings" />
      </div>

      <div className="mb-3.5 grid gap-3.5 lg:grid-cols-2">
        <Card title="Built potential by city"><BarList rows={byCity} /></Card>
        <Card title={all ? 'Potential by owner org' : 'Pipeline by stage'}><BarList rows={byGroup} /></Card>
        <Card title="Available space by park" sub="sq ft on the market"><BarList rows={availByPark} empty="No space currently on the market" /></Card>
        <Card title="Current vacancy"><BarList rows={vacancy} color="bg-gold" empty="No vacancy reported" /></Card>
      </div>

      <Card title="Parks" sub="Demo dataset — becomes the Campus / Building registry in Phase 2" flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                <th className="px-4 py-2.5">Park</th>
                {all && <th className="px-3 py-2.5">Owner</th>}
                <th className="px-3 py-2.5">City</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">msft</th>
                <th className="px-3 py-2.5 text-right">Vacancy</th>
                <th className="px-3 py-2.5 text-right">Available</th>
                <th className="px-4 py-2.5 text-right">Rent /sft/mo</th>
              </tr>
            </thead>
            <tbody>
              {parks.map((p) => (
                <tr key={p.parkId} className="border-b border-line-light last:border-0 hover:bg-hover">
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-ink">{p.name}</div>
                    <div className="text-[11px] text-ink-muted">{p.location}</div>
                  </td>
                  {all && <td className="px-3 py-2.5 text-ink-soft">{ownerName(p.ownerId)}</td>}
                  <td className="px-3 py-2.5 text-ink-soft">{p.city}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={p.status} /></td>
                  <td className="px-3 py-2.5 text-right">{p.msft?.toFixed(1) ?? '–'}</td>
                  <td className="px-3 py-2.5 text-right">{fmtPct(p.vacancyPct)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtSft(p.availableSft)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtRent(p.askingRent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
