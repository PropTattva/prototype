import { useMemo, useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { AuditEntry, Organisation } from '../../domain/platform'
import { useAuthed } from '../../state/SessionContext'
import Badge, { type Tone } from '../../components/ui/Badge'
import Drawer from '../../components/ui/Drawer'
import PageHeader from '../../components/ui/PageHeader'

const ACTIONS: AuditEntry['action'][] = ['Create', 'Update', 'Delete', 'Read', 'Login', 'Export']
const TONE: Record<AuditEntry['action'], Tone> = { Create: 'ok', Update: 'royal', Delete: 'crit', Read: 'gold', Login: 'muted', Export: 'warn' }
const fmt = (v: string) => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const show = (v: unknown) => (v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** EP-C-S02: immutable audit trail, filterable by org, user, entity, action and date. */
export default function AuditLog() {
  const session = useAuthed()
  const { data } = useApi(async () => {
    const [entries, actors] = await Promise.all([api.listAudit(session), api.auditActors(session)])
    const orgs = session.role === 'Super Admin' ? ((await api.list('organisation', session)) as Organisation[]) : []
    return { entries, actors, orgs }
  }, [session.user.user_id])
  const [f, setF] = useState({ org: '', user: '', entity: '', action: '', from: '', to: '' })
  const [open, setOpen] = useState<AuditEntry | null>(null)

  const rows = useMemo(() => {
    if (!data) return []
    return data.entries.filter(
      (e) =>
        (!f.org || e.org_id === f.org) &&
        (!f.user || e.user_id === f.user) &&
        (!f.entity || e.entity === f.entity) &&
        (!f.action || e.action === f.action) &&
        (!f.from || e.timestamp.slice(0, 10) >= f.from) &&
        (!f.to || e.timestamp.slice(0, 10) <= f.to),
    )
  }, [data, f])
  if (!data) return null
  const name = (id: string | null) => (id ? data.actors[id] ?? id : '—')
  const orgName = (id: string | null) => data.orgs.find((o) => o.org_id === id)?.name ?? id ?? '—'
  const entities = [...new Set(data.entries.map((e) => e.entity))].sort()
  const actors = [...new Set(data.entries.map((e) => e.user_id))]
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle={session.role === 'Super Admin' ? 'Every create, update, delete, login, export and View-as across all tenants. Entries cannot be edited.' : 'Actions taken by the PropTattva team (AA scope).'}
      />
      <div className="mb-3 flex flex-wrap gap-2 rounded-lg border border-line bg-white p-3">
        {session.role === 'Super Admin' && (
          <select className="input w-auto" aria-label="Organisation" value={f.org} onChange={set('org')}>
            <option value="">All orgs</option>
            {data.orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
          </select>
        )}
        <select className="input w-auto" aria-label="User" value={f.user} onChange={set('user')}>
          <option value="">All users</option>
          {actors.map((u) => <option key={u} value={u}>{name(u)}</option>)}
        </select>
        <select className="input w-auto" aria-label="Entity" value={f.entity} onChange={set('entity')}>
          <option value="">All entities</option>
          {entities.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select className="input w-auto" aria-label="Action" value={f.action} onChange={set('action')}>
          <option value="">All actions</option>
          {ACTIONS.map((x) => <option key={x}>{x}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">From <input type="date" className="input w-auto" value={f.from} onChange={set('from')} /></label>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">To <input type="date" className="input w-auto" value={f.to} onChange={set('to')} /></label>
        {Object.values(f).some(Boolean) && (
          <button className="btn" onClick={() => setF({ org: '', user: '', entity: '', action: '', from: '', to: '' })}>Clear</button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              <th className="px-4 py-2.5">When</th>
              <th className="px-3 py-2.5">Actor</th>
              <th className="px-3 py-2.5">Action</th>
              <th className="px-3 py-2.5">Record</th>
              {session.role === 'Super Admin' && <th className="px-4 py-2.5">Org</th>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((e) => (
              <tr key={e.audit_id} onClick={() => setOpen(e)} className="cursor-pointer border-b border-line-light last:border-0 hover:bg-hover">
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-ink-soft">{fmt(e.timestamp)}</td>
                <td className="px-3 py-2.5 font-semibold text-ink">{name(e.user_id)}</td>
                <td className="px-3 py-2.5"><Badge tone={TONE[e.action]}>{e.action}</Badge></td>
                <td className="px-3 py-2.5 text-ink-soft">
                  <span className="text-ink-muted">{e.entity} ·</span> {e.entity_label}
                </td>
                {session.role === 'Super Admin' && <td className="px-4 py-2.5 text-ink-soft">{orgName(e.org_id)}</td>}
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-muted">No entries match these filters.</td></tr>
            )}
          </tbody>
        </table>
        <div className="border-t border-line px-4 py-2 text-xs text-ink-muted">{rows.length} entries{rows.length > 200 ? ' (showing latest 200)' : ''}</div>
      </div>

      {open && (
        <Drawer open onClose={() => setOpen(null)} title={`${open.action} · ${open.entity}`} sub={open.entity_label}>
          <dl className="mb-5 grid grid-cols-2 gap-4 text-sm">
            <div><dt className="label">When</dt><dd>{fmt(open.timestamp)}</dd></div>
            <div><dt className="label">Actor</dt><dd>{name(open.user_id)}</dd></div>
            <div><dt className="label">Record ID</dt><dd className="font-mono text-xs">{open.entity_id}</dd></div>
            <div><dt className="label">Source</dt><dd>{open.source_tag}</dd></div>
            {session.role === 'Super Admin' && <div><dt className="label">Org</dt><dd>{orgName(open.org_id)}</dd></div>}
            <div><dt className="label">Entry ID</dt><dd className="font-mono text-xs">{open.audit_id}</dd></div>
          </dl>
          {open.before || open.after ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-gold text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  <th className="py-2 pr-2">Field</th>
                  <th className="py-2 pr-2">Before</th>
                  <th className="py-2">After</th>
                </tr>
              </thead>
              <tbody>
                {[...new Set([...Object.keys(open.before ?? {}), ...Object.keys(open.after ?? {})])].map((k) => (
                  <tr key={k} className="border-b border-line-light align-top">
                    <td className="py-2 pr-2 font-mono text-ink-soft">{k}</td>
                    <td className="break-all py-2 pr-2 text-crit">{open.before ? show(open.before[k]) : '—'}</td>
                    <td className="break-all py-2 text-ok">{open.after ? show(open.after[k]) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-ink-muted">No field changes recorded for this action.</p>
          )}
          <p className="mt-6 rounded-md bg-royal-soft px-3 py-2 text-[11px] text-royal">Audit entries are immutable — there is no edit or delete.</p>
        </Drawer>
      )}
    </>
  )
}
