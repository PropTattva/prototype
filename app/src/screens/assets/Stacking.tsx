import { useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import { navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import StackingPlan from '../../components/StackingPlan'
import PageHeader from '../../components/ui/PageHeader'
import { ViewToggle } from '../../components/drill/Drill'

/** E4-S03 across a whole campus or a single building. */
export default function Stacking() {
  const session = useAuthed()
  const { data: ctx } = useApi(() => api.getOptionCtx(session), [session.user.user_id])
  const withFloors = (ctx?.buildings ?? []).filter((b) => ctx!.floors.some((f) => f.building_id === b.building_id))
  const campuses = (ctx?.campuses ?? []).filter((c) => withFloors.some((b) => b.campus_id === c.campus_id))
  const [pick, setPick] = useState<string>('')
  const choice = pick || (campuses[0] ? `campus:${campuses[0].campus_id}` : withFloors[0] ? `building:${withFloors[0].building_id}` : '')
  const ids = choice.startsWith('campus:') ? withFloors.filter((b) => `campus:${b.campus_id}` === choice).map((b) => b.building_id) : choice ? [choice.slice(9)] : []
  const { data: plans } = useApi(() => api.stackingPlan(ids, session), [choice, ids.length, session.user.user_id])
  const masked = !api.permissions('lease', session).read
  if (!ctx) return null

  return (
    <>
      <PageHeader
        title="Stacking plan"
        subtitle={masked ? 'Occupancy at a glance. Tenant names are masked for your role (§7.1).' : 'Floor-by-floor occupancy, expiries and vacancy age. Click a floor to open its lease or building.'}
        right={
          <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto min-w-[240px]" value={choice} onChange={(e) => setPick(e.target.value)} aria-label="Campus or building">
            {campuses.length > 0 && (
              <optgroup label="Whole campus">
                {campuses.map((c) => <option key={c.campus_id} value={`campus:${c.campus_id}`}>{c.name} — all buildings</option>)}
              </optgroup>
            )}
            <optgroup label="Single building">
              {withFloors.map((b) => <option key={b.building_id} value={`building:${b.building_id}`}>{b.name}</option>)}
            </optgroup>
          </select>
          <ViewToggle module="stacking" v2={false} />
          </div>
        }
      />
      {!ids.length ? (
        <p className="rounded-lg border border-line bg-white px-4 py-10 text-center text-sm text-ink-muted">No buildings with floor data are visible to you.</p>
      ) : (
        plans && (
          <StackingPlan
            plans={plans}
            multi={choice.startsWith('campus:')}
            onCell={(cell, b) => {
              if (cell.lease_id && !masked) navigate(`leases/${cell.lease_id}`)
              else navigate(`buildings/${b.building_id}/stacking`)
            }}
          />
        )
      )}
    </>
  )
}
