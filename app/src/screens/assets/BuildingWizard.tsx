import { useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import { entityDef } from '../../entities/registry'
import type { Rec } from '../../entities/types'
import { geocode, isValidPincode } from '../../lib/geo'
import { navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import { FieldInput } from '../../components/crud/fields'
import { useErrorHandler } from '../../components/crud/RecordDrawer'
import Card from '../../components/ui/Card'
import PageHeader from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/Toast'

const STEPS = [
  { title: 'Identity', sub: 'Name, address, PIN code and micro-market (E1-S01)', fields: ['name', 'owner_id', 'campus_id', 'address', 'pincode', 'city', 'micro_market', 'lat', 'long'] },
  { title: 'Ownership', sub: 'Sole, multi-owner (JV/SPV) or strata (E1-S12, S18)', fields: ['ownership_type', 'multi_owner_struct', 'mandate_threshold_pct'] },
  { title: 'Status', sub: 'Operational or pre-OC, size and publishing (grade comes from the calculator or AA scorecard)', fields: ['status', 'handover_condition', 'expected_completion', 'total_area', 'published'] },
]

/** Three-step building registration. Validation runs on the server (api) at the end; errors jump back to their step. */
export default function BuildingWizard() {
  const session = useAuthed()
  const toast = useToast()
  const def = entityDef('building')
  const { data: ctx } = useApi(() => api.getOptionCtx(session), [session.user.user_id])
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Rec | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const { dialog, handle } = useErrorHandler(session)

  if (!ctx) return null
  const d = draft ?? def.defaults!({ ...ctx, orgId: session.org.org_id })
  const set = (k: string, v: unknown) => setDraft({ ...d, [k]: v })
  const fields = def.fields.filter((f) => STEPS[step].fields.includes(f.key) && (!f.showIf || f.showIf(d)))
  const geo = isValidPincode(d.pincode ?? '') ? geocode(d.pincode) : null

  const submit = async () => {
    setSaving(true)
    try {
      const b = await api.create('building', d, session)
      toast('ok', `${b.name} registered. Add its floors next.`)
      navigate(`buildings/${b.building_id}/floors`)
    } catch (e) {
      handle(e, (errs) => {
        setErrors(errs)
        const first = STEPS.findIndex((s) => s.fields.some((k) => errs[k]))
        if (first >= 0) setStep(first)
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Register a building" subtitle="Three steps. Everything can be edited later." right={<button className="btn" onClick={() => navigate('buildings')}>Cancel</button>} />
      <ol className="mb-4 grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button
              onClick={() => setStep(i)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left ${i === step ? 'border-royal bg-royal-soft' : 'border-line bg-white hover:border-royal'}`}
            >
              <span className={`text-[10px] font-bold uppercase tracking-wider ${i === step ? 'text-royal' : 'text-ink-muted'}`}>Step {i + 1}</span>
              <span className="block text-sm font-bold text-ink">{s.title}</span>
              {STEPS[i].fields.some((k) => errors[k]) && <span className="text-[11px] font-semibold text-crit">Needs attention</span>}
            </button>
          </li>
        ))}
      </ol>
      <Card title={STEPS[step].title} sub={STEPS[step].sub}>
        <div className="grid gap-4 md:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className={['address', 'multi_owner_struct'].includes(f.key) ? 'md:col-span-2' : ''}>
              <FieldInput f={f} draft={d} ctx={ctx} error={errors[f.key]} onChange={(v) => set(f.key, v)} />
            </div>
          ))}
        </div>
        {step === 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-canvas px-3 py-2 text-xs text-ink-soft">
            {geo ? (
              <>
                <span>PIN {d.pincode} geocodes to <strong className="font-mono text-ink">{geo.lat}, {geo.long}</strong></span>
                <button type="button" className="btn" onClick={() => setDraft({ ...d, ...geo })}>Use these coordinates</button>
              </>
            ) : (
              <span>Enter a valid 6-digit PIN code to geocode the building (coordinates fill automatically if left blank).</span>
            )}
          </div>
        )}
        <div className="mt-5 flex justify-between border-t border-line pt-4">
          <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Next →</button>
          ) : (
            <button className="btn btn-gold" disabled={saving} onClick={submit}>{saving ? 'Registering…' : 'Register building'}</button>
          )}
        </div>
      </Card>
      {dialog}
    </>
  )
}
