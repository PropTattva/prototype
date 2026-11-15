import { useState } from 'react'
import type { Session } from '../../access/session'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import { DOC_TYPES, type BuildingDocument } from '../../domain/assets'
import type { OptionCtx } from '../../entities/types'
import { expiryStatus } from '../../lib/dates'
import { linkFor } from '../../lib/links'
import { href, navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import EntityPage from '../../components/crud/EntityPage'
import PageHeader from '../../components/ui/PageHeader'
import Modal from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import UpgradeGate from '../../components/ui/UpgradeGate'

const DOT = { Current: 'bg-ok', Expiring: 'bg-warn', Expired: 'bg-crit', Missing: 'bg-crit', 'Not filed': 'bg-line' } as const

/** v6 Compliance Vault on BuildingDocument (E1-S19): one tile per category, a dot per building. */
export default function Vault({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const [category, ...more] = rest
  const [managing, setManaging] = useState(false)
  const { data } = useApi(async () => {
    const [docs, ctx] = await Promise.all([api.list('document', session), api.getOptionCtx(session)])
    return { docs: docs as BuildingDocument[], ctx }
  }, [session.user.user_id])
  if (!api.hasFeature(session, 'documents')) return <UpgradeGate session={session} feature="documents" />
  if (!data) return null
  const { docs, ctx } = data
  const active = ctx.buildings.filter((b) => b.status !== 'Inactive')

  if (category) {
    const type = decodeURIComponent(category)
    return (
      <EntityPage
        entity="document"
        basePath={`vault/${encodeURIComponent(type)}`}
        rest={more}
        title={type === 'all' ? 'All documents' : type}
        subtitle={<a href={href('vault')} className="font-semibold text-royal hover:underline">← Compliance Vault</a>}
        linkTo={linkFor(session)}
        filter={type === 'all' ? undefined : (r) => r.type === type}
        newLabel="Upload document"
      />
    )
  }

  // Standard categories for every building; an org's own categories only for that org's buildings.
  const std = new Set<string>(DOC_TYPES)
  const custom = [...new Set(ctx.docTypes.filter((t) => t.active || docs.some((d) => d.type === t.name)).map((t) => t.name))].filter((n) => !std.has(n))
  const tiles = [...DOC_TYPES, ...custom].map((type) => {
    const orgs = new Set(ctx.docTypes.filter((t) => t.name === type).map((t) => t.org_id))
    const dots = active.filter((b) => std.has(type) || orgs.has(b.org_id)).map((b) => {
      const doc = docs.filter((d) => d.type === type && d.building_id === b.building_id).sort((a, c) => (c.validity ?? '9999').localeCompare(a.validity ?? '9999'))[0]
      // A custom type is not required everywhere, so a building without one is "not filed" rather than missing.
      return { b, status: doc ? (doc.validity ? expiryStatus(doc.validity) : 'Current') : std.has(type) ? 'Missing' : 'Not filed' } as const
    })
    const count = (s: string) => dots.filter((d) => d.status === s).length
    return { type, custom: !std.has(type), dots, total: docs.filter((d) => d.type === type).length, expiring: count('Expiring'), expired: count('Expired'), missing: count('Missing') }
  })
  const totals = tiles.reduce((t, x) => ({ docs: t.docs + x.total, expiring: t.expiring + x.expiring, expired: t.expired + x.expired, missing: t.missing + x.missing }), { docs: 0, expiring: 0, expired: 0, missing: 0 })

  return (
    <>
      <PageHeader
        title="Compliance Vault"
        subtitle={`${tiles.length} categories · ${totals.docs} documents across ${active.length} buildings · never deleted, only renewed`}
        right={
          <>
            <button className="btn" onClick={() => navigate('vault/all')}>All documents</button>
            {api.permissions('document', session).create && !session.readOnly && <button className="btn" onClick={() => setManaging(true)}>Document types</button>}
            {api.permissions('document', session).create && <button className="btn btn-gold" onClick={() => navigate('vault/all/new')}>+ Upload</button>}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-line bg-white px-4 py-2.5 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-ok" /> Current</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-warn" /> Expiring ≤ 90 days <b className="text-ink">{totals.expiring}</b></span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-crit" /> Expired or missing <b className="text-ink">{totals.expired + totals.missing}</b></span>
        {custom.length > 0 && <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-line" /> Not filed (custom types)</span>}
        <span className="text-ink-muted">One dot per building — hover for the building name.</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
        {tiles.map((t) => (
          <button key={t.type} onClick={() => navigate(`vault/${encodeURIComponent(t.type)}`)} className="rounded-[7px] border border-line bg-white p-3.5 text-left transition hover:border-royal">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs font-bold text-ink">
              {t.type}
              {t.custom && <span className="rounded bg-gold/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-gold">Custom</span>}
            </div>
            <div className="text-[10px] text-ink-muted">
              {t.total} doc{t.total === 1 ? '' : 's'}
              {t.expiring ? ` · ${t.expiring} expiring` : ''}
              {t.expired ? ` · ${t.expired} expired` : ''}
              {t.missing ? ` · ${t.missing} missing` : ''}
              {!t.total && !t.missing ? ' · none filed yet' : !t.expiring && !t.expired && !t.missing ? ' · all current' : ''}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1">
              {t.dots.map(({ b, status }) => <i key={b.building_id} title={`${b.name}: ${status}`} className={`h-2 w-2 rounded-full ${DOT[status]}`} />)}
            </div>
          </button>
        ))}
      </div>
      {managing && <DocTypes session={session} ctx={ctx} docs={docs} onClose={() => setManaging(false)} />}
    </>
  )
}

/** The org's own vault categories: add, retire (hidden from new uploads) or restore. Standard ones are fixed. */
function DocTypes({ session, ctx, docs, onClose }: { session: Session; ctx: OptionCtx; docs: BuildingDocument[]; onClose: () => void }) {
  const toast = useToast()
  // Internal roles work across orgs, so they choose whose list to change.
  const orgIds = [...new Set(ctx.buildings.map((b) => b.org_id))]
  const multi = orgIds.length > 1
  const [org, setOrg] = useState(multi ? orgIds[0] : session.org.org_id)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const orgName = (id: string) => ctx.organisations.find((o) => o.org_id === id)?.name ?? id
  const target = multi ? org : (orgIds[0] ?? session.org.org_id)
  const list = ctx.docTypes.filter((t) => t.org_id === target)
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast('ok', ok)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const add = () =>
    run(async () => {
      await api.addDocType(name, session, { orgId: target })
      setName('')
    }, `“${name.trim()}” added — your team can now upload documents under it.`)

  return (
    <Modal title="Document types" onClose={onClose} actions={<button className="btn" onClick={onClose}>Done</button>}>
      <p className="mb-3">The 12 standard types are always available. Add your own for anything else your team files — they appear in the upload form and as a vault category for {multi ? 'that organisation' : 'your whole organisation'}.</p>
      {multi && (
        <select aria-label="Organisation" className="input mb-3" value={org} onChange={(e) => setOrg(e.target.value)}>
          {orgIds.map((id) => <option key={id} value={id}>{orgName(id)}</option>)}
        </select>
      )}
      <div className="mb-3 flex gap-1.5">
        <input
          className="input"
          aria-label="New document type"
          placeholder="e.g. DG Set Licence, Lift AMC"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && !busy && add()}
        />
        <button className="btn btn-primary" disabled={!name.trim() || busy} onClick={add}>Add</button>
      </div>
      {list.length ? (
        <ul className="divide-y divide-line-light rounded-lg border border-line">
          {list.map((t) => {
            const n = docs.filter((d) => d.type === t.name && d.org_id === t.org_id).length
            return (
              <li key={t.name} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  <span className={`font-semibold ${t.active ? 'text-ink' : 'text-ink-muted line-through'}`}>{t.name}</span>
                  <span className="ml-2 text-[11px] text-ink-muted">{n} document{n === 1 ? '' : 's'}{t.active ? '' : ' · retired'}</span>
                </span>
                <button
                  className="btn shrink-0 py-1 text-[11px]"
                  disabled={busy}
                  onClick={() => run(() => api.setDocTypeActive(t.name, !t.active, session, t.org_id), t.active ? `“${t.name}” retired — existing documents keep it.` : `“${t.name}” restored.`)}
                >
                  {t.active ? 'Retire' : 'Restore'}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[12px] text-ink-muted">No custom types yet.</p>
      )}
    </Modal>
  )
}
