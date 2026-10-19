import type { Session } from '../../access/session'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { Building } from '../../domain/assets'
import { addMonths, todayIso } from '../../lib/dates'
import { floorMix, occupancyPct } from '../../lib/occupancy'
import { href, navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import Drill, { MixLegend } from '../../components/drill/Drill'
import StackingPlan from '../../components/StackingPlan'

/** V2 stacking plan: city → building → that building's floor-by-floor plan. */
export default function StackingV2({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const { data: ctx } = useApi(() => api.getOptionCtx(session), [session.user.user_id])
  if (!ctx) return null
  const masked = !api.permissions('lease', session).read
  const in12 = addMonths(todayIso(), 12)
  const withFloors = new Set(ctx.floors.map((f) => f.building_id))
  return (
    <Drill
      module="stacking"
      title="Stacking plan"
      subtitle={masked ? 'Occupancy at a glance. Tenant names are masked for your role (§7.1).' : 'Choose a city and a building to see its floor-by-floor occupancy and expiries.'}
      rest={rest}
      ctx={ctx}
      include={(b) => withFloors.has(b.building_id)}
      stats={(ids) => {
        const m = floorMix(ctx, ids)
        const expiring = ctx.leases.filter((l) => ids.includes(l.building_id) && l.status === 'Active' && l.expiry <= in12).length
        return [
          { label: 'Floors', value: m.floors },
          { label: 'Occupancy', value: occupancyPct(m) },
          { label: 'Expiring 12 mo', value: expiring, alert: expiring > 0 },
        ]
      }}
      mix={(ids) => floorMix(ctx, ids)}
      right={<MixLegend />}
      renderBuilding={(b) => <BuildingPlan building={b} session={session} masked={masked} />}
      emptyText="No buildings with floor data are visible to you."
    />
  )
}

function BuildingPlan({ building, session, masked }: { building: Building; session: Session; masked: boolean }) {
  const { data: plans } = useApi(() => api.stackingPlan([building.building_id], session), [building.building_id, session.user.user_id])
  if (!plans) return null
  return (
    <>
      <StackingPlan
        plans={plans}
        onCell={(cell, b) => {
          if (cell.lease_id && !masked) navigate(`leases/${cell.lease_id}`)
          else navigate(`buildings/${b.building_id}/stacking`)
        }}
      />
      <a href={href(`buildings/${building.building_id}`)} className="mt-3 inline-block text-xs font-semibold text-royal hover:underline">Open building →</a>
    </>
  )
}
