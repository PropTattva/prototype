import { useMemo, useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import { fmtDate } from '../../lib/dates'
import { fmtSft } from '../../lib/format'
import { href } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import Badge from '../../components/ui/Badge'
import KpiCard from '../../components/ui/KpiCard'
import PageHeader from '../../components/ui/PageHeader'
import { ViewToggle } from '../../components/drill/Drill'
import { LockIcon } from '../../components/crud/fields'

const AGE = [
  { key: '', label: 'Any vacancy age' },
  { key: '90', label: 'Vacant > 90 days' },
  { key: '180', label: 'Vacant > 180 days (aged)' },
]

/** E4-S01/S02: everything on the market, with vacancy age surfaced as a risk. */
export default function Availability() {
  const session = useAuthed()
  const { data } = useApi(() => api.availability(session), [session.user.user_id])
  const [f, setF] = useState({ city: '', handover: '', kind: '', age: '', min: '' })
  const rows = useMemo(
    () =>
      (data ?? [])
        .filter(
          (r) =>
            (!f.city || r.city === f.city) &&
            (!f.handover || r.handover === f.handover) &&
            (!f.kind || r.kind === f.kind) &&
            (!f.age || (r.vacancy_days ?? 0) > Number(f.age)) &&
            (!f.min || r.area >= Number(f.min)),
        )
        .sort((a, b) => (b.vacancy_days ?? -1) - (a.vacancy_days ?? -1)),
    [data, f],
  )
  if (!data) return null
  const opts = (k: 'city' | 'handover' | 'kind') => [...new Set(data.map((r) => r[k]))].sort()
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const total = rows.reduce((s, r) => s + r.area, 0)
  const ready = rows.filter((r) => r.kind !== 'Whole building').reduce((s, r) => s + r.area, 0)
  const aged = rows.filter((r) => (r.vacancy_days ?? 0) > 180)
  const showRent = data.some((r) => r.asking_rent != null)

  return (
    <>
      <PageHeader title="Availability" subtitle="Vacant and part-leased floors plus under-construction buildings on the market." right={<ViewToggle module="availability" v2={false} />} />
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Spaces" value={rows.length} hint={`${new Set(rows.map((r) => r.building_id)).size} buildings`} />
        <KpiCard label="Total available" value={fmtSft(total)} unit="sq ft" />
        <KpiCard label="Ready / built" value={fmtSft(ready)} unit="sq ft" hint={`${fmtSft(total - ready)} sq ft under construction`} />
        <KpiCard label="Aged vacancy" value={aged.length} hint={`${fmtSft(aged.reduce((s, r) => s + r.area, 0))} sq ft vacant > 180 days`} />
      </div>
      <div className="mb-3 flex flex-wrap gap-2 rounded-lg border border-line bg-white p-3">
        <select className="input w-auto" value={f.city} onChange={set('city')} aria-label="City"><option value="">All cities</option>{opts('city').map((x) => <option key={x}>{x}</option>)}</select>
        <select className="input w-auto" value={f.handover} onChange={set('handover')} aria-label="Handover"><option value="">All handover conditions</option>{opts('handover').map((x) => <option key={x}>{x}</option>)}</select>
        <select className="input w-auto" value={f.kind} onChange={set('kind')} aria-label="Type"><option value="">Floors & buildings</option>{opts('kind').map((x) => <option key={x}>{x}</option>)}</select>
        <select className="input w-auto" value={f.age} onChange={set('age')} aria-label="Vacancy age">{AGE.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select>
        <input className="input w-40" type="number" min={0} placeholder="Min sq ft" value={f.min} onChange={set('min')} aria-label="Minimum area" />
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              <th className="px-4 py-2.5">Building</th>
              <th className="px-3 py-2.5">Space</th>
              <th className="px-3 py-2.5 text-right">Area (sq ft)</th>
              <th className="px-3 py-2.5">Handover</th>
              <th className="px-3 py-2.5">Available</th>
              <th className="px-3 py-2.5 text-right">Vacant for</th>
              <th className="px-4 py-2.5 text-right">{showRent ? 'Ask ₹/sq ft' : <span className="inline-flex items-center gap-1"><LockIcon /> Rent</span>}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-line-light last:border-0 hover:bg-hover">
                <td className="px-4 py-2.5">
                  <a href={href(`buildings/${r.building_id}`)} className="font-semibold text-royal hover:underline">{r.building}</a>
                  <div className="text-[11px] text-ink-muted">{[r.micro_market, r.city, r.grade && `Grade ${r.grade}`].filter(Boolean).join(' · ')}</div>
                </td>
                <td className="px-3 py-2.5 text-ink-soft">
                  {r.space}
                  {r.kind !== 'Floor' && <span className="ml-1.5"><Badge tone={r.kind === 'Whole building' ? 'gold' : 'royal'}>{r.kind}</Badge></span>}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold">{r.area.toLocaleString('en-IN')}</td>
                <td className="px-3 py-2.5 text-ink-soft">{r.handover}</td>
                <td className="px-3 py-2.5 text-ink-soft">{r.available_from ? fmtDate(r.available_from) : '—'}</td>
                <td className={`px-3 py-2.5 text-right ${(r.vacancy_days ?? 0) > 180 ? 'font-bold text-crit' : 'text-ink-soft'}`}>{r.vacancy_days != null ? `${r.vacancy_days} days` : '—'}</td>
                <td className="px-4 py-2.5 text-right">{r.asking_rent != null ? `₹${r.asking_rent}` : '—'}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-muted">No space matches these filters.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gold bg-canvas text-[13px] font-bold">
                <td className="px-4 py-2.5" colSpan={2}>Total · {rows.length} spaces</td>
                <td className="px-3 py-2.5 text-right">{total.toLocaleString('en-IN')}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  )
}
