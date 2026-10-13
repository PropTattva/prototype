import { useMemo, useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { BuildingDocument, Certification } from '../../domain/assets'
import type { Lease } from '../../domain/leasing'
import { REMINDER_LEADS } from '../../entities/assets'
import { buildingName, occupierName } from '../../entities/helpers'
import { daysFromToday, fmtDate } from '../../lib/dates'
import { href } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import Badge, { type Tone } from '../../components/ui/Badge'
import PageHeader from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/Toast'

const leadDays = (lead: string) => {
  const [n, unit] = lead.split(' ')
  return unit.startsWith('day') ? Number(n) : Number(n) * 30
}

interface Item {
  key: string
  kind: 'Statutory' | 'Certification' | 'Lease expiry' | 'Break option'
  title: string
  sub: string
  date: string
  lead: string
  doc?: BuildingDocument
  link: string
}

const TONE: Record<Item['kind'], Tone> = { Statutory: 'crit', Certification: 'ok', 'Lease expiry': 'gold', 'Break option': 'warn' }

/** v6 Reminders: every upcoming expiry, with the owner choosing how early to be reminded. */
export default function Reminders() {
  const session = useAuthed()
  const toast = useToast()
  const [horizon, setHorizon] = useState(365)
  const canDocs = api.permissions('document', session).read
  const canLeases = api.permissions('lease', session).read
  const { data } = useApi(async () => {
    const [docs, certs, leases, ctx] = await Promise.all([
      canDocs ? api.list('document', session) : [],
      api.list('certification', session),
      canLeases ? api.list('lease', session) : [],
      api.getOptionCtx(session),
    ])
    return { docs: docs as BuildingDocument[], certs: certs as Certification[], leases: leases as Lease[], ctx }
  }, [session.user.user_id])

  const items = useMemo(() => {
    if (!data) return []
    const { docs, certs, leases, ctx } = data
    const out: Item[] = []
    for (const d of docs.filter((x) => x.validity)) out.push({ key: d.doc_id, kind: 'Statutory', title: `${d.type} — ${buildingName(ctx, d.building_id)}`, sub: d.file_ref ?? '', date: d.validity!, lead: d.reminder_lead, doc: d, link: href(`vault/${encodeURIComponent(d.type)}/${d.doc_id}`) })
    for (const c of certs.filter((x) => x.validity)) out.push({ key: c.cert_id, kind: 'Certification', title: `${c.scheme} ${c.level ?? ''} — ${buildingName(ctx, c.building_id)}`, sub: 'Green certification renewal', date: c.validity!, lead: '6 months', link: href(`buildings/${c.building_id}/certifications/${c.cert_id}`) })
    for (const l of leases.filter((x) => x.status === 'Active')) {
      out.push({ key: `${l.lease_id}-exp`, kind: 'Lease expiry', title: `${occupierName(ctx, l.occupier_id)} lease — ${buildingName(ctx, l.building_id)}`, sub: 'Alert at 12 months, then monthly (E3-S03)', date: l.expiry, lead: '12 months', link: href(`leases/${l.lease_id}`) })
      if (l.break_date) out.push({ key: `${l.lease_id}-brk`, kind: 'Break option', title: `${occupierName(ctx, l.occupier_id)} break option — ${buildingName(ctx, l.building_id)}`, sub: 'Early-exit window (E3-S02)', date: l.break_date, lead: '6 months', link: href(`leases/${l.lease_id}`) })
    }
    return out.filter((i) => daysFromToday(i.date) <= horizon).sort((a, b) => a.date.localeCompare(b.date))
  }, [data, horizon])

  if (!data) return null
  const firing = items.filter((i) => daysFromToday(i.date) <= leadDays(i.lead))
  const canEdit = api.permissions('document', session).update

  return (
    <>
      <PageHeader
        title="Reminders"
        subtitle="You choose the timing for statutory documents · lease alerts follow the 12-month rule"
        right={
          <select className="input w-auto" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} aria-label="Horizon">
            <option value={90}>Next 3 months</option>
            <option value={180}>Next 6 months</option>
            <option value={365}>Next 12 months</option>
            <option value={730}>Next 24 months</option>
          </select>
        }
      />
      <p className="mb-3 text-xs text-ink-muted">{items.length} upcoming · <b className="text-ink">{firing.length} reminders active now</b> (inside their reminder window){items.some((i) => daysFromToday(i.date) < 0) ? ' · includes overdue items' : ''}</p>
      <div className="space-y-2.5">
        {items.slice(0, 80).map((i) => {
          const days = daysFromToday(i.date)
          const live = days <= leadDays(i.lead)
          return (
            <div key={i.key} className={`rounded-md border bg-white p-3.5 ${days < 0 ? 'border-crit/40' : live ? 'border-gold' : 'border-line'}`}>
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <a href={i.link} className="text-[13px] font-bold text-ink hover:text-royal">{i.title}</a>
                  <div className="text-[11px] text-ink-muted">
                    {days < 0 ? <b className="text-crit">Expired {-days} days ago</b> : `Expires ${fmtDate(i.date)} · in ${days} days`}
                    {i.sub && ` · ${i.sub}`}
                  </div>
                </div>
                <Badge tone={TONE[i.kind]}>{i.kind}</Badge>
              </div>
              {i.doc ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[10px] font-bold uppercase text-ink-muted">Remind me:</span>
                  {REMINDER_LEADS.map((t) => (
                    <button
                      key={t}
                      disabled={!canEdit}
                      onClick={async () => {
                        try {
                          await api.update('document', i.doc!.doc_id, { reminder_lead: t }, session)
                          toast('ok', `Reminder set to ${t} before expiry.`)
                        } catch (e) {
                          toast('error', (e as Error).message)
                        }
                      }}
                      className={`btn px-2 py-0.5 text-[11px] ${t === i.lead ? 'btn-primary' : ''}`}
                    >
                      {t}{t === i.lead ? ' ✓' : ''}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-ink-muted">Reminder {i.lead} before{i.kind === 'Lease expiry' ? ', then monthly' : ''}</div>
              )}
            </div>
          )
        })}
        {!items.length && <p className="rounded-lg border border-line bg-white px-4 py-10 text-center text-sm text-ink-muted">Nothing due in this window.</p>}
      </div>
    </>
  )
}
