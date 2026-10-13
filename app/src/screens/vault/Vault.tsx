import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import { DOC_TYPES, type BuildingDocument } from '../../domain/assets'
import { expiryStatus } from '../../lib/dates'
import { linkFor } from '../../lib/links'
import { href, navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import EntityPage from '../../components/crud/EntityPage'
import PageHeader from '../../components/ui/PageHeader'
import UpgradeGate from '../../components/ui/UpgradeGate'

const DOT = { Current: 'bg-ok', Expiring: 'bg-warn', Expired: 'bg-crit', Missing: 'bg-crit' } as const

/** v6 Compliance Vault on BuildingDocument (E1-S19): one tile per category, a dot per building. */
export default function Vault({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const [category, ...more] = rest
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

  const tiles = DOC_TYPES.map((type) => {
    const dots = active.map((b) => {
      const doc = docs.filter((d) => d.type === type && d.building_id === b.building_id).sort((a, c) => (c.validity ?? '9999').localeCompare(a.validity ?? '9999'))[0]
      return { b, status: doc ? (doc.validity ? expiryStatus(doc.validity) : 'Current') : 'Missing' } as const
    })
    const count = (s: string) => dots.filter((d) => d.status === s).length
    return { type, dots, total: docs.filter((d) => d.type === type).length, expiring: count('Expiring'), expired: count('Expired'), missing: count('Missing') }
  })
  const totals = tiles.reduce((t, x) => ({ docs: t.docs + x.total, expiring: t.expiring + x.expiring, expired: t.expired + x.expired, missing: t.missing + x.missing }), { docs: 0, expiring: 0, expired: 0, missing: 0 })

  return (
    <>
      <PageHeader
        title="Compliance Vault"
        subtitle={`${DOC_TYPES.length} categories · ${totals.docs} documents across ${active.length} buildings · never deleted, only renewed`}
        right={
          <>
            <button className="btn" onClick={() => navigate('vault/all')}>All documents</button>
            {api.permissions('document', session).create && <button className="btn btn-gold" onClick={() => navigate('vault/all/new')}>+ Upload</button>}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-line bg-white px-4 py-2.5 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-ok" /> Current</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-warn" /> Expiring ≤ 90 days <b className="text-ink">{totals.expiring}</b></span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-crit" /> Expired or missing <b className="text-ink">{totals.expired + totals.missing}</b></span>
        <span className="text-ink-muted">One dot per building — hover for the building name.</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
        {tiles.map((t) => (
          <button key={t.type} onClick={() => navigate(`vault/${encodeURIComponent(t.type)}`)} className="rounded-[7px] border border-line bg-white p-3.5 text-left transition hover:border-royal">
            <div className="mb-1 text-xs font-bold text-ink">{t.type}</div>
            <div className="text-[10px] text-ink-muted">
              {t.total} docs
              {t.expiring ? ` · ${t.expiring} expiring` : ''}
              {t.expired ? ` · ${t.expired} expired` : ''}
              {t.missing ? ` · ${t.missing} missing` : ''}
              {!t.expiring && !t.expired && !t.missing ? ' · all current' : ''}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1">
              {t.dots.map(({ b, status }) => <i key={b.building_id} title={`${b.name}: ${status}`} className={`h-2 w-2 rounded-full ${DOT[status]}`} />)}
            </div>
          </button>
        ))}
      </div>
    </>
  )
}
