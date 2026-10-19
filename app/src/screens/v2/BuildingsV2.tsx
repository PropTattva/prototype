import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import { fmtSft } from '../../lib/format'
import { floorMix, occupancyPct } from '../../lib/occupancy'
import { navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import Drill, { MixLegend } from '../../components/drill/Drill'

/** V2 building registry: pick a city, then a building, which opens its detail page. */
export default function BuildingsV2({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const { data: ctx } = useApi(() => api.getOptionCtx(session), [session.user.user_id])
  if (!ctx) return null
  const canCreate = api.permissions('building', session).create
  return (
    <Drill
      module="buildings"
      title="Buildings"
      subtitle="Choose a city, then a building to see its floors, documents and ownership."
      rest={rest}
      ctx={ctx}
      stats={(ids) => {
        const m = floorMix(ctx, ids)
        return [
          { label: 'Leasable', value: m.leasable ? `${fmtSft(m.leasable)}` : '—' },
          { label: 'Occupancy', value: occupancyPct(m) },
          { label: 'Floors', value: m.floors },
        ]
      }}
      mix={(ids) => floorMix(ctx, ids)}
      right={
        <>
          <MixLegend />
          {canCreate && <button className="btn btn-gold" onClick={() => navigate('buildings/new')}>+ Register building</button>}
        </>
      }
      emptyText="No buildings are visible to you yet."
    />
  )
}
