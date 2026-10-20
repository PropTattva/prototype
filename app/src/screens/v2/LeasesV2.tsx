import { useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { Building } from '../../domain/assets'
import type { Lease } from '../../domain/leasing'
import type { Rec } from '../../entities/types'
import { fmtSft } from '../../lib/format'
import { href, navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import Drill from '../../components/drill/Drill'
import EntityTable from '../../components/crud/EntityTable'
import RentRollCard from '../../components/rentroll/RentRollCard'
import { leaseFilter, LeaseViewPills, type LeaseView } from '../leasing/LeaseViews'

/** V2 lease register: city → building → that building's leases. The view pills filter every level. */
export default function LeasesV2({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const [view, setView] = useState<LeaseView>('all')
  const { data: ctx } = useApi(() => api.getOptionCtx(session), [session.user.user_id])
  const { data: all } = useApi(() => api.list('lease', session), [session.user.user_id])
  if (!ctx || !all) return null
  const leases = all as Lease[]
  const shown = leases.filter(leaseFilter(view))
  const inBuildings = (ids: string[]) => shown.filter((l) => ids.includes(l.building_id))
  // Pill counts follow the level being viewed: a building, a city, or the whole portfolio.
  const cityOf = (id: string) => ctx.buildings.find((b) => b.building_id === id)?.city
  const scoped = rest[2] ? leases.filter((l) => l.building_id === rest[2]) : rest[0] === 'in' && rest[1] ? leases.filter((l) => cityOf(l.building_id) === rest[1]) : leases
  // Under a filter, only buildings with a matching lease stay on the board.
  const leased = new Set((view === 'all' ? leases : shown).map((l) => l.building_id))
  const rentVisible = leases.some((l) => l.rent != null)
  const canCreate = api.permissions('lease', session).create

  const register = (b: Building) => {
    const rows = inBuildings([b.building_id])
    return (
      <>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <a href={href(`buildings/${b.building_id}`)} className="text-xs font-semibold text-royal hover:underline">Open building →</a>
          {canCreate && <button className="btn btn-gold" onClick={() => navigate(`leases/new/${b.building_id}`)}>+ New lease in {b.name}</button>}
        </div>
        <EntityTable entity="lease" rows={rows as unknown as Rec[]} ctx={ctx} session={session} onOpen={(id) => navigate(`leases/${id}`)} hideFilters={['org_id', 'building_id']} emptyText="No leases in this view for this building." />
      </>
    )
  }

  return (
    <Drill
      module="leases"
      title="Leases"
      subtitle="Choose a city and a building to see its leases. The views below filter every level."
      rest={rest}
      ctx={ctx}
      include={(b) => leased.has(b.building_id)}
      toolbar={
        <>
          <RentRollCard leases={scoped} ctx={ctx} scope={rest[2] ? ctx.buildings.find((b) => b.building_id === rest[2])?.name ?? 'Building' : rest[0] === 'in' && rest[1] ? rest[1] : 'Portfolio'} />
          <LeaseViewPills leases={scoped} view={view} onChange={setView} />
        </>
      }
      stats={(ids) => {
        const ls = inBuildings(ids)
        const active = ls.filter((l) => l.status === 'Active')
        return [
          { label: 'Leases', value: ls.length },
          { label: 'Leased', value: fmtSft(active.reduce((s, l) => s + l.area, 0)) },
          rentVisible
            ? { label: 'Rent roll', value: `₹${(active.reduce((s, l) => s + (l.rent ?? 0) * l.area * 12, 0) / 1e7).toFixed(1)} Cr` }
            : { label: 'Active', value: active.length },
        ]
      }}
      renderBuilding={register}
      emptyText={view === 'all' ? 'No leases are visible to you yet.' : 'No leases match this view.'}
    />
  )
}
