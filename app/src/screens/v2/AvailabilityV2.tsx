import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { Building } from '../../domain/assets'
import { fmtDate } from '../../lib/dates'
import { fmtSft } from '../../lib/format'
import { href } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import Drill from '../../components/drill/Drill'
import Badge from '../../components/ui/Badge'

/** V2 availability: city → building → the spaces on the market in that building. */
export default function AvailabilityV2({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const { data: ctx } = useApi(() => api.getOptionCtx(session), [session.user.user_id])
  const { data: rows } = useApi(() => api.availability(session), [session.user.user_id])
  if (!ctx || !rows) return null
  const inBuildings = (ids: string[]) => rows.filter((r) => ids.includes(r.building_id))
  const listed = new Set(rows.map((r) => r.building_id))

  const spaces = (b: Building) => {
    const list = inBuildings([b.building_id]).sort((x, y) => (y.vacancy_days ?? -1) - (x.vacancy_days ?? -1))
    const total = list.reduce((s, r) => s + r.area, 0)
    return (
      <>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-ink-soft">
            <strong className="text-ink">{list.length} {list.length === 1 ? 'space' : 'spaces'}</strong> · {fmtSft(total)} sq ft available
          </p>
          <a href={href(`buildings/${b.building_id}`)} className="text-xs font-semibold text-royal hover:underline">Open building →</a>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => {
            const aged = (r.vacancy_days ?? 0) > 180
            return (
              <div key={r.key} className={`rounded-lg border bg-white p-3.5 ${aged ? 'border-crit/40' : 'border-line'}`}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="font-extrabold text-royal">{r.space}</div>
                  {r.kind !== 'Floor' && <Badge tone={r.kind === 'Whole building' ? 'gold' : 'royal'}>{r.kind}</Badge>}
                </div>
                <div className="mb-2 text-xl font-extrabold text-ink">
                  {r.area.toLocaleString('en-IN')}
                  <span className="ml-1 text-[11px] font-medium text-ink-muted">sq ft</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                  <dt className="text-ink-muted">Handover</dt>
                  <dd className="text-right text-ink-soft">{r.handover}</dd>
                  <dt className="text-ink-muted">Available</dt>
                  <dd className="text-right text-ink-soft">{r.available_from ? fmtDate(r.available_from) : '—'}</dd>
                  <dt className="text-ink-muted">Vacant for</dt>
                  <dd className={`text-right ${aged ? 'font-bold text-crit' : 'text-ink-soft'}`}>{r.vacancy_days != null ? `${r.vacancy_days} days` : '—'}</dd>
                  <dt className="text-ink-muted">Asking rent</dt>
                  <dd className="text-right text-ink-soft">{r.asking_rent != null ? `₹${r.asking_rent}/sq ft` : '—'}</dd>
                </dl>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  return (
    <Drill
      module="availability"
      title="Availability"
      subtitle="Choose a city and a building to see the floors and spaces on the market."
      rest={rest}
      ctx={ctx}
      include={(b) => listed.has(b.building_id)}
      stats={(ids) => {
        const list = inBuildings(ids)
        const aged = list.filter((r) => (r.vacancy_days ?? 0) > 180).length
        return [
          { label: 'Available', value: fmtSft(list.reduce((s, r) => s + r.area, 0)) },
          { label: 'Spaces', value: list.length },
          { label: 'Aged > 180d', value: aged, alert: aged > 0 },
        ]
      }}
      renderBuilding={spaces}
      emptyText="No space is on the market in the buildings visible to you."
    />
  )
}
