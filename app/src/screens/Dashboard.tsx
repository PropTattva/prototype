import { getOrg, getOwnerOrgs, getParks, isOperational } from '../data/api'
import { fmtPct, fmtRent, fmtSft } from '../lib/format'
import { useApp } from '../state/AppContext'
import type { Park } from '../types'
import BarList, { type BarRow } from '../components/ui/BarList'
import Card from '../components/ui/Card'
import KpiCard from '../components/ui/KpiCard'
import Masked from '../components/ui/Masked'
import PageHeader from '../components/ui/PageHeader'
import StatusPill from '../components/ui/StatusPill'

const sum = (ps: Park[], f: (p: Park) => number | null) => ps.reduce((a, p) => a + (f(p) ?? 0), 0)

function stageOf(p: Park) {
  if (/^operational$/i.test(p.status)) return 'Operational'
  if (/operational/i.test(p.status)) return 'Operational + U.C.'
  if (/u\.c/i.test(p.status)) return 'Under construction'
  return 'Upcoming'
}

export default function Dashboard() {
  const { scope, navigate } = useApp()
  const parks = getParks(scope)
  const openPark = (id: string) => () => navigate('parks', id)

  const cities = [...new Set(parks.map((p) => p.city))].sort()
  const totalMsft = sum(parks, (p) => p.msft)
  const occupied = sum(parks, (p) => p.occupiedSft)
  const available = sum(parks, (p) => p.availableSft)
  const operational = parks.filter(isOperational).length

  const subtitle =
    scope.role === 'admin'
      ? `All owner organisations · ${parks.length} parks across ${cities.length} cities`
      : `${getOrg(scope.ownerId)?.name} · your parks only`

  const byCity: BarRow[] = cities.map((c) => {
    const v = sum(parks.filter((p) => p.city === c), (p) => p.msft)
    return { key: c, label: c, value: v, display: `${v.toFixed(1)} msft` }
  })

  const stages = ['Operational', 'Operational + U.C.', 'Under construction', 'Upcoming']
  const byStage: BarRow[] = stages
    .map((s) => {
      const ps = parks.filter((p) => stageOf(p) === s)
      const v = sum(ps, (p) => p.msft)
      return { key: s, label: s, value: v, display: `${v.toFixed(1)} msft`, tooltip: `${s}: ${ps.length} park${ps.length === 1 ? '' : 's'}, ${v.toFixed(1)} msft` }
    })
    .filter((r) => r.value > 0)

  const byOwner: BarRow[] = getOwnerOrgs().map((o) => {
    const ps = parks.filter((p) => p.ownerId === o.orgId)
    const v = sum(ps, (p) => p.msft)
    return { key: o.orgId, label: o.name, value: v, display: `${v.toFixed(1)} msft`, tooltip: `${o.name}: ${ps.length} parks, ${v.toFixed(1)} msft` }
  })

  const availByPark: BarRow[] = parks
    .filter((p) => p.availableSft > 0)
    .sort((a, b) => b.availableSft - a.availableSft)
    .map((p) => ({ key: p.parkId, label: p.name, value: p.availableSft, display: fmtSft(p.availableSft), onClick: openPark(p.parkId) }))

  const vacancy: BarRow[] = parks
    .filter((p) => p.vacancyPct != null)
    .sort((a, b) => b.vacancyPct! - a.vacancyPct!)
    .map((p) => ({ key: p.parkId, label: p.name, value: p.vacancyPct!, display: fmtPct(p.vacancyPct), onClick: openPark(p.parkId) }))

  return (
    <>
      <PageHeader title="Portfolio dashboard" subtitle={subtitle} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard value={parks.length} label="Parks" />
        <KpiCard value={cities.length} label="Cities" />
        <KpiCard value={totalMsft.toFixed(1)} label="msft potential" />
        <KpiCard value={fmtSft(occupied)} label="Occupied sft" />
        <KpiCard value={fmtSft(available)} label="Available sft" />
        <KpiCard value={`${operational}/${parks.length}`} label="Operational" />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <OccupancyCard occupied={occupied} available={available} />
        <Card title="Built potential by city">
          <BarList rows={byCity} />
        </Card>
        {scope.role === 'admin' ? (
          <Card title="Potential by owner org">
            <BarList rows={byOwner} />
          </Card>
        ) : (
          <Card title="Pipeline by stage">
            <BarList rows={byStage} />
          </Card>
        )}
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card title="Available space by park">
          <BarList rows={availByPark} empty="No space currently on the market" />
        </Card>
        <Card title="Current vacancy">
          <BarList rows={vacancy} color="bg-amber-500" empty="No vacancy reported" />
        </Card>
      </div>

      <ParksTable parks={parks} showOwner={scope.role === 'admin'} onOpen={(id) => navigate('parks', id)} />
    </>
  )
}

function OccupancyCard({ occupied, available }: { occupied: number; available: number }) {
  const total = occupied + available
  const occPct = total ? (occupied / total) * 100 : 0
  return (
    <Card title="Leasable inventory">
      {total ? (
        <>
          <div className="text-3xl font-bold text-navy">{occPct.toFixed(0)}%</div>
          <div className="text-xs text-ink-muted">occupied of {fmtSft(total)} sft tracked</div>
          <div className="mt-4 flex h-4 gap-0.5 overflow-hidden rounded">
            <div className="bg-brand" style={{ width: `${occPct}%` }} title={`Occupied: ${fmtSft(occupied)} sft`} />
            <div className="flex-1 bg-amber-400" title={`Available: ${fmtSft(available)} sft`} />
          </div>
          <div className="mt-3 flex justify-between text-xs">
            <span className="flex items-center gap-1.5 text-ink-soft">
              <i className="h-2.5 w-2.5 rounded-sm bg-brand" /> Occupied <b className="text-ink">{fmtSft(occupied)}</b>
            </span>
            <span className="flex items-center gap-1.5 text-ink-soft">
              <i className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Available <b className="text-ink">{fmtSft(available)}</b>
            </span>
          </div>
          <p className="mt-3 text-[11px] text-ink-muted">From stacking plans + owner listings. Upcoming parks have no inventory yet.</p>
        </>
      ) : (
        <p className="py-6 text-center text-sm text-ink-muted">No operational inventory yet — all parks upcoming.</p>
      )}
    </Card>
  )
}

function ParksTable({ parks, showOwner, onOpen }: { parks: Park[]; showOwner: boolean; onOpen: (id: string) => void }) {
  return (
    <Card title="Parks" action={<span className="text-xs text-ink-muted">{parks.length} parks</span>}>
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-y border-line bg-slate-50 text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2 font-semibold sm:px-5">Park</th>
              {showOwner && <th className="px-3 py-2 font-semibold">Owner</th>}
              <th className="px-3 py-2 font-semibold">City</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 text-right font-semibold">msft</th>
              <th className="px-3 py-2 text-right font-semibold">Vacancy</th>
              <th className="px-3 py-2 text-right font-semibold">Available</th>
              <th className="px-4 py-2 text-right font-semibold sm:px-5">Rent /sft/mo</th>
            </tr>
          </thead>
          <tbody>
            {parks.map((p) => (
              <tr key={p.parkId} onClick={() => onOpen(p.parkId)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-brand-50/60">
                <td className="px-4 py-2.5 sm:px-5">
                  <div className="font-semibold text-brand">{p.name}</div>
                  <div className="text-xs text-ink-muted">{p.location}</div>
                </td>
                {showOwner && <td className="px-3 py-2.5 text-ink-soft">{getOrg(p.ownerId)?.name}</td>}
                <td className="px-3 py-2.5 text-ink-soft">{p.city}</td>
                <td className="px-3 py-2.5"><StatusPill status={p.status} /></td>
                <td className="px-3 py-2.5 text-right">{p.msft?.toFixed(1) ?? '–'}</td>
                <td className="px-3 py-2.5 text-right">{fmtPct(p.vacancyPct)}</td>
                <td className="px-3 py-2.5 text-right">{fmtSft(p.availableSft)}</td>
                <td className="px-4 py-2.5 text-right sm:px-5">
                  {p.askingRent == null ? '–' : <Masked>{fmtRent(p.askingRent)}</Masked>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
