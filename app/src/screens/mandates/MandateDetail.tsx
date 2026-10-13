import { useEffect, useState } from 'react'
import type { Session } from '../../access/session'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { Mandate, PricingInputs, Swot } from '../../domain/mandates'
import { EXEC_MODES } from '../../entities/mandates'
import type { OptionCtx } from '../../entities/types'
import { daysFromToday, fmtDate } from '../../lib/dates'
import { linkFor } from '../../lib/links'
import { PRICING_FIELDS, priceModel } from '../../lib/pricing'
import { href } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import EntityPage from '../../components/crud/EntityPage'
import { useErrorHandler } from '../../components/crud/RecordDrawer'
import Badge, { StatusBadge } from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import KpiCard from '../../components/ui/KpiCard'
import { useToast } from '../../components/ui/Toast'

const AA = (s: Session) => s.role === 'AA' || s.role === 'Super Admin'

export default function MandateDetail({ id, rest }: { id: string; rest: string[] }) {
  const session = useAuthed()
  const { data, error } = useApi(async () => {
    const [m, ctx] = await Promise.all([api.get('mandate', id, session), api.getOptionCtx(session)])
    return { m: m as Mandate, ctx }
  }, [id, session.user.user_id])
  const [tabKey, ...more] = rest
  if (error) return <p className="rounded-lg border border-crit/30 bg-crit-bg px-4 py-3 text-sm text-crit">{error.message}</p>
  if (!data) return null
  const { m, ctx } = data
  const name = ctx.directory.find((b) => b.building_id === m.building_id)?.name ?? ctx.buildings.find((b) => b.building_id === m.building_id)?.name ?? 'Building'
  const tabs = AA(session)
    ? [
        { key: 'swot', label: 'SWOT' },
        { key: 'pricing', label: `Pricing model${m.pricing_model?.versions.length ? ` · v${m.pricing_model.versions.length}` : ''}` },
        { key: 'targets', label: 'Target occupiers' },
      ]
    : []
  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0]
  const vendor = ctx.vendors.find((v) => v.vendor_id === m.vendor_id)
  const days = daysFromToday(m.expiry)

  return (
    <>
      <div className="mb-1 text-xs text-ink-muted">
        <a href={href('mandates')} className="font-semibold text-royal hover:underline">Mandates</a> / <a href={href(`buildings/${m.building_id}`)} className="hover:underline">{name}</a>
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-royal">Mandate — {name}</h1>
          <p className="mt-0.5 text-[13px] text-ink-soft">{m.mandate_id} · {fmtDate(m.start)} → {fmtDate(m.expiry)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge status={m.status} />
            <Badge tone="royal">{m.exec_mode}</Badge>
            {vendor && <Badge tone="gold">{vendor.name}</Badge>}
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Status" value={m.status} hint={m.status === 'Active' ? `${days} days to expiry` : 'AA cannot act on this building'} />
        <KpiCard label="AA access" value={m.status !== 'Active' || m.exec_mode === 'Internal (owner team)' ? 'None' : m.exec_mode === 'External agency' ? 'Read-only' : 'Full'} hint="Driven by status + execution mode" />
        <KpiCard label="Threshold NOI" value={'threshold_noi' in m && m.threshold_noi != null ? `₹${m.threshold_noi}` : '—'} unit={'threshold_noi' in m && m.threshold_noi != null ? '/sq ft/mo' : ''} hint="No success fee below this rent" />
        <KpiCard label="Latest pricing" value={m.pricing_model?.versions.length ? `₹${m.pricing_model.versions.at(-1)!.output.low}–${m.pricing_model.versions.at(-1)!.output.high}` : AA(session) ? '—' : 'AA only'} hint={m.pricing_model?.versions.length ? `v${m.pricing_model.versions.length} · effective ₹${m.pricing_model.versions.at(-1)!.output.effective}` : undefined} />
      </div>

      <OwnerTerms session={session} m={m} ctx={ctx} />

      {tabs.length > 0 && tab && (
        <>
          <nav className="mb-4 mt-5 flex gap-0.5 overflow-x-auto border-b border-line">
            {tabs.map((t) => (
              <a key={t.key} href={href(`mandates/${id}/${t.key}`)} className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] font-semibold ${t.key === tab.key ? 'border-gold text-royal' : 'border-transparent text-ink-soft hover:text-royal'}`}>{t.label}</a>
            ))}
            <span className="ml-auto self-center pr-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted">AA team only</span>
          </nav>
          {tab.key === 'swot' && <SwotEditor session={session} m={m} />}
          {tab.key === 'pricing' && <PricingModel session={session} m={m} />}
          {tab.key === 'targets' && <Targets session={session} m={m} rest={more} />}
        </>
      )}
      {!AA(session) && (
        <p className="mt-5 rounded-md bg-royal-soft px-4 py-3 text-xs text-royal">SWOT, the pricing model, the assessment scorecard and target-occupier lists are AA-only (§7.1) and are not included in what you receive.</p>
      )}
    </>
  )
}

/** E5-S02 + E2-S02: the owner chooses who executes leasing and sets the threshold NOI. */
function OwnerTerms({ session, m, ctx }: { session: Session; m: Mandate; ctx: OptionCtx }) {
  const toast = useToast()
  const { handle, dialog } = useErrorHandler(session)
  const canEdit = !session.readOnly && (AA(session) || (session.role === 'Owner/Developer' && m.org_id === session.org.org_id))
  const [t, setT] = useState({ exec_mode: m.exec_mode as string, vendor_id: m.vendor_id, threshold_noi: m.threshold_noi })
  useEffect(() => setT({ exec_mode: m.exec_mode, vendor_id: m.vendor_id, threshold_noi: m.threshold_noi }), [m])
  const dirty = t.exec_mode !== m.exec_mode || t.vendor_id !== m.vendor_id || t.threshold_noi !== m.threshold_noi
  const needsVendor = t.exec_mode === 'External agency' || t.exec_mode === 'Hybrid'
  return (
    <Card title="Leasing execution & threshold" sub="Set by the owner (E5-S02, E2-S02). Changing the execution mode immediately changes what AA can see and do.">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="t-mode">Leasing executed by</label>
          <select id="t-mode" className="input" disabled={!canEdit} value={t.exec_mode} onChange={(e) => setT({ ...t, exec_mode: e.target.value })}>
            {EXEC_MODES.map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        {needsVendor && (
          <div>
            <label className="label" htmlFor="t-vendor">Vendor / agency</label>
            <select id="t-vendor" className="input" disabled={!canEdit} value={t.vendor_id ?? ''} onChange={(e) => setT({ ...t, vendor_id: e.target.value || null })}>
              <option value="">Select…</option>
              {ctx.vendors.map((v) => <option key={v.vendor_id} value={v.vendor_id}>{v.name} · {v.type}</option>)}
            </select>
          </div>
        )}
        {'threshold_noi' in m && (
          <div>
            <label className="label" htmlFor="t-noi">Threshold NOI (₹/sq ft/mo)</label>
            <input id="t-noi" type="number" min={0} className="input" disabled={!canEdit} value={t.threshold_noi ?? ''} onChange={(e) => setT({ ...t, threshold_noi: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
        )}
      </div>
      {canEdit && dirty && (
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={() => setT({ exec_mode: m.exec_mode, vendor_id: m.vendor_id, threshold_noi: m.threshold_noi })}>Discard</button>
          <button
            className="btn btn-gold"
            onClick={async () => {
              try {
                await api.setOwnerTerms(m.mandate_id, t, session)
                toast('ok', 'Mandate terms updated.')
              } catch (e) {
                handle(e)
              }
            }}
          >
            Save terms
          </button>
        </div>
      )}
      {dialog}
    </Card>
  )
}

const QUADS: { key: keyof Swot; label: string; tone: string }[] = [
  { key: 'strengths', label: 'Strengths', tone: 'border-t-ok' },
  { key: 'weaknesses', label: 'Weaknesses', tone: 'border-t-crit' },
  { key: 'opportunities', label: 'Opportunities', tone: 'border-t-royal' },
  { key: 'threats', label: 'Threats', tone: 'border-t-warn' },
]

/** E5-S04 / E1-S07: four structured lists, pre-populated from PT data and edited by AA. */
function SwotEditor({ session, m }: { session: Session; m: Mandate }) {
  const toast = useToast()
  const { handle, dialog } = useErrorHandler(session)
  const [swot, setSwot] = useState<Swot>(m.swot)
  useEffect(() => setSwot(m.swot), [m])
  const dirty = JSON.stringify(swot) !== JSON.stringify(m.swot)
  const set = (k: keyof Swot, i: number, v: string) => setSwot((s) => ({ ...s, [k]: s[k].map((x, j) => (j === i ? v : x)) }))
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">Generate a draft from building, leasing, comparables and certification data, then edit.</p>
        <div className="flex gap-2">
          <button
            className="btn"
            onClick={async () => {
              try {
                const g = await api.generateSwot(m.mandate_id, session)
                setSwot((s) => ({
                  strengths: [...new Set([...s.strengths, ...g.strengths])],
                  weaknesses: [...new Set([...s.weaknesses, ...g.weaknesses])],
                  opportunities: [...new Set([...s.opportunities, ...g.opportunities])],
                  threats: [...new Set([...s.threats, ...g.threats])],
                }))
                toast('info', 'Suggestions added from PT data — review and save.')
              } catch (e) {
                handle(e)
              }
            }}
          >
            Generate from PT data
          </button>
          <button
            className="btn btn-gold"
            disabled={!dirty}
            onClick={async () => {
              try {
                await api.saveSwot(m.mandate_id, swot, session)
                toast('ok', 'SWOT saved to the mandate.')
              } catch (e) {
                handle(e)
              }
            }}
          >
            Save SWOT
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {QUADS.map((q) => (
          <section key={q.key} className={`rounded-lg border border-t-[3px] border-line bg-white p-4 ${q.tone}`}>
            <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-royal">{q.label}</h4>
            <ul className="space-y-1.5">
              {swot[q.key].map((x, i) => (
                <li key={i} className="flex gap-1.5">
                  <input className="input py-1 text-[13px]" value={x} onChange={(e) => set(q.key, i, e.target.value)} />
                  <button className="btn px-2" aria-label="Remove" onClick={() => setSwot((s) => ({ ...s, [q.key]: s[q.key].filter((_, j) => j !== i) }))}>✕</button>
                </li>
              ))}
            </ul>
            <button className="mt-2 text-xs font-semibold text-royal hover:underline" onClick={() => setSwot((s) => ({ ...s, [q.key]: [...s[q.key], ''] }))}>+ Add point</button>
          </section>
        ))}
      </div>
      {dialog}
    </>
  )
}

/** E5-S06: 12 inputs → recommended rent range; every save is a new version. */
function PricingModel({ session, m }: { session: Session; m: Mandate }) {
  const toast = useToast()
  const { handle, dialog } = useErrorHandler(session)
  const { data: defaults } = useApi(() => api.pricingDefaults(m.mandate_id, session), [m.mandate_id, m.pricing_model?.versions.length])
  const [inputs, setInputs] = useState<PricingInputs | null>(null)
  const [note, setNote] = useState('')
  useEffect(() => setInputs(defaults ?? null), [defaults])
  if (!inputs) return null
  const out = priceModel(inputs)
  const versions = [...(m.pricing_model?.versions ?? [])].reverse()
  return (
    <div className="grid gap-3.5 xl:grid-cols-[1.4fr_1fr]">
      <Card title="Pricing inputs" sub="Market benchmark → adjustments → incentives → effective rent">
        <div className="grid gap-3 sm:grid-cols-2">
          {PRICING_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="label">{f.label} <span className="font-medium normal-case tracking-normal text-ink-muted">({f.unit})</span></span>
              <input type="number" className="input" value={inputs[f.key]} onChange={(e) => setInputs({ ...inputs, [f.key]: Number(e.target.value) })} />
              <span className="mt-0.5 block text-[11px] text-ink-muted">{f.help}</span>
            </label>
          ))}
        </div>
      </Card>
      <div className="space-y-3.5">
        <Card title="Model output">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Recommended headline rent</div>
          <div className="text-3xl font-extrabold text-royal">₹{out.low}–{out.high}<span className="ml-1 text-xs font-medium text-ink-muted">/sq ft/mo</span></div>
          <div className="mt-2 text-sm">Net effective rent (after rent-free and TI) <b>₹{out.effective}</b></div>
          <div className="text-sm text-ink-soft">Average over the term with escalation <b>₹{out.term_average}</b></div>
          <div className="mt-2">{out.above_threshold ? <Badge tone="ok">Above threshold NOI ₹{inputs.threshold_noi}</Badge> : <Badge tone="crit">Below threshold NOI ₹{inputs.threshold_noi}</Badge>}</div>
          <input className="input mt-4" placeholder="Note for this version (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button
            className="btn btn-gold mt-2 w-full"
            onClick={async () => {
              try {
                const v = await api.savePricingVersion(m.mandate_id, inputs, note || null, session)
                setNote('')
                toast('ok', `Saved as version ${v.version}.`)
              } catch (e) {
                handle(e)
              }
            }}
          >
            Save as version {(m.pricing_model?.versions.length ?? 0) + 1}
          </button>
        </Card>
        <Card title="Version history">
          {versions.length ? (
            <ul className="divide-y divide-line-light text-[13px]">
              {versions.map((v) => (
                <li key={v.version} className="flex items-start justify-between gap-2 py-2">
                  <span>
                    <b>v{v.version}</b> · ₹{v.output.low}–{v.output.high} <span className="text-ink-muted">(eff. ₹{v.output.effective})</span>
                    {v.note && <span className="block text-[11px] text-ink-muted">{v.note}</span>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-ink-muted">
                    {fmtDate(v.created_at)}
                    <button className="font-semibold text-royal hover:underline" onClick={() => setInputs(v.inputs)}>Load inputs</button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-muted">No versions yet.</p>
          )}
        </Card>
      </div>
      {dialog}
    </div>
  )
}

/** E5-S05 suggestions (accept / reject) and the E5-S08 target list. */
function Targets({ session, m, rest }: { session: Session; m: Mandate; rest: string[] }) {
  const toast = useToast()
  const { handle, dialog } = useErrorHandler(session)
  const { data: sugg } = useApi(() => api.suggestTargets(m.mandate_id, session), [m.mandate_id])
  const decide = (occupierId: string, accept: boolean) => async () => {
    try {
      await api.decideSuggestion(m.mandate_id, occupierId, accept, session)
      toast('ok', accept ? 'Added to the target list.' : 'Suggestion rejected — it will not be shown again.')
    } catch (e) {
      handle(e)
    }
  }
  return (
    <div className="space-y-4">
      <Card title="Suggested targets" sub="Market-fit signals: expiring leases elsewhere, broker-registered requirements, GCC demand, sector clusters, relationship notes. Stands in for live RFP feeds.">
        {sugg?.length ? (
          <ul className="divide-y divide-line-light">
            {sugg.map((x) => (
              <li key={x.occupier_id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="text-[13px] font-bold text-ink">{x.name}</span> <span className="text-[11px] text-ink-muted">· {x.sector} · fit {x.score}</span>
                  <span className="block text-[11px] text-ink-soft">{x.reasons.join(' · ')}</span>
                </span>
                {!session.readOnly && (
                  <span className="flex gap-1.5">
                    <button className="btn py-1 text-[11px]" onClick={decide(x.occupier_id, false)}>Reject</button>
                    <button className="btn btn-primary py-1 text-[11px]" onClick={decide(x.occupier_id, true)}>Accept</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-muted">No new suggestions right now.</p>
        )}
      </Card>
      <EntityPage
        entity="targetOccupier"
        basePath={`mandates/${m.mandate_id}/targets`}
        rest={rest}
        linkTo={linkFor(session)}
        embedded
        where={{ building_id: m.building_id }}
        newLabel="Add target"
      />
      {dialog}
    </div>
  )
}
