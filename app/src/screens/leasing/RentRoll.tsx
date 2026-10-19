import { Fragment, useMemo, useState } from 'react'
import type { Session } from '../../access/session'
import * as api from '../../data/api'
import { ApiError } from '../../data/api'
import { useApi } from '../../data/useApi'
import type { Lease } from '../../domain/leasing'
import type { OptionCtx } from '../../entities/types'
import { fmtDate, todayIso } from '../../lib/dates'
import { fmtSft } from '../../lib/format'
import { CAPTURE_FIELDS, cr, rollRow, rollTotals, type RollRow } from '../../lib/rentRoll'
import { href } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import Drawer from '../../components/ui/Drawer'
import KpiCard from '../../components/ui/KpiCard'
import PageHeader from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/Toast'

/** Rent roll: contracted commercials across every active lease, grouped by building, with capture for the gaps. */
export default function RentRoll({ rest = [] }: { rest?: string[] }) {
  const session = useAuthed()
  const today = todayIso()
  const { data: ctx } = useApi(() => api.getOptionCtx(session), [session.user.user_id])
  const { data: all } = useApi(() => api.list('lease', session), [session.user.user_id])
  const [city, setCity] = useState('')
  const [q, setQ] = useState('')
  const [pendingOnly, setPendingOnly] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())
  // #/rent-roll/capture/<lease_id> opens the capture form directly (linked from the lease page).
  const [capturing, setCapturing] = useState<string | null>(rest[0] === 'capture' ? rest[1] ?? null : null)
  const toast = useToast()

  const rows = useMemo(() => ((all ?? []) as Lease[]).filter((l) => l.status === 'Active').map((l) => rollRow(l, today)), [all, today])
  if (!ctx || !all) return null
  const canEdit = api.permissions('lease', session).update
  // Commercials are owner-only fields: when they're stripped for this viewer, there is no rent roll to show.
  if (rows.length && rows.every((r) => !('rent' in r.lease))) {
    return (
      <>
        <PageHeader title="Rent roll" />
        <p className="rounded-lg border border-line bg-white px-4 py-10 text-center text-sm text-ink-muted">Lease commercials are not shared with your role.</p>
      </>
    )
  }

  const building = (id: string) => ctx.buildings.find((b) => b.building_id === id)
  const occupier = (id: string) => ctx.occupiers.find((o) => o.occupier_id === id)
  const cities = [...new Set(rows.map((r) => building(r.lease.building_id)?.city).filter(Boolean) as string[])].sort()
  const needle = q.trim().toLowerCase()
  const filtered = rows.filter(
    (r) =>
      (!city || building(r.lease.building_id)?.city === city) &&
      (!pendingOnly || r.missing.length) &&
      (!needle || (occupier(r.lease.occupier_id)?.name ?? '').toLowerCase().includes(needle) || (building(r.lease.building_id)?.name ?? '').toLowerCase().includes(needle)),
  )
  const totals = rollTotals(filtered)
  const pending = rows.filter((r) => r.missing.length)
  const pendingArea = pending.reduce((s, r) => s + r.lease.area, 0)
  const groups = [...new Set(filtered.map((r) => r.lease.building_id))]
    .map((id) => ({ id, b: building(id), rows: filtered.filter((r) => r.lease.building_id === id) }))
    .sort((a, b) => (a.b?.name ?? '').localeCompare(b.b?.name ?? '', undefined, { numeric: true }))
  const expanded = (id: string) => open.has(id) || pendingOnly || !!needle
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allOpen = groups.every((g) => open.has(g.id))

  const exportCsv = () => {
    const head = ['Building', 'City', 'Occupier', 'Area (sq ft)', 'Start', 'Expiry', 'Rent ₹/sq ft/mo', 'CAM ₹/sq ft/mo', 'Monthly (rent+CAM) ₹', 'Annual rent ₹', 'Escalation %', 'Frequency', 'Next escalation', 'Status']
    const lines = filtered.map((r) => {
      const l = r.lease
      const b = building(l.building_id)
      return [b?.name, b?.city, occupier(l.occupier_id)?.name, l.area, l.start, l.expiry, l.rent ?? '', l.CAM ?? '', Math.round(r.monthly), Math.round(r.annualRent), l.escalation_pct ?? '', l.escalation_freq ?? '', r.nextEscalation ?? '', r.missing.length ? `Pending: ${r.missing.join('; ')}` : 'Captured']
    })
    const csv = [head, ...lines].map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `rent-roll-${today}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    toast('info', `Exported ${filtered.length} leases.`)
  }

  return (
    <>
      <PageHeader
        title="Rent roll"
        subtitle={`Contracted commercials across ${rows.length} active leases · as of ${fmtDate(today)}`}
        right={<button className="btn" onClick={exportCsv}>Export CSV</button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <KpiCard label="Annual rent roll" value={cr(totals.annual)} hint="Base rent, captured leases" />
        <KpiCard label="Monthly billing" value={cr(totals.monthly)} hint="Rent + CAM, pre-GST" />
        <KpiCard label="Avg rent" value={`₹${totals.avgRent.toFixed(1)}`} unit="/sq ft/mo" hint="Area-weighted" />
        <KpiCard label="WALE" value={totals.wale.toFixed(1)} unit="yrs" hint="Area-weighted, to expiry" />
        <div className="col-span-2 rounded-lg border border-line bg-white p-3.5 lg:col-span-1">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted">Captured</div>
          <div className="text-[22px] font-extrabold leading-tight text-royal">
            {rows.length - pending.length}<span className="ml-0.5 text-[11px] font-medium text-ink-muted">/ {rows.length} leases</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hover">
            <div className="h-full rounded-full bg-ok" style={{ width: `${rows.length ? ((rows.length - pending.length) / rows.length) * 100 : 0}%` }} />
          </div>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/40 bg-warn-bg px-4 py-2.5 text-sm">
          <span className="text-[#7a5300]">
            <strong>{pending.length} leases pending capture</strong> · {fmtSft(pendingArea)} sq ft not yet in the rent roll
          </span>
          {canEdit && <button className="btn btn-gold" onClick={() => setCapturing(pending[0].lease.lease_id)}>Capture next →</button>}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
        <div className="flex flex-wrap gap-1.5">
          {['', ...cities].map((c) => (
            <button key={c || 'all'} onClick={() => setCity(c)} className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold ${city === c ? 'border-royal bg-royal text-white' : 'border-line bg-white text-ink-soft hover:border-royal hover:text-royal'}`}>
              {c || 'All cities'}
            </button>
          ))}
        </div>
        <input className="input min-w-[180px] flex-1" placeholder="Search occupier or building" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
          <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} /> Pending capture only
        </label>
        <button className="btn" onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.id)))}>{allOpen ? 'Collapse all' : 'Expand all'}</button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[1080px] text-[13px]">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              <th className="px-4 py-2.5">Building / occupier</th>
              <th className="px-3 py-2.5 text-right">Area (sq ft)</th>
              <th className="px-3 py-2.5">Term</th>
              <th className="px-3 py-2.5 text-right">Rent</th>
              <th className="px-3 py-2.5 text-right">CAM</th>
              <th className="px-3 py-2.5 text-right">Monthly</th>
              <th className="px-3 py-2.5 text-right">Annual rent</th>
              <th className="px-3 py-2.5">Escalation</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const t = rollTotals(g.rows)
              const gPending = g.rows.filter((r) => r.missing.length).length
              const isOpen = expanded(g.id)
              return (
                <Fragment key={g.id}>
                  <tr onClick={() => toggle(g.id)} className="cursor-pointer border-b border-line bg-royal-soft/40 hover:bg-royal-soft">
                    <td className="px-4 py-2.5">
                      <span className="mr-2 inline-block w-3 text-royal">{isOpen ? '▾' : '▸'}</span>
                      <span className="font-extrabold text-royal">{g.b?.name}</span>
                      <span className="ml-2 text-[11px] text-ink-muted">{g.b?.city} · {g.rows.length} {g.rows.length === 1 ? 'lease' : 'leases'}</span>
                      {gPending > 0 && <span className="ml-2 rounded bg-warn-bg px-1.5 py-0.5 text-[10px] font-bold text-[#7a5300]">{gPending} pending</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold">{t.area.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2.5 text-ink-soft">WALE {t.wale.toFixed(1)} yrs</td>
                    <td className="px-3 py-2.5 text-right text-ink-soft">{t.avgRent ? `₹${t.avgRent.toFixed(1)} avg` : '—'}</td>
                    <td />
                    <td className="px-3 py-2.5 text-right font-bold">{cr(t.monthly)}</td>
                    <td className="px-3 py-2.5 text-right font-bold">{cr(t.annual)}</td>
                    <td colSpan={2} />
                  </tr>
                  {isOpen && g.rows.map((r) => <LeaseRow key={r.lease.lease_id} r={r} ctx={ctx} canEdit={canEdit} onCapture={() => setCapturing(r.lease.lease_id)} />)}
                </Fragment>
              )
            })}
            {!groups.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-ink-muted">No leases match.</td></tr>}
          </tbody>
          {groups.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gold bg-canvas font-bold">
                <td className="px-4 py-2.5">Total · {filtered.length} leases{totals.captured < totals.leases ? ` (${totals.leases - totals.captured} pending, excluded from rent)` : ''}</td>
                <td className="px-3 py-2.5 text-right">{totals.area.toLocaleString('en-IN')}</td>
                <td className="px-3 py-2.5">WALE {totals.wale.toFixed(1)} yrs</td>
                <td className="px-3 py-2.5 text-right">₹{totals.avgRent.toFixed(1)} avg</td>
                <td />
                <td className="px-3 py-2.5 text-right">{cr(totals.monthly)}</td>
                <td className="px-3 py-2.5 text-right">{cr(totals.annual)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {capturing && rows.some((r) => r.lease.lease_id === capturing) && (
        <CaptureDrawer
          key={capturing}
          lease={rows.find((r) => r.lease.lease_id === capturing)!.lease}
          ctx={ctx}
          session={session}
          nextId={pending.find((r) => r.lease.lease_id !== capturing)?.lease.lease_id ?? null}
          onClose={() => setCapturing(null)}
          onNext={(id) => setCapturing(id)}
        />
      )}
    </>
  )
}

function LeaseRow({ r, ctx, canEdit, onCapture }: { r: RollRow; ctx: OptionCtx; canEdit: boolean; onCapture: () => void }) {
  const l = r.lease
  const occ = ctx.occupiers.find((o) => o.occupier_id === l.occupier_id)
  const pending = r.missing.length > 0
  const money = (v: number | null, unit = '') => (v == null ? <span className="text-ink-muted">—</span> : `₹${v}${unit}`)
  return (
    <tr className={`border-b border-line-light last:border-0 ${pending ? 'bg-warn-bg/50' : 'hover:bg-hover'}`}>
      <td className="py-2.5 pl-10 pr-3">
        <a href={href(`leases/${l.lease_id}`)} className="font-semibold text-ink hover:text-royal hover:underline">{occ?.name ?? 'Occupier'}</a>
        {occ?.tier && <span className="ml-1.5 text-[10px] font-bold text-ink-muted">{occ.tier}</span>}
        {pending && <div className="mt-0.5 text-[11px] font-semibold text-[#7a5300]">Pending: {r.missing.join(', ')}</div>}
      </td>
      <td className="px-3 py-2.5 text-right">{l.area.toLocaleString('en-IN')}</td>
      <td className="px-3 py-2.5 text-ink-soft">
        {fmtDate(l.start)} → {fmtDate(l.expiry)}
        <div className="text-[11px] text-ink-muted">{r.yearsLeft.toFixed(1)} yrs left</div>
      </td>
      <td className="px-3 py-2.5 text-right">{money(l.rent)}</td>
      <td className="px-3 py-2.5 text-right">{money(l.CAM)}</td>
      <td className="px-3 py-2.5 text-right">{pending ? <span className="text-ink-muted">—</span> : cr(r.monthly)}</td>
      <td className="px-3 py-2.5 text-right font-semibold">{pending ? <span className="text-ink-muted">—</span> : cr(r.annualRent)}</td>
      <td className="px-3 py-2.5 text-ink-soft">
        {l.escalation_pct != null ? `${l.escalation_pct}% · ${l.escalation_freq ?? '—'}` : <span className="text-ink-muted">—</span>}
        {r.nextEscalation && <div className="text-[11px] text-ink-muted">Next {fmtDate(r.nextEscalation)} → ₹{r.escalatedRent}</div>}
      </td>
      <td className="px-4 py-2.5 text-right">
        {canEdit && (
          <button onClick={onCapture} className={pending ? 'btn btn-gold' : 'btn'}>{pending ? 'Capture' : 'Edit'}</button>
        )}
      </td>
    </tr>
  )
}

type Draft = Partial<Record<(typeof CAPTURE_FIELDS)[number]['key'] | 'rent_free_months', string>>

function CaptureDrawer({ lease, ctx, session, nextId, onClose, onNext }: { lease: Lease; ctx: OptionCtx; session: Session; nextId: string | null; onClose: () => void; onNext: (id: string) => void }) {
  const toast = useToast()
  const str = (v: unknown) => (v == null ? '' : String(v))
  const [d, setD] = useState<Draft>({
    rent: str(lease.rent), CAM: str(lease.CAM), escalation_pct: str(lease.escalation_pct), escalation_freq: str(lease.escalation_freq),
    start: str(lease.start), expiry: str(lease.expiry), deposit_months: str(lease.deposit_months), rent_free_months: str(lease.rent_free_months),
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const b = ctx.buildings.find((x) => x.building_id === lease.building_id)
  const occ = ctx.occupiers.find((o) => o.occupier_id === lease.occupier_id)
  const num = (v?: string) => (v == null || v === '' ? null : Number(v))
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }))

  const save = async (andNext: boolean) => {
    const e: Record<string, string> = {}
    if (!(num(d.rent)! > 0)) e.rent = 'Enter the contracted rent.'
    if (num(d.CAM) == null) e.CAM = 'Enter CAM (0 if included in rent).'
    if (num(d.escalation_pct) == null) e.escalation_pct = 'Enter the escalation %.'
    if (!d.escalation_freq) e.escalation_freq = 'Pick how often rent escalates.'
    if (num(d.deposit_months) == null) e.deposit_months = 'Enter the deposit in months of rent.'
    setErrors(e)
    if (Object.keys(e).length) return
    try {
      await api.update('lease', lease.lease_id, {
        rent: num(d.rent), CAM: num(d.CAM), escalation_pct: num(d.escalation_pct), escalation_freq: d.escalation_freq,
        start: d.start, expiry: d.expiry, deposit_months: num(d.deposit_months), rent_free_months: num(d.rent_free_months) ?? 0, deposit: null,
      }, session)
      toast('ok', `Rent roll updated for ${occ?.name ?? 'lease'}.`)
      if (andNext && nextId) onNext(nextId)
      else onClose()
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors)
      else toast('error', (err as Error).message)
    }
  }

  const field = (k: keyof Draft, label: string, input: JSX.Element, hint?: string) => (
    <label className="block">
      <span className="label">{label}</span>
      {input}
      {errors[k] ? <span className="mt-1 block text-xs text-crit">{errors[k]}</span> : hint && <span className="mt-1 block text-[11px] text-ink-muted">{hint}</span>}
    </label>
  )
  const n = (k: keyof Draft, step = '0.5') => <input className="input" type="number" min={0} step={step} value={d[k] ?? ''} onChange={set(k)} />

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Capture commercials — ${occ?.name ?? 'lease'}`}
      sub={`${b?.name} · ${lease.area.toLocaleString('en-IN')} sq ft · ${lease.lease_id}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => save(false)}>Save</button>
          {nextId && <button className="btn btn-gold" onClick={() => save(true)}>Save & next →</button>}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field('rent', 'Rent (₹/sq ft/month)', n('rent'))}
        {field('CAM', 'CAM (₹/sq ft/month)', n('CAM'))}
        {field('escalation_pct', 'Escalation %', n('escalation_pct'))}
        {field('escalation_freq', 'Escalation frequency', (
          <select className="input" value={d.escalation_freq ?? ''} onChange={set('escalation_freq')}>
            <option value="">Select…</option>
            {['Annual', 'Biennial', 'Every 3 years'].map((o) => <option key={o}>{o}</option>)}
          </select>
        ))}
        {field('start', 'Start', <input className="input" type="date" value={d.start ?? ''} onChange={set('start')} />)}
        {field('expiry', 'Expiry', <input className="input" type="date" value={d.expiry ?? ''} onChange={set('expiry')} />)}
        {field('deposit_months', 'Security deposit (months)', n('deposit_months', '1'), 'Deposit amount is calculated from rent × area × months.')}
        {field('rent_free_months', 'Rent-free period (months)', n('rent_free_months', '1'))}
      </div>
      {num(d.rent) != null && (
        <div className="mt-5 rounded-lg border border-line bg-canvas p-3 text-sm">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted">Preview</div>
          Monthly billing <strong>{cr(((num(d.rent) ?? 0) + (num(d.CAM) ?? 0)) * lease.area)}</strong> · Annual rent <strong>{cr((num(d.rent) ?? 0) * lease.area * 12)}</strong>
        </div>
      )}
    </Drawer>
  )
}
