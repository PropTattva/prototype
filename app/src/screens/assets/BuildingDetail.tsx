import { useState, type ReactNode } from 'react'
import type { Session } from '../../access/session'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { Building, BuildingImage, OwnerContact } from '../../domain/assets'
import { entityDef } from '../../entities/registry'
import type { EntityKey, OptionCtx } from '../../entities/types'
import { fmtSft } from '../../lib/format'
import { linkFor } from '../../lib/links'
import { href, navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import EntityPage from '../../components/crud/EntityPage'
import { FieldValue } from '../../components/crud/fields'
import RecordDrawer from '../../components/crud/RecordDrawer'
import StackingPlan from '../../components/StackingPlan'
import Badge, { StatusBadge } from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import KpiCard from '../../components/ui/KpiCard'
import { useToast } from '../../components/ui/Toast'
import FloorGrid from './FloorGrid'
import ParkingPanel from '../../components/ParkingPanel'
import GradeCalculator from './GradeCalculator'

interface Tab {
  key: string
  label: string
  entity?: EntityKey
}

const TABS: Tab[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'floors', label: 'Floors', entity: 'floor' },
  { key: 'stacking', label: 'Stacking plan', entity: 'floor' },
  { key: 'units', label: 'Units', entity: 'unit' },
  { key: 'leases', label: 'Leases', entity: 'lease' },
  { key: 'documents', label: 'Documents', entity: 'document' },
  { key: 'images', label: 'Images', entity: 'image' },
  { key: 'certifications', label: 'Certifications', entity: 'certification' },
  { key: 'amenities', label: 'Amenities', entity: 'buildingAmenity' },
  { key: 'parking', label: 'Parking', entity: 'bay' },
  { key: 'title', label: 'Title chain', entity: 'ownershipHistory' },
  { key: 'ownership', label: 'Ownership', entity: 'ownerContact' },
  { key: 'mandate', label: 'Mandate', entity: 'mandate' },
  { key: 'assessment', label: 'Assessments', entity: 'assessment' },
]

/** One building: every E1 child record on a tab, each tab a scoped CRUD list. */
export default function BuildingDetail({ id, rest }: { id: string; rest: string[] }) {
  const session = useAuthed()
  const { data: b, error } = useApi(() => api.get('building', id, session), [id, session.user.user_id])
  const { data: ctx } = useApi(() => api.getOptionCtx(session), [session.user.user_id])
  const [tabKey = 'overview', ...more] = rest

  if (error) return <p className="rounded-lg border border-crit/30 bg-crit-bg px-4 py-3 text-sm text-crit">{error.message}</p>
  if (!b || !ctx) return null
  const building = b as Building
  // A tab is offered when the viewer may read its entity (plan feature included).
  const tabs = TABS.filter((t) => !t.entity || api.permissions(t.entity, session).read)
  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0]
  const base = `buildings/${id}/${tab.key}`
  const campus = ctx.campuses.find((c) => c.campus_id === building.campus_id)
  const floors = ctx.floors.filter((f) => f.building_id === id)
  const leasable = floors.filter((f) => f.floor_use !== 'Parking')
  const area = leasable.reduce((s, f) => s + (f.chargeable_area ?? 0), 0)
  const vacant = leasable.filter((f) => f.occupancy_type === 'Vacant').reduce((s, f) => s + (f.chargeable_area ?? 0), 0)
  const owner = ctx.owners.find((o) => o.owner_id === building.owner_id)
  const editing = tab.key === 'overview' && more[0] === 'edit'

  const embedded = (entity: EntityKey, extra: Partial<Parameters<typeof EntityPage>[0]> = {}) => (
    <EntityPage key={entity + tab.key} entity={entity} basePath={base} rest={more} linkTo={linkFor(session)} embedded where={{ building_id: id }} {...extra} />
  )

  let body: ReactNode
  switch (tab.key) {
    case 'overview':
      body = <Overview session={session} b={building} ctx={ctx} />
      break
    case 'floors':
      body = more.length ? embedded('floor') : <FloorGrid session={session} buildingId={id} basePath={base} />
      break
    case 'stacking':
      body = <BuildingStacking session={session} id={id} />
      break
    case 'leases':
      body = embedded('lease', { rowHref: (r) => href(`leases/${r.lease_id}`), onNew: () => navigate(`leases/new/${id}`), newLabel: 'New lease' })
      break
    case 'images':
      body = more.length ? embedded('image') : <Gallery session={session} id={id} base={base} />
      break
    case 'ownership':
      body = <Ownership session={session} b={building} base={base} more={more} />
      break
    case 'parking':
      body = <ParkingPanel session={session} buildingId={id} base={base} rest={more} />
      break
    case 'mandate':
      body = embedded('mandate', { rowHref: (r) => href(`mandates/${r.mandate_id}`), emptyText: 'No mandate on this building.' })
      break
    case 'assessment':
      body = embedded('assessment', { rowHref: (r) => href(`assessments/${r.assessment_id}`), onNew: () => navigate('assessments/new'), newLabel: 'Start site audit', emptyText: 'No AA assessment yet.' })
      break
    default:
      body = embedded(tab.entity!)
  }

  return (
    <>
      <div className="mb-1 text-xs text-ink-muted">
        <a href={href('buildings')} className="font-semibold text-royal hover:underline">Buildings</a>
        {campus && <> / <a href={href(`campuses/${campus.campus_id}`)} className="hover:underline">{campus.name}</a></>}
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold tracking-tight text-royal">{building.name}</h1>
          <p className="mt-0.5 text-[13px] text-ink-soft">{[building.micro_market, building.city, owner?.name].filter(Boolean).join(' · ')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge status={building.status} />
            {building.grade && <Badge tone="gold">Grade {building.grade}</Badge>}
            <Badge tone="muted">{building.ownership_type}</Badge>
            {session.role !== 'Occupier' && session.role !== 'Enabler' && (building.published ? <Badge tone="ok">Published</Badge> : <Badge tone="muted">Not published</Badge>)}
          </div>
        </div>
        {api.permissions('building', session).update && tab.key === 'overview' && (
          <button className="btn btn-primary" onClick={() => navigate(`buildings/${id}/overview/edit`)}>Edit building</button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Chargeable area" value={fmtSft(building.total_area ?? area)} unit="sq ft" hint={campus ? campus.name : 'Standalone'} />
        <KpiCard label="Floors" value={floors.length} hint={`${floors.filter((f) => f.floor_use === 'Parking').length} parking`} />
        <KpiCard label="Occupancy" value={area ? (((area - vacant) / area) * 100).toFixed(1) : '—'} unit={area ? '%' : ''} hint={building.status === 'Pre-OC' ? 'Under construction' : 'By leasable area'} />
        <KpiCard label="Vacant" value={vacant ? fmtSft(vacant) : 0} unit="sq ft" hint={`${leasable.filter((f) => f.occupancy_type === 'Vacant').length} floors`} />
      </div>

      <nav className="mb-4 flex gap-0.5 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={href(`buildings/${id}/${t.key}`)}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] font-semibold ${t.key === tab.key ? 'border-gold text-royal' : 'border-transparent text-ink-soft hover:text-royal'}`}
          >
            {t.label}
          </a>
        ))}
      </nav>
      {body}
      {editing && (
        <RecordDrawer
          entity="building"
          id={id}
          mode="edit"
          session={session}
          ctx={ctx}
          linkTo={linkFor(session)}
          defaultOrgId={null}
          onClose={() => navigate(`buildings/${id}`)}
          onMode={() => navigate(`buildings/${id}`)}
        />
      )}
    </>
  )
}

function Overview({ session, b, ctx }: { session: Session; b: Building; ctx: OptionCtx }) {
  const toast = useToast()
  const def = entityDef('building')
  const [calc, setCalc] = useState(false)
  const { data: images } = useApi(() => (api.permissions('image', session).read ? api.list('image', session, { building_id: b.building_id }) : Promise.resolve([])), [b.building_id])
  const { data: certs } = useApi(() => api.list('certification', session, { building_id: b.building_id }), [b.building_id])
  const cover = (images as BuildingImage[] | undefined)?.find((i) => i.is_cover) ?? (images as BuildingImage[] | undefined)?.[0]
  const campusAmenities = useApi(
    () => (b.campus_id && api.permissions('campusAmenity', session).read ? api.list('campusAmenity', session, { campus_id: b.campus_id }) : Promise.resolve([])),
    [b.campus_id],
  ).data
  const canOwners = ctx.owners.some((o) => o.owner_id === b.owner_id)
  // Show the owner record where the viewer can read it, otherwise the owning org's name.
  const fields = def.fields.filter((f) => (!f.system || f.key === 'org_id') && f.key !== 'name' && f.key !== (canOwners ? 'org_id' : 'owner_id') && (!f.showIf || f.showIf(b)))

  return (
    <div className="grid gap-3.5 xl:grid-cols-[1.5fr_1fr]">
      <Card title="Building profile">
        <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className={f.type === 'partners' || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <dt className="label">{f.label}</dt>
              <dd className="text-sm text-ink"><FieldValue f={f} rec={b} ctx={ctx} /></dd>
            </div>
          ))}
        </dl>
      </Card>
      <div className="space-y-3.5">
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          {cover?.data_url ? (
            <img src={cover.data_url} alt={cover.caption ?? b.name} className="h-44 w-full object-cover" />
          ) : (
            <div className="flex h-44 items-center justify-center bg-gradient-to-br from-royal-soft to-white text-xs text-ink-muted">No cover image yet</div>
          )}
          <div className="flex items-center justify-between px-4 py-2.5 text-xs">
            <span className="font-mono text-ink-soft">{b.lat != null ? `${b.lat}, ${b.long}` : 'No coordinates'}</span>
            {b.lat != null && (
              <a className="font-semibold text-royal hover:underline" href={`https://www.openstreetmap.org/?mlat=${b.lat}&mlon=${b.long}#map=15/${b.lat}/${b.long}`} target="_blank" rel="noreferrer">Map ↗</a>
            )}
          </div>
        </div>
        <Card title="Grade" action={<button className="text-xs font-semibold text-royal hover:underline" onClick={() => setCalc(true)}>Grade calculator</button>}>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-extrabold text-royal">{b.grade ?? '—'}</span>
            <span className="text-xs text-ink-soft">
              {b.grade ? (
                <>
                  {b.grade_source === 'AA scorecard' ? <b className="text-ok">Confirmed by AA scorecard</b> : b.grade_source === 'Indicative (calculator)' ? <b className="text-warn">Indicative — awaiting AA scorecard</b> : 'Imported grade'}
                  {b.grade_assessed_at && ` · ${new Date(b.grade_assessed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                </>
              ) : 'Not graded yet — try the calculator.'}
            </span>
          </div>
          {!!certs?.length && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {certs.map((c) => <Badge key={c.cert_id} tone="ok">{c.scheme} {c.level}</Badge>)}
            </div>
          )}
        </Card>
        {!!campusAmenities?.length && (
          <Card title="Shared campus amenities">
            <ul className="space-y-1 text-[13px] text-ink-soft">
              {campusAmenities.map((a) => <li key={a.amenity_id}>{a.type}{a.capacity ? ` · capacity ${a.capacity}` : ''}</li>)}
            </ul>
          </Card>
        )}
      </div>
      {calc && (
        <GradeCalculator
          current={b.grade}
          canApply={api.permissions('building', session).update && (b.grade_source !== 'AA scorecard' || session.role === 'Super Admin' || session.role === 'AA')}
          onClose={() => setCalc(false)}
          onApply={async (g) => {
            try {
              await api.applyIndicativeGrade(b.building_id, g, session)
              toast('ok', `Indicative grade ${g} applied — an AA scorecard will confirm it.`)
              setCalc(false)
            } catch (e) {
              toast('error', (e as Error).message)
            }
          }}
        />
      )}
    </div>
  )
}

function BuildingStacking({ session, id }: { session: Session; id: string }) {
  const { data } = useApi(() => api.stackingPlan([id], session), [id, session.user.user_id])
  if (!data) return null
  return (
    <StackingPlan
      plans={data}
      onCell={(cell) => {
        if (cell.lease_id && api.permissions('lease', session).read) navigate(`leases/${cell.lease_id}`)
        else navigate(`buildings/${id}/floors/${cell.floor_id}`)
      }}
    />
  )
}

function Gallery({ session, id, base }: { session: Session; id: string; base: string }) {
  const { data } = useApi(() => api.list('image', session, { building_id: id }), [id, session.user.user_id])
  const perms = api.permissions('image', session)
  const images = ((data as BuildingImage[]) ?? []).sort((a, b) => a.display_order - b.display_order)
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-ink-muted">{images.length} of 20 images · the cover image appears on the building profile</p>
        {perms.create && images.length < 20 && <button className="btn btn-gold" onClick={() => navigate(`${base}/new`)}>+ Upload image</button>}
      </div>
      {images.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((i) => (
            <button key={i.image_id} onClick={() => navigate(`${base}/${i.image_id}`)} className="group overflow-hidden rounded-lg border border-line bg-white text-left hover:border-royal">
              {i.data_url ? <img src={i.data_url} alt={i.caption ?? ''} className="h-32 w-full object-cover" /> : <div className="h-32 bg-hover" />}
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                <span className="truncate font-semibold text-ink">{i.caption || i.type}</span>
                {i.is_cover && <Badge tone="gold">Cover</Badge>}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-line bg-white px-6 py-12 text-center text-sm text-ink-muted">
          No images yet. Exterior, amenity, typical-floor and parking-plan images help occupiers shortlist (E1-S05).
        </div>
      )}
    </>
  )
}

/** Owner contacts plus the strata mandate tracker (E1-S13/S14) and committee (E1-S15). */
function Ownership({ session, b, base, more }: { session: Session; b: Building; base: string; more: string[] }) {
  const { data } = useApi(() => api.list('ownerContact', session), [session.user.user_id])
  const contacts = (data as OwnerContact[] | undefined) ?? []
  const strata = contacts.filter((c) => c.building_id === b.building_id && c.role === 'Strata unit owner')
  const signedPct = strata.filter((c) => c.signed_mandate).reduce((s, c) => s + (c.ownership_pct ?? 0), 0)
  const threshold = b.mandate_threshold_pct ?? 0
  return (
    <div className="space-y-3.5">
      {b.ownership_type === 'Strata' && (
        <Card title="Strata mandate signatures" sub="A strata mandate is valid once owners holding the threshold share of area have signed (E1-S14).">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span>
              <strong className={signedPct >= threshold ? 'text-ok' : 'text-warn'}>{signedPct}% signed</strong>
              <span className="ml-2 text-xs text-ink-muted">needs {threshold}% · {strata.filter((c) => c.signed_mandate).length} of {strata.length} owners</span>
            </span>
            {signedPct >= threshold ? <Badge tone="ok">Mandate valid</Badge> : <Badge tone="warn">{threshold - signedPct}% more needed</Badge>}
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-hover">
            <div className={`h-full rounded-full ${signedPct >= threshold ? 'bg-ok' : 'bg-gold'}`} style={{ width: `${Math.min(100, signedPct)}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-royal-dark" style={{ left: `${threshold}%` }} title={`Threshold ${threshold}%`} />
          </div>
        </Card>
      )}
      {b.ownership_type === 'Multi-owner' && b.multi_owner_struct?.length > 0 && (
        <Card title="JV / consortium partners">
          <FieldValue f={entityDef('building').fields.find((f) => f.key === 'multi_owner_struct')!} rec={b} ctx={{} as OptionCtx} />
        </Card>
      )}
      <EntityPage
        entity="ownerContact"
        basePath={base}
        rest={more}
        linkTo={linkFor(session)}
        embedded
        filter={(r) => r.building_id === b.building_id || (r.building_id == null && r.owner_id === b.owner_id)}
        emptyText="No contacts for this building yet."
      />
    </div>
  )
}
