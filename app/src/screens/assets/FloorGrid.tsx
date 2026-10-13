import { useEffect, useMemo, useState } from 'react'
import type { Session } from '../../access/session'
import * as api from '../../data/api'
import { ApiError } from '../../data/api'
import { useApi } from '../../data/useApi'
import type { BuildingFloor } from '../../domain/assets'
import type { Rec } from '../../entities/types'
import { daysFromToday } from '../../lib/dates'
import { navigate } from '../../state/router'
import { useToast } from '../../components/ui/Toast'
import { LockIcon } from '../../components/crud/fields'

const USES = ['Office', 'Parking', 'Retail', 'Amenity']
const OCC = ['Leased', 'Vacant', 'Partially leased', 'Self-occupied']
const ORDER = ['UB', 'G', 'LB', 'B1', 'B2', 'B3']
const rank = (f: string) => (/^\d+$/.test(f) ? 1000 - Number(f) : 1000 + (ORDER.indexOf(f) < 0 ? 99 : ORDER.indexOf(f)))

/** E1-S02 floor-by-floor inventory as an inline-editable grid; each changed row is saved through the api (validated & audited). */
export default function FloorGrid({ session, buildingId, basePath }: { session: Session; buildingId: string; basePath: string }) {
  const toast = useToast()
  const perms = api.permissions('floor', session)
  const { data } = useApi(() => api.list('floor', session, { building_id: buildingId }), [buildingId, session.user.user_id])
  const [edits, setEdits] = useState<Record<string, Rec>>({})
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({})
  const [saving, setSaving] = useState(false)
  useEffect(() => setEdits({}), [buildingId])

  const floors = useMemo(() => [...((data as BuildingFloor[]) ?? [])].sort((a, b) => rank(a.floor_no) - rank(b.floor_no) || (a.wing ?? '').localeCompare(b.wing ?? '')), [data])
  if (!data) return null
  const rentVisible = floors.some((f) => 'asking_rent' in f)
  const dirty = Object.keys(edits).length
  const val = (f: Rec, k: string) => (edits[f.floor_id] && k in edits[f.floor_id] ? edits[f.floor_id][k] : f[k])
  const set = (f: Rec, k: string, v: unknown) => setEdits((e) => ({ ...e, [f.floor_id]: { ...e[f.floor_id], [k]: v } }))
  const num = (v: string) => (v === '' ? null : Number(v))

  const saveAll = async () => {
    setSaving(true)
    const errs: Record<string, Record<string, string>> = {}
    let ok = 0
    for (const [id, patch] of Object.entries(edits)) {
      try {
        await api.update('floor', id, patch, session)
        ok++
      } catch (e) {
        errs[id] = e instanceof ApiError && Object.keys(e.fieldErrors).length ? e.fieldErrors : { floor_no: (e as Error).message }
      }
    }
    setErrors(errs)
    setEdits((e) => Object.fromEntries(Object.entries(e).filter(([id]) => errs[id])))
    setSaving(false)
    if (ok) toast('ok', `${ok} floor${ok === 1 ? '' : 's'} saved.`)
    if (Object.keys(errs).length) toast('error', `${Object.keys(errs).length} floor${Object.keys(errs).length === 1 ? '' : 's'} need fixing.`)
  }

  const totals = floors.reduce(
    (t, f) => ({ chargeable: t.chargeable + (f.chargeable_area ?? 0), carpet: t.carpet + (f.carpet_area ?? 0) }),
    { chargeable: 0, carpet: 0 },
  )
  const cell = 'border-b border-line-light px-2 py-1.5'
  const inp = 'w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-[13px] hover:border-line focus:border-royal focus:bg-white focus:outline-none disabled:hover:border-transparent'

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          {floors.length} floors · {totals.chargeable.toLocaleString('en-IN')} sq ft chargeable · overall efficiency {totals.chargeable ? ((totals.carpet / totals.chargeable) * 100).toFixed(1) : '—'}%
          {perms.update && ' · click any cell to edit'}
        </p>
        <div className="flex gap-2">
          {dirty > 0 && <button className="btn" onClick={() => (setEdits({}), setErrors({}))}>Discard</button>}
          {perms.update && <button className="btn btn-primary" disabled={!dirty || saving} onClick={saveAll}>{saving ? 'Saving…' : `Save changes${dirty ? ` (${dirty})` : ''}`}</button>}
          {perms.create && <button className="btn btn-gold" onClick={() => navigate(`${basePath}/new`)}>+ Add floor</button>}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[980px] text-[13px]">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              <th className="px-2 py-2.5 pl-3">Floor</th>
              <th className="px-2 py-2.5">Wing</th>
              <th className="px-2 py-2.5">Use</th>
              <th className="px-2 py-2.5 text-right">Chargeable</th>
              <th className="px-2 py-2.5 text-right">Carpet</th>
              <th className="px-2 py-2.5 text-right">Eff.</th>
              <th className="px-2 py-2.5">Occupancy</th>
              <th className="px-2 py-2.5">Self-occupied by / vacant since</th>
              <th className="px-2 py-2.5 text-right">
                {rentVisible ? 'Ask ₹/sq ft' : <span className="inline-flex items-center gap-1"><LockIcon /> Ask rent</span>}
              </th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {floors.map((f) => {
              const e = errors[f.floor_id] ?? {}
              const ro = !perms.update
              const parking = val(f, 'floor_use') === 'Parking'
              const occ = val(f, 'occupancy_type')
              const charge = val(f, 'chargeable_area')
              const carpet = val(f, 'carpet_area')
              const changed = !!edits[f.floor_id]
              return (
                <tr key={f.floor_id} className={changed ? 'bg-gold-light/40' : Object.keys(e).length ? 'bg-crit-bg/50' : ''}>
                  <td className={`${cell} pl-3`}><input className={`${inp} w-14 font-mono font-semibold`} disabled={ro} value={val(f, 'floor_no') ?? ''} onChange={(ev) => set(f, 'floor_no', ev.target.value)} /></td>
                  <td className={cell}><input className={`${inp} w-20`} disabled={ro} value={val(f, 'wing') ?? ''} onChange={(ev) => set(f, 'wing', ev.target.value || null)} /></td>
                  <td className={cell}>
                    <select className={`${inp} w-[92px]`} disabled={ro} value={val(f, 'floor_use')} onChange={(ev) => set(f, 'floor_use', ev.target.value)}>
                      {USES.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className={cell}><input type="number" className={`${inp} text-right`} disabled={ro} value={charge ?? ''} onChange={(ev) => set(f, 'chargeable_area', num(ev.target.value))} /></td>
                  <td className={cell}><input type="number" className={`${inp} text-right`} disabled={ro} value={carpet ?? ''} onChange={(ev) => set(f, 'carpet_area', num(ev.target.value))} /></td>
                  <td className={`${cell} text-right text-ink-soft`}>{charge && carpet ? `${((carpet / charge) * 100).toFixed(1)}%` : '—'}</td>
                  <td className={cell}>
                    {parking ? (
                      <span className="px-1.5 text-ink-muted">—</span>
                    ) : (
                      <select className={`${inp} w-[150px]`} disabled={ro} value={occ ?? ''} onChange={(ev) => set(f, 'occupancy_type', ev.target.value)}>
                        {OCC.map((u) => <option key={u}>{u}</option>)}
                      </select>
                    )}
                  </td>
                  <td className={cell}>
                    {occ === 'Self-occupied' ? (
                      <input className={inp} disabled={ro} placeholder="Group company" value={val(f, 'self_occupied_entity') ?? ''} onChange={(ev) => set(f, 'self_occupied_entity', ev.target.value)} />
                    ) : occ === 'Vacant' || occ === 'Partially leased' ? (
                      <span className="flex items-center gap-2">
                        <input type="date" className={`${inp} w-36`} disabled={ro} value={val(f, 'vacant_since') ?? ''} onChange={(ev) => set(f, 'vacant_since', ev.target.value || null)} />
                        {f.vacant_since && <span className={`whitespace-nowrap text-[11px] font-semibold ${-daysFromToday(f.vacant_since) > 180 ? 'text-crit' : 'text-ink-muted'}`}>{-daysFromToday(f.vacant_since)}d</span>}
                      </span>
                    ) : (
                      <span className="px-1.5 text-ink-muted">—</span>
                    )}
                  </td>
                  <td className={cell}>
                    {parking || !('asking_rent' in f) ? (
                      <span className="block px-1.5 text-right text-ink-muted">—</span>
                    ) : (
                      <input type="number" className={`${inp} text-right`} disabled={ro} value={val(f, 'asking_rent') ?? ''} onChange={(ev) => set(f, 'asking_rent', num(ev.target.value))} />
                    )}
                  </td>
                  <td className={`${cell} pr-3 text-right`}>
                    <button className="text-xs font-semibold text-royal hover:underline" onClick={() => navigate(`${basePath}/${f.floor_id}`)}>Open</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {Object.entries(errors).length > 0 && (
          <ul className="border-t border-crit/30 bg-crit-bg px-4 py-2 text-xs text-crit">
            {Object.entries(errors).map(([id, e]) => (
              <li key={id}>Floor {floors.find((f) => f.floor_id === id)?.floor_no}: {Object.values(e).join(' ')}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
