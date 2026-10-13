import { useMemo, useState } from 'react'
import type { Session } from '../access/session'
import * as api from '../data/api'
import { useApi } from '../data/useApi'
import type { BuildingImage } from '../domain/assets'
import type { Bay } from '../domain/parking'
import { fmtDate } from '../lib/dates'
import { linkFor } from '../lib/links'
import { href } from '../state/router'
import EntityPage from './crud/EntityPage'
import { useErrorHandler } from './crud/RecordDrawer'
import Card from './ui/Card'
import KpiCard from './ui/KpiCard'
import { useToast } from './ui/Toast'

const STYLE: Record<Bay['status'], string> = {
  Available: 'bg-ok-bg text-ok border-ok/30 hover:ring-2 hover:ring-ok/40',
  Allocated: 'bg-royal-soft text-royal border-royal/20',
  Reserved: 'bg-hover text-ink-muted border-line',
}
const cr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(1)} L`)

/** E6: rates by slot type, the bay map by level, allocation to leases and projected parking revenue. */
export default function ParkingPanel({ session, buildingId, base, rest = [] }: { session: Session; buildingId: string; base: string; rest?: string[] }) {
  const toast = useToast()
  const { handle, dialog } = useErrorHandler(session)
  const { data } = useApi(() => api.parkingSummary(buildingId, session), [buildingId, session.user.user_id])
  const { data: plans } = useApi(
    () => (api.permissions('image', session).read ? api.list('image', session, { building_id: buildingId }) : Promise.resolve([])),
    [buildingId],
  )
  const [lease, setLease] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [focus, setFocus] = useState<Bay | null>(null)
  const levels = useMemo(() => {
    const m = new Map<string, Bay[]>()
    for (const b of data?.bays ?? []) {
      const k = b.bay_label.split('-')[0]
      m.set(k, [...(m.get(k) ?? []), b])
    }
    return [...m.entries()]
  }, [data])
  if (!data) return null
  if (!data.bays.length)
    return <p className="rounded-lg border border-line bg-white px-4 py-10 text-center text-sm text-ink-muted">No parking bays recorded for this building. Bays live on its parking (MLCP) floors.</p>
  const canEdit = api.permissions('bay', session).update
  const occ = new Map(data.leases.map((l) => [l.lease_id, l.occupier]))
  const sel = data.leases.find((l) => l.lease_id === lease)
  const plan = (plans as BuildingImage[] | undefined)?.find((i) => i.type === 'Parking plan')

  const allocate = async () => {
    try {
      await api.allocateBays(lease, [...picked], session)
      toast('ok', `${picked.size} bay${picked.size === 1 ? '' : 's'} allocated to ${sel?.occupier}.`)
      setPicked(new Set())
    } catch (e) {
      handle(e)
    }
  }

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Bays" value={data.bays.length} hint={`${data.inventory} leasable · ${data.counts.Reserved} visitor / reserved`} />
        <KpiCard label="Allocated" value={data.counts.Allocated} hint={`${data.inventory ? Math.round((data.counts.Allocated / data.inventory) * 100) : 0}% utilisation`} />
        <KpiCard label="Available" value={data.counts.Available} />
        <KpiCard label="Parking revenue" value={data.revenue ? cr(data.revenue.year1) : '—'} unit={data.revenue ? '/ yr' : ''} hint={data.revenue ? `${cr(data.revenue.threeYear)} over 3 years with escalation` : 'Owner + AA only'} />
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[1fr_1.6fr]">
        <Card title="Rates by slot type" sub="Effective-dated, with escalation (E6-S01/S02)">
          <table className="w-full text-[13px]">
            <tbody>
              {data.rates.filter((r) => r.current || r.next).map((r) => (
                <tr key={r.slot_type} className="border-b border-line-light last:border-0">
                  <td className="py-2 font-semibold">{r.slot_type}</td>
                  <td className="py-2 text-right">{r.current && 'rate' in r.current ? `₹${r.current.rate.toLocaleString('en-IN')}/mo` : '—'}</td>
                  <td className="py-2 pl-3 text-[11px] text-ink-muted">
                    {r.current ? `since ${fmtDate(r.current.effective_from)}${r.current.escalation_pct ? ` · +${r.current.escalation_pct}% ${r.current.escalation_freq?.toLowerCase()}` : ''}` : ''}
                    {r.next && <span className="block font-semibold text-warn">₹{'rate' in r.next ? r.next.rate.toLocaleString('en-IN') : '—'} from {fmtDate(r.next.effective_from)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <a href={href(`${base}/rates`)} className="mt-2 inline-block text-xs font-semibold text-royal hover:underline">Manage rates →</a>
        </Card>
        <Card title="Allocate bays to a lease" sub="No bay can be allocated twice; a lease cannot exceed its parking entitlement (E6-S05/S06)">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <label className="label" htmlFor="p-lease">Lease</label>
              <select id="p-lease" className="input" value={lease} onChange={(e) => setLease(e.target.value)} disabled={!canEdit}>
                <option value="">Select a lease…</option>
                {data.leases.map((l) => <option key={l.lease_id} value={l.lease_id}>{l.occupier} — {l.allocated}/{l.entitled} bays</option>)}
              </select>
            </div>
            <button className="btn btn-gold" disabled={!lease || !picked.size} onClick={allocate}>Allocate {picked.size || ''} selected</button>
          </div>
          {sel && <p className="mt-2 text-xs text-ink-soft">{sel.occupier} is entitled to <b>{sel.entitled}</b> slots and has <b>{sel.allocated}</b> bays. Pick up to {Math.max(0, sel.entitled - sel.allocated)} green bays below.</p>}
          {!canEdit && <p className="mt-2 text-xs text-ink-muted">Read-only for your role.</p>}
        </Card>
      </div>

      <Card title="Bay map" sub="Click an available bay to select it; click an allocated bay to see or release it" action={plan ? <a href={href(`buildings/${buildingId}/images/${plan.image_id}`)} className="text-xs font-semibold text-royal hover:underline">Parking plan ↗</a> : <span className="text-[11px] text-ink-muted">No parking-plan image yet (E6-S03)</span>}>
        <div className="mb-3 flex flex-wrap gap-4 text-[11px] text-ink-soft">
          {(Object.keys(STYLE) as Bay['status'][]).map((st) => <span key={st} className="flex items-center gap-1.5"><i className={`h-3 w-3 rounded-sm border ${STYLE[st]}`} />{st} {data.counts[st]}</span>)}
          <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border-2 border-gold" /> Selected {picked.size}</span>
          <span className="text-ink-muted">EV and visitor bays are the first four on each level.</span>
        </div>
        <div className="space-y-3">
          {levels.map(([lvl, bays]) => (
            <div key={lvl}>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted">Level {lvl} · {bays[0].level}</div>
              <div className="flex flex-wrap gap-1">
                {bays.map((b) => (
                  <button
                    key={b.bay_id}
                    title={`${b.bay_label} · ${b.type} · ${b.status}${b.lease_id ? ` · ${occ.get(b.lease_id) ?? 'leased'}` : ''}`}
                    onClick={() => {
                      if (b.status === 'Available' && canEdit) setPicked((p) => { const n = new Set(p); if (n.has(b.bay_id)) n.delete(b.bay_id); else n.add(b.bay_id); return n })
                      else setFocus(b)
                    }}
                    className={`h-7 w-11 rounded border text-[9px] font-semibold leading-none ${STYLE[b.status]} ${picked.has(b.bay_id) ? 'border-2 border-gold' : ''}`}
                  >
                    {b.type === 'EV' ? '⚡' : b.type === 'Visitor' ? 'V' : b.bay_label.split('-')[1]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {focus && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-canvas px-3 py-2 text-xs">
            <span>
              Bay <b>{focus.bay_label}</b> · {focus.type} · {focus.status}
              {focus.lease_id && <> · <a className="font-semibold text-royal hover:underline" href={href(`leases/${focus.lease_id}`)}>{occ.get(focus.lease_id) ?? 'Lease'}</a></>}
            </span>
            <span className="flex gap-1.5">
              {focus.status === 'Allocated' && canEdit && (
                <button className="btn py-1 text-[11px]" onClick={async () => { try { await api.releaseBay(focus.bay_id, session); toast('ok', `Bay ${focus.bay_label} released.`); setFocus(null) } catch (e) { handle(e) } }}>Release bay</button>
              )}
              <button className="btn py-1 text-[11px]" onClick={() => setFocus(null)}>Close</button>
            </span>
          </div>
        )}
      </Card>

      {rest[0] === 'rates' && (
        <EntityPage entity="parkingRate" basePath={`${base}/rates`} rest={rest.slice(1)} linkTo={linkFor(session)} embedded where={{ building_id: buildingId }} newLabel="Add rate" />
      )}
      {dialog}
    </div>
  )
}
