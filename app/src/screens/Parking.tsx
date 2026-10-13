import * as api from '../data/api'
import { useApi } from '../data/useApi'
import type { Bay } from '../domain/parking'
import { navigate } from '../state/router'
import { useAuthed } from '../state/SessionContext'
import ParkingPanel from '../components/ParkingPanel'
import PageHeader from '../components/ui/PageHeader'
import UpgradeGate from '../components/ui/UpgradeGate'

/** E6 across buildings: pick a building with bays to manage rates, bays and allocations. */
export default function Parking({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const { data } = useApi(async () => {
    const [bays, ctx] = await Promise.all([api.list('bay', session), api.getOptionCtx(session)])
    return { bays: bays as Bay[], ctx }
  }, [session.user.user_id])
  if (!api.hasFeature(session, 'parking')) return <UpgradeGate session={session} feature="parking" />
  if (!data) return null
  const withBays = data.ctx.buildings.filter((b) => data.bays.some((x) => x.building_id === b.building_id))
  const [buildingId = withBays[0]?.building_id, ...more] = rest
  return (
    <>
      <PageHeader
        title="Parking"
        subtitle={`${data.bays.length.toLocaleString('en-IN')} bays across ${withBays.length} buildings · rates, bay map and allocations`}
        right={
          <select className="input w-auto min-w-[220px]" value={buildingId ?? ''} onChange={(e) => navigate(`parking/${e.target.value}`)} aria-label="Building">
            {withBays.map((b) => {
              const n = data.bays.filter((x) => x.building_id === b.building_id)
              return <option key={b.building_id} value={b.building_id}>{b.name} — {n.filter((x) => x.status === 'Allocated').length}/{n.length} allocated</option>
            })}
          </select>
        }
      />
      {buildingId ? <ParkingPanel key={buildingId} session={session} buildingId={buildingId} base={`parking/${buildingId}`} rest={more} /> : <p className="text-sm text-ink-muted">No buildings with parking bays.</p>}
    </>
  )
}
