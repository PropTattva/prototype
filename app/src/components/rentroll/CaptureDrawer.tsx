import { useState } from 'react'
import type { Session } from '../../access/session'
import * as api from '../../data/api'
import { ApiError } from '../../data/api'
import type { Lease } from '../../domain/leasing'
import type { OptionCtx } from '../../entities/types'
import { CAPTURE_FIELDS, cr } from '../../lib/rentRoll'
import Drawer from '../ui/Drawer'
import { useToast } from '../ui/Toast'

/** Capture or correct a lease's commercials (rent, CAM, escalation, term, deposit). */
type Draft = Partial<Record<(typeof CAPTURE_FIELDS)[number]['key'] | 'rent_free_months', string>>

export default function CaptureDrawer({ lease, ctx, session, nextId = null, onClose, onNext }: { lease: Lease; ctx: OptionCtx; session: Session; nextId?: string | null; onClose: () => void; onNext?: (id: string) => void }) {
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
      if (andNext && nextId && onNext) onNext(nextId)
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
