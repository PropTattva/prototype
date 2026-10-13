import { useMemo, useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import { entityDef } from '../../entities/registry'
import type { Rec } from '../../entities/types'
import { addMonths, todayIso } from '../../lib/dates'
import { navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import { FieldInput } from '../../components/crud/fields'
import RecordDrawer, { useErrorHandler } from '../../components/crud/RecordDrawer'
import Card from '../../components/ui/Card'
import PageHeader from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/Toast'
import { linkFor } from '../../lib/links'

const STEPS = [
  { title: 'Space', sub: 'Occupier, building and the floors leased' },
  { title: 'Commercials', sub: 'Rent, CAM, escalation, rent-free and fit-out (E2)', fields: ['rent', 'CAM', 'escalation_pct', 'escalation_freq', 'rent_free_months', 'rent_free_conditions', 'TI_contribution'] },
  { title: 'Deposit & parking', sub: 'Security deposit and receipt (E2-S09/S10)', fields: ['deposit_months', 'deposit', 'deposit_form', 'deposit_received', 'received_date', 'parking_slots'] },
  { title: 'Term', sub: 'Dates, break option and source (E3-S01/S02)', fields: ['start', 'expiry', 'break_date', 'source_tag', 'status'] },
]

interface SpacePick {
  floor_id: string
  area: number
}

/** Lease register entry (E3-S01) as a guided flow; floors switch to Leased when it is saved. */
export default function LeaseWizard({ buildingId }: { buildingId?: string }) {
  const session = useAuthed()
  const toast = useToast()
  const def = entityDef('lease')
  const { data: ctx } = useApi(() => api.getOptionCtx(session), [session.user.user_id])
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Rec>(() => ({
    ...def.defaults!({} as never),
    building_id: buildingId ?? null,
    start: todayIso(),
    expiry: addMonths(todayIso(), 108),
  }))
  const [spaces, setSpaces] = useState<SpacePick[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [newOccupier, setNewOccupier] = useState(false)
  const { dialog, handle } = useErrorHandler(session)

  const floors = useMemo(
    () => (ctx?.floors ?? []).filter((f) => f.building_id === draft.building_id && f.floor_use !== 'Parking' && (f.occupancy_type === 'Vacant' || f.occupancy_type === 'Partially leased')),
    [ctx, draft.building_id],
  )
  if (!ctx) return null
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }))
  const area = spaces.reduce((s, x) => s + (x.area || 0), 0)
  const field = (k: string) => def.fields.find((f) => f.key === k)!
  const monthly = (draft.rent ?? 0) * area
  const estDeposit = draft.deposit ?? (draft.rent && draft.deposit_months ? draft.rent * area * draft.deposit_months : null)
  const stepError = (i: number) => (i === 0 ? ['occupier_id', 'building_id', 'spaces'] : STEPS[i].fields ?? []).some((k) => errors[k])

  const toggle = (floorId: string, chargeable: number | null) =>
    setSpaces((s) => (s.some((x) => x.floor_id === floorId) ? s.filter((x) => x.floor_id !== floorId) : [...s, { floor_id: floorId, area: chargeable ?? 0 }]))

  const submit = async () => {
    setSaving(true)
    setErrors({})
    try {
      const lease = await api.createLease(draft, spaces.map((s) => ({ ...s, unit_id: null })), session)
      toast('ok', `Lease created — ${spaces.length} floor${spaces.length === 1 ? '' : 's'} now leased.`)
      navigate(`leases/${lease.lease_id}`)
    } catch (e) {
      handle(e, (errs) => {
        setErrors(errs)
        const first = STEPS.findIndex((_, i) => (i === 0 ? ['occupier_id', 'building_id', 'spaces', 'floor_id', 'area'] : STEPS[i].fields ?? []).some((k) => errs[k]))
        if (first >= 0) setStep(first)
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="New lease" subtitle="Four steps; floors are marked Leased when you save." right={<button className="btn" onClick={() => history.back()}>Cancel</button>} />
      <ol className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button onClick={() => setStep(i)} className={`w-full rounded-lg border px-3 py-2.5 text-left ${i === step ? 'border-royal bg-royal-soft' : 'border-line bg-white hover:border-royal'}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${i === step ? 'text-royal' : 'text-ink-muted'}`}>Step {i + 1}</span>
              <span className="block text-sm font-bold text-ink">{s.title}</span>
              {stepError(i) && <span className="text-[11px] font-semibold text-crit">Needs attention</span>}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-3.5 xl:grid-cols-[1fr_300px]">
        <Card title={STEPS[step].title} sub={STEPS[step].sub}>
          {step === 0 ? (
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <FieldInput f={field('occupier_id')} draft={draft} ctx={ctx} error={errors.occupier_id} onChange={(v) => set('occupier_id', v)} />
                  {api.permissions('occupier', session).create && (
                    <button className="mt-1 text-xs font-semibold text-royal hover:underline" onClick={() => setNewOccupier(true)}>+ New occupier</button>
                  )}
                </div>
                <FieldInput
                  f={{ ...field('building_id'), createOnly: false }}
                  draft={draft}
                  ctx={ctx}
                  error={errors.building_id}
                  onChange={(v) => {
                    set('building_id', v)
                    setSpaces([])
                  }}
                />
              </div>
              <div>
                <span className="label">Floors leased *</span>
                {!draft.building_id ? (
                  <p className="text-xs text-ink-muted">Choose a building to see its vacant floors.</p>
                ) : floors.length ? (
                  <div className="overflow-hidden rounded-md border border-line">
                    {floors.map((f) => {
                      const sel = spaces.find((x) => x.floor_id === f.floor_id)
                      return (
                        <label key={f.floor_id} className={`flex items-center gap-3 border-b border-line-light px-3 py-2 text-[13px] last:border-0 ${sel ? 'bg-royal-soft/50' : ''}`}>
                          <input type="checkbox" className="h-4 w-4 accent-royal" checked={!!sel} onChange={() => toggle(f.floor_id, f.chargeable_area)} />
                          <span className="w-28 font-semibold">Floor {f.floor_no}{f.wing ? ` · ${f.wing}` : ''}</span>
                          <span className="flex-1 text-xs text-ink-muted">{f.occupancy_type} · {(f.chargeable_area ?? 0).toLocaleString('en-IN')} sq ft{f.handover_condition ? ` · ${f.handover_condition}` : ''}</span>
                          {sel && (
                            <input
                              type="number"
                              className="input w-32 py-1 text-right"
                              value={sel.area}
                              onChange={(e) => setSpaces((s) => s.map((x) => (x.floor_id === f.floor_id ? { ...x, area: Number(e.target.value) } : x)))}
                              aria-label="Leased area"
                            />
                          )}
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-ink-muted">No vacant floors in this building.</p>
                )}
                {errors.spaces && <p className="mt-1 text-xs font-medium text-crit">{errors.spaces}</p>}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {(STEPS[step].fields ?? [])
                .map(field)
                .filter((f) => !f.showIf || f.showIf(draft))
                .map((f) => (
                  <div key={f.key} className={f.type === 'textarea' ? 'md:col-span-2' : ''}>
                    <FieldInput f={f} draft={draft} ctx={ctx} error={errors[f.key]} onChange={(v) => set(f.key, v)} />
                  </div>
                ))}
            </div>
          )}
          <div className="mt-5 flex justify-between border-t border-line pt-4">
            <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Next →</button>
            ) : (
              <button className="btn btn-gold" disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Create lease'}</button>
            )}
          </div>
        </Card>

        <Card title="Summary">
          <dl className="space-y-2 text-[13px]">
            <Row k="Occupier" v={ctx.occupiers.find((o) => o.occupier_id === draft.occupier_id)?.name ?? '—'} />
            <Row k="Building" v={ctx.buildings.find((b) => b.building_id === draft.building_id)?.name ?? '—'} />
            <Row k="Floors" v={spaces.length ? `${spaces.length}` : '—'} />
            <Row k="Area" v={area ? `${area.toLocaleString('en-IN')} sq ft` : '—'} />
            <Row k="Monthly rent" v={monthly ? `₹${Math.round(monthly).toLocaleString('en-IN')}` : '—'} />
            <Row k="Annual rent" v={monthly ? `₹${(Math.round(monthly * 12) / 1e7).toFixed(2)} Cr` : '—'} />
            <Row k="Deposit" v={estDeposit ? `₹${Math.round(estDeposit).toLocaleString('en-IN')}` : '—'} />
            <Row k="Term" v={draft.start && draft.expiry ? `${draft.start} → ${draft.expiry}` : '—'} />
          </dl>
        </Card>
      </div>
      {newOccupier && (
        <RecordDrawer
          entity="occupier"
          id={null}
          mode="create"
          session={session}
          ctx={ctx}
          linkTo={linkFor(session)}
          defaultOrgId={null}
          onClose={() => setNewOccupier(false)}
          onMode={(_m, id) => {
            set('occupier_id', id)
            setNewOccupier(false)
          }}
        />
      )}
      {dialog}
    </>
  )
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-ink-muted">{k}</dt>
    <dd className="text-right font-semibold text-ink">{v}</dd>
  </div>
)
