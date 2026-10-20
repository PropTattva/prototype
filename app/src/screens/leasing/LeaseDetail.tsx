import { useState, type ReactNode } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { Lease } from '../../domain/leasing'
import { entityDef } from '../../entities/registry'
import type { EntityKey } from '../../entities/types'
import { daysFromToday, fmtDate } from '../../lib/dates'
import { linkFor } from '../../lib/links'
import { href, navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import EntityPage from '../../components/crud/EntityPage'
import { FieldValue } from '../../components/crud/fields'
import RecordDrawer from '../../components/crud/RecordDrawer'
import Badge, { StatusBadge } from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import KpiCard from '../../components/ui/KpiCard'
import CaptureDrawer from '../../components/rentroll/CaptureDrawer'
import LeaseRentRoll from '../../components/rentroll/LeaseRentRoll'

const TABS: { key: string; label: string; entity: EntityKey }[] = [
  { key: 'spaces', label: 'Spaces', entity: 'leaseSpace' },
  { key: 'renewal', label: 'Renewal', entity: 'renewal' },
  { key: 'abstract', label: 'Deed & abstract', entity: 'leaseDoc' },
  { key: 'invoices', label: 'Invoices', entity: 'rent' },
  { key: 'relationship', label: 'Relationship log', entity: 'relationshipLog' },
  { key: 'parking', label: 'Parking', entity: 'bay' },
]

const GROUPS = [
  { title: 'Commercials', keys: ['rent', 'CAM', 'escalation_pct', 'escalation_freq', 'rent_free_months', 'rent_free_conditions', 'TI_contribution'] },
  { title: 'Deposit & parking', keys: ['deposit_months', 'deposit', 'deposit_form', 'deposit_received', 'received_date', 'parking_slots'] },
  { title: 'Term', keys: ['start', 'expiry', 'break_date', 'source_tag', 'status'] },
]

/** One lease: key terms, alerts and every related record (spaces, renewal, abstract, invoices, relationship log). */
export default function LeaseDetail({ id, rest }: { id: string; rest: string[] }) {
  const session = useAuthed()
  const { data: l, error } = useApi(() => api.get('lease', id, session), [id, session.user.user_id])
  const { data: ctx } = useApi(() => api.getOptionCtx(session), [session.user.user_id])
  const [tabKey = 'spaces', ...more] = rest
  const [capturing, setCapturing] = useState(false)
  if (error) return <p className="rounded-lg border border-crit/30 bg-crit-bg px-4 py-3 text-sm text-crit">{error.message}</p>
  if (!l || !ctx) return null
  const lease = l as Lease
  const def = entityDef('lease')
  const tabs = TABS.filter((t) => api.permissions(t.entity, session).read)
  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0]
  const editing = tabKey === 'edit'
  const occ = ctx.occupiers.find((o) => o.occupier_id === lease.occupier_id)
  const toExpiry = daysFromToday(lease.expiry)
  const toBreak = lease.break_date ? daysFromToday(lease.break_date) : null
  const annual = lease.rent != null ? lease.rent * lease.area * 12 : null

  const alerts: ReactNode[] = []
  if (lease.status === 'Active' && toExpiry <= 365) alerts.push(<span key="e">Expires in <b>{toExpiry} days</b> ({fmtDate(lease.expiry)}) — renewal window open (E3-S03).</span>)
  if (lease.status === 'Active' && toBreak != null && toBreak >= 0 && toBreak <= 180) alerts.push(<span key="b">Tenant break option in <b>{toBreak} days</b> ({fmtDate(lease.break_date)}).</span>)
  if ('deposit_received' in lease && !lease.deposit_received && lease.status === 'Active') alerts.push(<span key="d">Security deposit not yet received.</span>)

  // rent is null (not stripped) when the lease came in without commercials
  const pendingCapture = 'rent' in lease && lease.rent == null

  return (
    <>
      <div className="mb-1 text-xs text-ink-muted">
        <a href={href('leases')} className="font-semibold text-royal hover:underline">Leases</a> / <a href={href(`buildings/${lease.building_id}`)} className="hover:underline">{ctx.buildings.find((b) => b.building_id === lease.building_id)?.name}</a>
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-royal">{occ?.name ?? 'Lease'}</h1>
          <p className="mt-0.5 text-[13px] text-ink-soft">{[occ?.sector_tag, occ?.is_gcc && 'GCC', occ?.parent_company].filter(Boolean).join(' · ')} · {lease.lease_id}</p>
          <div className="mt-2 flex gap-1.5">
            <StatusBadge status={lease.status} />
            <Badge tone="muted">{lease.source_tag}</Badge>
          </div>
        </div>
        {api.permissions('lease', session).update && <button className="btn btn-primary" onClick={() => navigate(`leases/${id}/edit`)}>Edit lease</button>}
      </div>

      {pendingCapture && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/40 bg-warn-bg px-4 py-2.5 text-[13px] text-[#6b4a00]">
          <span><strong>Commercials not captured yet.</strong> Rent, CAM and escalation are missing, so this lease is left out of the rent roll.</span>
          {api.permissions('lease', session).update && <button className="btn btn-gold" onClick={() => setCapturing(true)}>Capture commercials →</button>}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="mb-4 space-y-1 rounded-lg border-l-[3px] border-warn bg-warn-bg px-4 py-2.5 text-[13px] text-[#6b4a00]">
          {alerts.map((a, i) => <div key={i}>{a}</div>)}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Leased area" value={lease.area.toLocaleString('en-IN')} unit="sq ft" />
        <KpiCard label="Rent" value={lease.rent != null ? `₹${lease.rent}` : pendingCapture ? 'Pending' : '—'} unit={lease.rent != null ? '/sq ft/mo' : ''} hint={lease.CAM != null ? `+ CAM ₹${lease.CAM}` : pendingCapture ? 'Not captured yet' : undefined} />
        <KpiCard label="Annual rent" value={annual != null ? `₹${(annual / 1e7).toFixed(2)}` : pendingCapture ? 'Pending' : '—'} unit={annual != null ? 'Cr' : ''} hint={pendingCapture ? 'Needs rent to calculate' : undefined} />
        <KpiCard label="Expiry" value={fmtDate(lease.expiry)} hint={lease.status === 'Active' ? `${(toExpiry / 365).toFixed(1)} years remaining` : lease.status} />
      </div>

      <div className="mb-4 grid gap-3.5 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <Card key={g.title} title={g.title}>
            <dl className="space-y-2.5">
              {g.keys
                .map((k) => def.fields.find((f) => f.key === k)!)
                .filter((f) => !f.showIf || f.showIf(lease))
                .map((f) => (
                  <div key={f.key} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <dt className="shrink-0 text-ink-muted">{f.label}</dt>
                    <dd className="text-right font-medium text-ink"><FieldValue f={f} rec={lease} ctx={ctx} /></dd>
                  </div>
                ))}
            </dl>
          </Card>
        ))}
      </div>

      <LeaseRentRoll lease={lease} onCapture={api.permissions('lease', session).update ? () => setCapturing(true) : undefined} />
      {capturing && <CaptureDrawer lease={lease} ctx={ctx} session={session} onClose={() => setCapturing(false)} />}

      <nav className="mb-4 flex gap-0.5 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <a key={t.key} href={href(`leases/${id}/${t.key}`)} className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] font-semibold ${t.key === tab?.key && !editing ? 'border-gold text-royal' : 'border-transparent text-ink-soft hover:text-royal'}`}>
            {t.label}
          </a>
        ))}
      </nav>
      {tab?.key === 'parking' && (
        <p className="mb-3 text-xs text-ink-soft">
          Entitled to <b>{lease.parking_slots ?? 0}</b> slots. Allocate specific bays from the{' '}
          <a href={href(`buildings/${lease.building_id}/parking`)} className="font-semibold text-royal hover:underline">building’s bay map</a> (E6-S05).
        </p>
      )}
      {tab && <EntityPage key={tab.key} entity={tab.entity} basePath={`leases/${id}/${tab.key}`} rest={editing ? [] : more} linkTo={linkFor(session)} embedded where={{ lease_id: id }} hideColumns={tab.key === 'parking' ? ['building_id'] : []} />}
      {editing && (
        <RecordDrawer entity="lease" id={id} mode="edit" session={session} ctx={ctx} linkTo={linkFor(session)} defaultOrgId={null} onClose={() => navigate(`leases/${id}`)} onMode={() => navigate(`leases/${id}`)} />
      )}
    </>
  )
}
